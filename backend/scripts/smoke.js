/**
 * End-to-end check of every API route against a real database.
 *
 *   npm run smoke --workspace=backend
 *
 * Runs the Express app IN-PROCESS via supertest, so there is no server to
 * start first and no port to be free. It exercises the whole stack the
 * way a client does — auth, validation, permissions, transactions,
 * constraints — which is the part that a unit test of a controller in
 * isolation would not have caught during the move to PostgreSQL.
 *
 * It writes to whatever DATABASE_URL points at, then deletes everything
 * it created (see cleanup() at the bottom). Every record it makes is
 * tagged with a timestamp so the cleanup can find its own rows and only
 * its own. Even so: point this at a development database, not one with
 * real orders in it.
 *
 * Requires the schema and seed data to be in place:
 *   npm run migrate --workspace=backend
 *   npm run seed    --workspace=backend
 */
import request from 'supertest';
import app from '../src/app.js';
import { query, closePool } from '../src/config/db.js';
import { storage } from '../src/storage/index.js';

const stamp = Date.now();
const customerEmail = `smoke${stamp}@example.test`;

let passed = 0;
const failures = [];
// Files the run stored directly; anything uploaded through the API is
// removed by the endpoints themselves when their product is deleted.
const storedFiles = [];

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

async function api(method, path, { token, body } = {}) {
  let req = request(app)[method.toLowerCase()](path);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) req = req.send(body);
  const res = await req;
  return { status: res.status, body: res.body };
}

async function run() {
  console.log('\n--- health + auth ---');
  const health = await api('GET', '/health');
  check('GET /health', health.status === 200 && health.body.status === 'ok', health.body);

  const adminLogin = await api('POST', '/api/auth/login', {
    body: { email: 'admin@shopeclothes.test', password: 'Admin123!' },
  });
  check('admin login', adminLogin.status === 200 && !!adminLogin.body?.data?.token, adminLogin.body);
  const adminToken = adminLogin.body?.data?.token;
  const adminId = adminLogin.body?.data?.user?.id;
  if (!adminToken) {
    throw new Error('Cannot continue without an admin session — has `npm run seed` been run?');
  }
  check('admin role is admin', adminLogin.body?.data?.user?.role === 'admin');
  check(
    'login does not leak the password hash',
    !JSON.stringify(adminLogin.body).includes('$2'),
    adminLogin.body
  );

  const badLogin = await api('POST', '/api/auth/login', {
    body: { email: 'admin@shopeclothes.test', password: 'wrong-password' },
  });
  check('wrong password -> 401', badLogin.status === 401, badLogin.body);

  const reg = await api('POST', '/api/auth/register', {
    body: {
      fullName: 'Smoke Shopper',
      email: customerEmail,
      password: 'Password123!',
      phone: '012345678',
    },
  });
  check('register customer', reg.status === 201 && reg.body?.data?.user?.role === 'customer', reg.body);
  const customerToken = reg.body?.data?.token;

  const dupe = await api('POST', '/api/auth/register', {
    body: { fullName: 'Dupe', email: customerEmail, password: 'Password123!' },
  });
  check('duplicate email -> 409', dupe.status === 409, dupe.body);

  const me = await api('GET', '/api/auth/me', { token: customerToken });
  check('GET /api/auth/me', me.status === 200 && me.body?.data?.email === customerEmail, me.body);

  const badToken = await api('GET', '/api/auth/me', { token: 'not-a-jwt' });
  check('bad token -> 401', badToken.status === 401, badToken.body);

  console.log('\n--- categories ---');
  const cats = await api('GET', '/api/categories');
  check('GET /api/categories', cats.status === 200 && cats.body.data.length >= 5, cats.body);
  check('top-level categories sort first', cats.body.data[0].parent_id === null, cats.body.data[0]);
  const tshirts = cats.body.data.find((c) => c.slug === 't-shirts');
  check('child category resolves parent_slug', tshirts?.parent_slug === 'men', tshirts);
  const menId = cats.body.data.find((c) => c.slug === 'men')?.id;

  const adminCats = await api('GET', '/api/admin/categories', { token: adminToken });
  check('GET /api/admin/categories', adminCats.status === 200, adminCats.body);
  const menRow = adminCats.body.data.find((c) => c.slug === 'men');
  check('category child_count counted in DB', menRow?.child_count === 1, menRow);
  check('category product_count is a number', typeof menRow?.product_count === 'number', menRow);

  const newCat = await api('POST', '/api/admin/categories', {
    token: adminToken,
    body: { name: `Smoke Hats ${stamp}` },
  });
  check('create category', newCat.status === 201 && !!newCat.body?.data?.id, newCat.body);
  const newCatId = newCat.body?.data?.id;

  const nestTooDeep = await api('POST', '/api/admin/categories', {
    token: adminToken,
    body: { name: `Smoke Deep ${stamp}`, parentId: tshirts.id },
  });
  check('parent that is itself a child -> 400', nestTooDeep.status === 400, nestTooDeep.body);

  const slugCheck = await api(
    'GET',
    `/api/admin/categories/check-slug?slug=${encodeURIComponent(`Smoke Hats ${stamp}`)}`,
    { token: adminToken }
  );
  check('check-slug reports taken', slugCheck.body?.data?.available === false, slugCheck.body);

  const reorder = await api('PATCH', `/api/admin/categories/${newCatId}/reorder`, {
    token: adminToken,
    body: { direction: 'up' },
  });
  check('reorder category', reorder.status === 200 && reorder.body?.data?.moved === true, reorder.body);

  console.log('\n--- products (admin create) ---');
  const createProduct = await api('POST', '/api/products', {
    token: adminToken,
    body: {
      title: `Smoke Tee ${stamp}`,
      description: 'A shirt used by the smoke test.',
      categoryId: menId,
      basePrice: 19.99,
      variants: [
        { sizeCode: 'M', colorName: 'Black', colorHex: '#000000', sku: `SMK-${stamp}-M`, stockQuantity: 10 },
        {
          sizeCode: 'L',
          colorName: 'Black',
          colorHex: '#000000',
          sku: `SMK-${stamp}-L`,
          stockQuantity: 4,
          priceOverride: 24.5,
        },
      ],
    },
  });
  check('create product', createProduct.status === 201 && !!createProduct.body?.data?.id, createProduct.body);
  const productId = createProduct.body?.data?.id;
  const productSlug = createProduct.body?.data?.slug;

  const dupeSku = await api('POST', '/api/products', {
    token: adminToken,
    body: {
      title: `Smoke Dupe ${stamp}`,
      categoryId: menId,
      basePrice: 10,
      variants: [{ sizeCode: 'S', colorName: 'Red', sku: `SMK-${stamp}-M`, stockQuantity: 1 }],
    },
  });
  check('duplicate SKU -> 409', dupeSku.status === 409, dupeSku.body);

  const badCategory = await api('POST', '/api/products', {
    token: adminToken,
    body: {
      title: `Smoke Orphan ${stamp}`,
      categoryId: '00000000-0000-4000-8000-000000000000',
      basePrice: 10,
      variants: [{ sizeCode: 'S', colorName: 'Red', sku: `ORPH-${stamp}`, stockQuantity: 1 }],
    },
  });
  check('unknown categoryId -> 400', badCategory.status === 400, badCategory.body);

  const draftPublic = await api('GET', `/api/products/${productSlug}`);
  check('draft product is 404 to the public', draftPublic.status === 404, draftPublic.body);

  const adminView = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check('admin can read a draft', adminView.status === 200, adminView.body);
  check('admin detail returns variants', adminView.body?.data?.variants?.length === 2, adminView.body?.data?.variants);
  check(
    'price_override wins over base_price',
    adminView.body?.data?.variants.find((v) => v.size === 'L')?.price === 24.5,
    adminView.body?.data?.variants
  );
  check(
    'base_price is a number, not a string',
    typeof adminView.body?.data?.base_price === 'number',
    typeof adminView.body?.data?.base_price
  );

  const activate = await api('PATCH', `/api/admin/products/${productId}/status`, {
    token: adminToken,
    body: { status: 'active' },
  });
  check('activate product', activate.status === 200, activate.body);

  console.log('\n--- product images (multipart) ---');
  // 1x1 transparent PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  async function uploadImage() {
    const res = await request(app)
      .post(`/api/products/${productId}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', png, 'pixel.png');
    return { status: res.status, body: res.body };
  }
  const img1 = await uploadImage();
  check('upload first image', img1.status === 201, img1.body);
  check('first image becomes primary', img1.body?.data?.is_primary === true, img1.body);
  const img2 = await uploadImage();
  check('upload second image', img2.status === 201, img2.body);
  check('second image is not primary', img2.body?.data?.is_primary === false, img2.body);

  const setPrimary = await api(
    'PATCH',
    `/api/products/${productId}/images/${img2.body.data.id}/primary`,
    { token: adminToken }
  );
  check('set primary image', setPrimary.status === 200, setPrimary.body);
  const afterPrimary = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  const primaries = afterPrimary.body.data.images.filter((i) => i.is_primary);
  check(
    'exactly one primary image',
    primaries.length === 1 && primaries[0].id === img2.body.data.id,
    afterPrimary.body.data.images
  );

  const delImg = await api('DELETE', `/api/products/${productId}/images/${img2.body.data.id}`, {
    token: adminToken,
  });
  check('delete primary image', delImg.status === 200, delImg.body);
  const afterDelete = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check(
    'remaining image is promoted to primary',
    afterDelete.body.data.images.length === 1 && afterDelete.body.data.images[0].is_primary === true,
    afterDelete.body.data.images
  );

  console.log('\n--- storefront reads ---');
  const bySlug = await api('GET', `/api/products/${productSlug}`);
  check('GET product by slug', bySlug.status === 200 && bySlug.body?.data?.id === productId, bySlug.body);
  const byId = await api('GET', `/api/products/${productId}`);
  check('GET product by uuid', byId.status === 200 && byId.body?.data?.slug === productSlug, byId.body);
  const missing = await api('GET', '/api/products/no-such-product-slug');
  check('unknown slug -> 404', missing.status === 404, missing.body);

  const search = encodeURIComponent(`Smoke Tee ${stamp}`);
  const list = await api('GET', `/api/products?search=${search}`);
  check('search finds the product', list.status === 200 && list.body.data.length === 1, list.body);
  check('list carries variants', list.body.data[0]?.variants?.length === 2, list.body.data[0]);
  check('pagination total is a number', typeof list.body.pagination.total === 'number', list.body.pagination);

  const wildcard = await api('GET', '/api/products?search=%25');
  check('LIKE wildcard is escaped, not matched', wildcard.body.data.length === 0, wildcard.body.pagination);

  const byCategory = await api('GET', '/api/products?category=men&limit=100');
  check('filter by category slug', byCategory.body.data.some((p) => p.id === productId), byCategory.body.pagination);
  const unknownCategory = await api('GET', '/api/products?category=does-not-exist');
  check('unknown category returns nothing', unknownCategory.body.data.length === 0, unknownCategory.body.pagination);

  const sizeFilter = await api('GET', `/api/products?size=L&search=${search}`);
  check('filter by size', sizeFilter.body.data.length === 1, sizeFilter.body.pagination);
  const sizeMiss = await api('GET', `/api/products?size=XXL&search=${search}`);
  check('filter by absent size returns nothing', sizeMiss.body.data.length === 0, sizeMiss.body.pagination);

  const priceFilter = await api('GET', `/api/products?minPrice=100&search=${search}`);
  check('min price filter excludes', priceFilter.body.data.length === 0, priceFilter.body.pagination);

  const colors = await api('GET', '/api/products/colors');
  check(
    'GET /api/products/colors',
    colors.status === 200 && colors.body.data.some((c) => c.name === 'Black'),
    colors.body
  );

  const suggest = await api('GET', `/api/products/suggest?q=${search}`);
  check('GET /api/products/suggest', suggest.status === 200 && suggest.body.data.length === 1, suggest.body);

  console.log('\n--- cart ---');
  const variants = bySlug.body.data.variants;
  const variantM = variants.find((v) => v.size === 'M');
  const variantL = variants.find((v) => v.size === 'L');

  const add1 = await api('POST', '/api/cart', {
    token: customerToken,
    body: { variantId: variantM.variantId, quantity: 2 },
  });
  check('add to cart', add1.status === 201 && add1.body?.data?.quantity === 2, add1.body);
  const add2 = await api('POST', '/api/cart', {
    token: customerToken,
    body: { variantId: variantM.variantId, quantity: 3 },
  });
  check('adding again increments the same line', add2.body?.data?.quantity === 5, add2.body);

  const overStock = await api('POST', '/api/cart', {
    token: customerToken,
    body: { variantId: variantM.variantId, quantity: 99 },
  });
  check('over-stock add -> 409', overStock.status === 409, overStock.body);

  const addL = await api('POST', '/api/cart', {
    token: customerToken,
    body: { variantId: variantL.variantId, quantity: 1 },
  });
  check('add second variant', addL.status === 201, addL.body);

  const cart = await api('GET', '/api/cart', { token: customerToken });
  check('GET /api/cart', cart.status === 200 && cart.body.data.items.length === 2, cart.body);
  check(
    'cart subtotal is priced server-side',
    cart.body.data.subtotal === 5 * 19.99 + 24.5,
    cart.body.data.subtotal
  );
  check('cart line carries the primary image', cart.body.data.items[0].image !== null, cart.body.data.items[0]);

  const patchQty = await api('PATCH', `/api/cart/${variantM.variantId}`, {
    token: customerToken,
    body: { quantity: 2 },
  });
  check('update cart quantity', patchQty.status === 200 && patchQty.body.data.quantity === 2, patchQty.body);

  const removeL = await api('DELETE', `/api/cart/${variantL.variantId}`, { token: customerToken });
  check('remove cart line', removeL.status === 200, removeL.body);
  const removeAgain = await api('DELETE', `/api/cart/${variantL.variantId}`, { token: customerToken });
  check('removing a line twice -> 404', removeAgain.status === 404, removeAgain.body);

  const anon = await api('GET', '/api/cart');
  check('cart requires auth', anon.status === 401, anon.body);

  console.log('\n--- checkout ---');
  const checkout = await api('POST', '/api/orders', {
    token: customerToken,
    body: {
      shippingAddress: {
        recipientName: 'Smoke Shopper',
        phone: '012345678',
        line1: '1 Test Street',
        city: 'Phnom Penh',
      },
      paymentMethod: 'cod',
    },
  });
  check('create order', checkout.status === 201 && !!checkout.body?.data?.id, checkout.body);
  const orderId = checkout.body?.data?.id;
  check('order total = subtotal + shipping', checkout.body?.data?.grandTotal === 2 * 19.99 + 5, checkout.body?.data);

  const emptyCart = await api('GET', '/api/cart', { token: customerToken });
  check('cart is emptied by checkout', emptyCart.body.data.items.length === 0, emptyCart.body);

  const checkoutEmpty = await api('POST', '/api/orders', {
    token: customerToken,
    body: {
      shippingAddress: { recipientName: 'X', phone: '1234567', line1: 'a', city: 'b' },
      paymentMethod: 'cod',
    },
  });
  check('checkout with empty cart -> 400', checkoutEmpty.status === 400, checkoutEmpty.body);

  const afterCheckout = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  const stockM = afterCheckout.body.data.variants.find((v) => v.size === 'M').stockQuantity;
  check('stock decremented by checkout', stockM === 8, { stockM });

  const myOrders = await api('GET', '/api/orders/my-orders', { token: customerToken });
  check('GET /api/orders/my-orders', myOrders.status === 200 && myOrders.body.data.length === 1, myOrders.body);
  check('order carries its item snapshot', myOrders.body.data[0]?.items?.length === 1, myOrders.body.data[0]);
  check(
    'snapshot keeps the product title',
    myOrders.body.data[0]?.items[0]?.productTitle === `Smoke Tee ${stamp}`,
    myOrders.body.data[0]?.items[0]
  );

  console.log('\n--- admin orders ---');
  const adminOrders = await api('GET', '/api/admin/orders?limit=100', { token: adminToken });
  check('GET /api/admin/orders', adminOrders.status === 200, adminOrders.body);
  const listed = adminOrders.body.data.find((o) => o.id === orderId);
  check('order appears with customer name from the join', listed?.customer_name === 'Smoke Shopper', listed);
  check('item_count is computed', listed?.item_count === 1, listed);

  const searchOrders = await api('GET', `/api/admin/orders?q=${encodeURIComponent(customerEmail)}`, {
    token: adminToken,
  });
  check('search orders by customer email', searchOrders.body.data.length === 1, searchOrders.body.meta);

  const today = new Date().toISOString().slice(0, 10);
  const dateFiltered = await api('GET', `/api/admin/orders?from=2000-01-01&to=${today}&limit=100`, {
    token: adminToken,
  });
  check('date range filter includes today', dateFiltered.body.data.some((o) => o.id === orderId), dateFiltered.body.meta);

  const orderDetail = await api('GET', `/api/admin/orders/${orderId}`, { token: adminToken });
  check('GET /api/admin/orders/:id', orderDetail.status === 200, orderDetail.body);
  check('detail has items', orderDetail.body?.data?.items?.length === 1, orderDetail.body?.data?.items);
  check('detail has status history', orderDetail.body?.data?.statusHistory?.length === 1, orderDetail.body?.data?.statusHistory);
  check(
    'history names who changed it',
    orderDetail.body?.data?.statusHistory[0]?.changed_by_name === 'Smoke Shopper',
    orderDetail.body?.data?.statusHistory[0]
  );
  check('detail hides internal user_id', orderDetail.body?.data?.user_id === undefined, Object.keys(orderDetail.body?.data ?? {}));

  const illegal = await api('PATCH', `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: 'delivered' },
  });
  check('illegal transition -> 409', illegal.status === 409, illegal.body);

  const idempotent = await api('PATCH', `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: 'pending' },
  });
  check('same-status change is a no-op', idempotent.status === 200 && idempotent.body.data.changed === false, idempotent.body);

  const confirm = await api('PATCH', `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: 'confirmed', note: 'Confirmed by smoke test' },
  });
  check('pending -> confirmed', confirm.status === 200 && confirm.body.data.changed === true, confirm.body);

  const cancel = await api('PATCH', `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: 'cancelled' },
  });
  check('confirmed -> cancelled', cancel.status === 200 && cancel.body.data.stockRestored === true, cancel.body);

  const afterCancel = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check(
    'cancelling restores stock',
    afterCancel.body.data.variants.find((v) => v.size === 'M').stockQuantity === 10,
    afterCancel.body.data.variants
  );

  const cancelAgain = await api('PATCH', `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: 'cancelled' },
  });
  check('re-cancelling does not restock twice', cancelAgain.body?.data?.changed === false, cancelAgain.body);
  const afterRecancel = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check(
    'stock unchanged after repeated cancel',
    afterRecancel.body.data.variants.find((v) => v.size === 'M').stockQuantity === 10
  );

  const historyNow = await api('GET', `/api/admin/orders/${orderId}`, { token: adminToken });
  check('status history grew to 3', historyNow.body.data.statusHistory.length === 3, historyNow.body.data.statusHistory);
  check(
    'history is chronological',
    historyNow.body.data.statusHistory.map((h) => h.status).join(',') === 'pending,confirmed,cancelled',
    historyNow.body.data.statusHistory.map((h) => h.status)
  );

  console.log('\n--- admin products list + inventory ---');
  const adminList = await api('GET', `/api/admin/products?q=${search}`, { token: adminToken });
  check('admin product list', adminList.status === 200 && adminList.body.data.length === 1, adminList.body);
  const listedProduct = adminList.body.data[0];
  check('total_stock aggregated', listedProduct?.total_stock === 14, listedProduct);
  check('min_price aggregated', listedProduct?.min_price === 19.99, listedProduct);
  check('max_price aggregated', listedProduct?.max_price === 24.5, listedProduct);

  const bySku = await api('GET', `/api/admin/products?q=SMK-${stamp}-M`, { token: adminToken });
  check('admin search by SKU', bySku.body.data.length === 1, bySku.body.meta);

  const stockSort = await api('GET', '/api/admin/products?sort=stock_asc&limit=100', { token: adminToken });
  check('sort by stock works', stockSort.status === 200, stockSort.body?.message);

  const inventory = await api('GET', '/api/admin/inventory?limit=1000', { token: adminToken });
  check('GET /api/admin/inventory', inventory.status === 200, inventory.body);
  const invRow = inventory.body.data.find((r) => r.sku === `SMK-${stamp}-M`);
  check('inventory lists one row per variant', !!invRow && invRow.product_title === `Smoke Tee ${stamp}`, invRow);
  check('inventory joins the category', invRow?.category_slug === 'men', invRow);

  const importRows = [
    { sku: `SMK-${stamp}-M`, stockQuantity: 42 },
    { sku: 'NOPE-DOES-NOT-EXIST', stockQuantity: 7 },
  ];
  const preview = await api('POST', '/api/admin/inventory/import/preview', {
    token: adminToken,
    body: { rows: importRows },
  });
  check('import preview', preview.status === 200 && preview.body.data.length === 2, preview.body);
  check('preview computes delta', preview.body.data[0]?.delta === 32, preview.body.data[0]);
  check('preview flags unknown SKU', preview.body.data[1]?.found === false, preview.body.data[1]);

  const applyBad = await api('POST', '/api/admin/inventory/import/apply', {
    token: adminToken,
    body: { rows: importRows },
  });
  check('import with unknown SKU -> 400', applyBad.status === 400, applyBad.body);
  const afterBadImport = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check(
    'failed import changed nothing',
    afterBadImport.body.data.variants.find((v) => v.size === 'M').stockQuantity === 10,
    afterBadImport.body.data.variants
  );

  const applyGood = await api('POST', '/api/admin/inventory/import/apply', {
    token: adminToken,
    body: {
      rows: [
        { sku: `SMK-${stamp}-M`, stockQuantity: 42 },
        { sku: `SMK-${stamp}-L`, stockQuantity: 7 },
      ],
    },
  });
  check('import apply', applyGood.status === 200 && applyGood.body.data.updatedCount === 2, applyGood.body);
  check(
    'import reports before/after',
    applyGood.body.data.changes[0]?.from === 10 && applyGood.body.data.changes[0]?.to === 42,
    applyGood.body.data.changes
  );
  const afterImport = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check(
    'import applied to stock',
    afterImport.body.data.variants.find((v) => v.size === 'M').stockQuantity === 42,
    afterImport.body.data.variants
  );

  console.log('\n--- admin edits + permissions ---');
  const patchProduct = await api('PATCH', `/api/admin/products/${productId}`, {
    token: adminToken,
    body: { title: `Smoke Tee ${stamp} (edited)`, description: null },
  });
  check('patch product', patchProduct.status === 200, patchProduct.body);
  const patched = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check('title updated', patched.body.data.title === `Smoke Tee ${stamp} (edited)`, patched.body.data.title);
  check('description explicitly cleared to null', patched.body.data.description === null, patched.body.data.description);
  check('base_price left unchanged by partial patch', patched.body.data.base_price === 19.99, patched.body.data.base_price);
  check('slug is immutable', patched.body.data.slug === productSlug, patched.body.data.slug);

  const patchVariant = await api('PATCH', `/api/admin/products/${productId}/variants/${variantL.variantId}`, {
    token: adminToken,
    body: { priceOverride: null },
  });
  check('clear price override', patchVariant.status === 200, patchVariant.body);
  const clearedVariant = await api('GET', `/api/admin/products/${productId}`, { token: adminToken });
  check(
    'variant falls back to base price',
    clearedVariant.body.data.variants.find((v) => v.size === 'L').price === 19.99,
    clearedVariant.body.data.variants
  );

  const customerOnAdmin = await api('GET', '/api/admin/products', { token: customerToken });
  check('customer blocked from admin -> 403', customerOnAdmin.status === 403, customerOnAdmin.body);

  const badUuid = await api('GET', '/api/admin/products/not-a-uuid', { token: adminToken });
  check('malformed uuid -> 400', badUuid.status === 400, badUuid.body);

  const deleteCatInUse = await api('DELETE', `/api/admin/categories/${menId}`, { token: adminToken });
  check('deleting a category in use -> 409', deleteCatInUse.status === 409, deleteCatInUse.body);

  console.log('\n--- deletion ---');
  // Captured before the delete so cleanup can verify the endpoint removed
  // the stored file rather than orphaning it.
  const remainingImages = (await api('GET', `/api/admin/products/${productId}`, { token: adminToken })).body.data
    .images;

  const delProduct = await api('DELETE', `/api/admin/products/${productId}`, { token: adminToken });
  check('delete product', delProduct.status === 200, delProduct.body);
  check('delete reports detached order count', delProduct.body?.data?.orderCount === 1, delProduct.body);
  check('product had an image to clean up', remainingImages.length === 1, remainingImages);

  const ordersAfterDelete = await api('GET', '/api/orders/my-orders', { token: customerToken });
  check(
    'order history survives product deletion',
    ordersAfterDelete.body.data[0]?.items[0]?.productTitle === `Smoke Tee ${stamp}`,
    ordersAfterDelete.body.data[0]?.items
  );

  const delCat = await api('DELETE', `/api/admin/categories/${newCatId}`, { token: adminToken });
  check('delete unused category', delCat.status === 200, delCat.body);

  return { adminId };
}

/**
 * Removes everything the run created. Scoped to this run's own records:
 * the customer it registered (found by its timestamped email) and the
 * audit rows the admin wrote while it was running. It never truncates a
 * table, so an existing database keeps its own data.
 */
async function cleanup({ adminId, startedAt }) {
  const { rows: users } = await query('SELECT id FROM users WHERE email = $1', [customerEmail]);
  const ids = users.map((u) => u.id);

  if (ids.length > 0) {
    // orders.user_id is ON DELETE RESTRICT, so the orders go first.
    await query('DELETE FROM orders WHERE user_id = ANY($1)', [ids]);
    // The cart cascades with the user.
    await query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  }

  if (adminId) {
    await query('DELETE FROM audit_logs WHERE user_id = $1 AND created_at >= $2', [adminId, startedAt]);
  }

  for (const url of storedFiles) {
    await storage.remove(url).catch(() => {});
  }
}

const startedAt = new Date();
let context = {};
let runFailed = false;

try {
  context = await run();
} catch (err) {
  runFailed = true;
  console.error('\nSmoke run threw:', err.message);
} finally {
  try {
    await cleanup({ ...context, startedAt });
    console.log('\ncleanup: removed this run\'s records');
  } catch (err) {
    console.error('cleanup failed:', err.message);
  }
  await closePool().catch(() => {});
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failures.length > 0 || runFailed ? 1 : 0);
