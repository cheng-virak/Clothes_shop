/**
 * One-shot migration: MySQL -> MongoDB.
 *
 * Reads the live MySQL database using the existing DB_* env vars and
 * writes the equivalent documents to MONGODB_URI. Safe to re-run: it
 * wipes the target collections first, so a failed half-migration is
 * fixed by running it again rather than by hand-cleaning Mongo.
 *
 *   node scripts/migrate-mysql-to-mongo.js            # migrate
 *   node scripts/migrate-mysql-to-mongo.js --verify   # counts only, no writes
 *
 * The relational ids are integers and Mongo uses ObjectIds, so every
 * table's old id is mapped to its new _id as we go and the maps are used
 * to rewrite the references (a product's category, an order's user, a
 * cart line's variant, and so on).
 */
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectMongo, disconnectMongo } from '../src/config/mongo.js';
import { User, Category, Product, Cart, Order, AuditLog, Settings } from '../src/models/index.js';

const verifyOnly = process.argv.includes('--verify');

async function main() {
  const sql = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    decimalNumbers: true,
  });
  await connectMongo();
  console.log(`MySQL  : ${env.db.host}/${env.db.database}`);
  console.log(`MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
  console.log('');

  if (verifyOnly) {
    await verify(sql);
    await sql.end();
    await disconnectMongo();
    return;
  }

  // Wipe target collections so a re-run is idempotent rather than additive.
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Cart.deleteMany({}),
    Order.deleteMany({}),
    AuditLog.deleteMany({}),
    Settings.deleteMany({}),
  ]);
  console.log('cleared target collections');

  const userIds = await migrateUsers(sql);
  const categoryIds = await migrateCategories(sql);
  const { productIds, variantIds } = await migrateProducts(sql, categoryIds);
  await migrateOrders(sql, userIds, productIds, variantIds);
  await migrateCarts(sql, userIds, productIds, variantIds);
  await migrateAuditLogs(sql, userIds);
  await migrateSettings(sql);

  console.log('');
  await verify(sql);

  await sql.end();
  await disconnectMongo();
}

async function migrateUsers(sql) {
  const [rows] = await sql.execute('SELECT * FROM users');
  const map = new Map();
  for (const r of rows) {
    const doc = await User.create({
      fullName: r.full_name,
      email: r.email,
      passwordHash: r.password_hash, // carried over as-is; bcrypt hashes stay valid
      phone: r.phone ?? null,
      role: r.role,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    });
    map.set(r.id, doc._id);
  }
  console.log(`users            ${rows.length}`);
  return map;
}

async function migrateCategories(sql) {
  const [rows] = await sql.execute('SELECT * FROM categories ORDER BY id');
  const map = new Map();
  // Two passes: every category must exist before parents can be linked,
  // since a parent may appear after its child in id order.
  for (const r of rows) {
    const doc = await Category.create({
      name: r.name,
      slug: r.slug,
      parent: null,
      imageUrl: r.image_url ?? null,
      sortOrder: r.sort_order ?? 0,
    });
    map.set(r.id, doc._id);
  }
  for (const r of rows) {
    if (r.parent_id) {
      await Category.updateOne({ _id: map.get(r.id) }, { parent: map.get(r.parent_id) });
    }
  }
  console.log(`categories       ${rows.length}`);
  return map;
}

async function migrateProducts(sql, categoryIds) {
  const [products] = await sql.execute('SELECT * FROM products ORDER BY id');
  const [variants] = await sql.execute(
    `SELECT v.*, s.code AS size_code, c.name AS color_name, c.hex_code AS color_hex
     FROM product_variants v
     JOIN sizes s ON s.id = v.size_id
     JOIN colors c ON c.id = v.color_id`
  );
  const [images] = await sql.execute('SELECT * FROM product_images ORDER BY sort_order');

  const productIds = new Map();
  const variantIds = new Map();

  for (const p of products) {
    const doc = new Product({
      title: p.title,
      slug: p.slug,
      description: p.description ?? null,
      basePrice: p.base_price,
      status: p.status,
      category: categoryIds.get(p.category_id),
      variants: variants
        .filter((v) => v.product_id === p.id)
        .map((v) => ({
          size: v.size_code,
          color: v.color_name,
          colorHex: v.color_hex ?? null,
          sku: v.sku,
          priceOverride: v.price_override ?? null,
          stockQuantity: v.stock_quantity,
        })),
      images: images
        .filter((i) => i.product_id === p.id)
        .map((i) => ({
          imageUrl: i.image_url,
          isPrimary: Boolean(i.is_primary),
          sortOrder: i.sort_order,
          width: i.width ?? null,
          height: i.height ?? null,
        })),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    });
    await doc.save();
    productIds.set(p.id, doc._id);

    // Embedded subdocs only get their _id once constructed, so the old
    // variant id -> new ObjectId map is built from the saved document.
    const sourceVariants = variants.filter((v) => v.product_id === p.id);
    sourceVariants.forEach((v, idx) => {
      variantIds.set(v.id, { productId: doc._id, variantId: doc.variants[idx]._id });
    });
  }

  console.log(`products         ${products.length}  (${variants.length} variants, ${images.length} images embedded)`);
  return { productIds, variantIds };
}

async function migrateOrders(sql, userIds, productIds, variantIds) {
  const [orders] = await sql.execute('SELECT * FROM orders ORDER BY id');
  const [items] = await sql.execute('SELECT * FROM order_items');
  const [history] = await sql.execute('SELECT * FROM order_status_history ORDER BY changed_at');

  for (const o of orders) {
    await Order.create({
      orderNumber: o.order_number,
      user: userIds.get(o.user_id),
      shipping: {
        name: o.shipping_name,
        phone: o.shipping_phone,
        line1: o.shipping_line1,
        line2: o.shipping_line2 || null,
        city: o.shipping_city,
        // '' was how "not collected" was stored once checkout dropped
        // these fields; normalise it to null on the way in.
        state: o.shipping_state || null,
        postal: o.shipping_postal || null,
        country: o.shipping_country || null,
      },
      subtotal: o.subtotal,
      shippingFee: o.shipping_fee,
      discountTotal: o.discount_total,
      taxTotal: o.tax_total,
      grandTotal: o.grand_total,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      orderStatus: o.order_status,
      trackingNumber: o.tracking_number ?? null,
      trackingCarrier: o.tracking_carrier ?? null,
      internalNotes: o.internal_notes ?? null,
      couponCode: o.coupon_code ?? null,
      placedAt: o.placed_at,
      updatedAt: o.updated_at,
      items: items
        .filter((i) => i.order_id === o.id)
        .map((i) => {
          const ref = i.variant_id ? variantIds.get(i.variant_id) : null;
          return {
            // null when the product was hard-deleted before the migration
            // (migration 012 nulled those), which the snapshot covers.
            productId: ref?.productId ?? null,
            variantId: ref?.variantId ?? null,
            productTitle: i.product_title,
            sku: i.sku,
            sizeCode: i.size_code,
            colorName: i.color_name,
            unitPrice: i.unit_price,
            quantity: i.quantity,
            lineTotal: i.line_total,
          };
        }),
      statusHistory: history
        .filter((h) => h.order_id === o.id)
        .map((h) => ({
          status: h.status,
          note: h.note ?? null,
          changedBy: h.changed_by_user_id ? userIds.get(h.changed_by_user_id) ?? null : null,
          changedAt: h.changed_at,
        })),
    });
  }
  console.log(`orders           ${orders.length}  (${items.length} items, ${history.length} history entries embedded)`);
}

async function migrateCarts(sql, userIds, productIds, variantIds) {
  const [rows] = await sql.execute('SELECT * FROM cart_items');
  const byUser = new Map();
  for (const r of rows) {
    const ref = variantIds.get(r.variant_id);
    if (!ref) continue; // variant no longer exists; nothing to point at
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push({
      product: ref.productId,
      variantId: ref.variantId,
      quantity: r.quantity,
      addedAt: r.created_at,
    });
  }
  for (const [userId, items] of byUser) {
    await Cart.create({ user: userIds.get(userId), items });
  }
  console.log(`carts            ${byUser.size}  (${rows.length} lines)`);
}

async function migrateAuditLogs(sql, userIds) {
  const [rows] = await sql.execute('SELECT * FROM audit_logs ORDER BY id');
  for (const r of rows) {
    await AuditLog.create({
      user: r.user_id ? userIds.get(r.user_id) ?? null : null,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id != null ? String(r.entity_id) : null,
      // Already JSON columns in MySQL; mysql2 hands them back parsed.
      before: r.before_json ?? null,
      after: r.after_json ?? null,
      ip: r.ip ?? null,
      createdAt: r.created_at,
    });
  }
  console.log(`auditLogs        ${rows.length}`);
}

async function migrateSettings(sql) {
  const [rows] = await sql.execute('SELECT * FROM settings WHERE id = 1');
  const s = rows[0];
  if (!s) {
    await Settings.create({});
    console.log('settings         1  (defaults, none found in MySQL)');
    return;
  }
  await Settings.create({
    storeName: s.store_name ?? undefined,
    contactEmail: s.contact_email ?? undefined,
    currency: s.currency ?? undefined,
    timezone: s.timezone ?? undefined,
    taxRate: s.tax_rate ?? undefined,
    flatShippingFee: s.flat_shipping_fee ?? undefined,
    freeShippingThreshold: s.free_shipping_threshold ?? undefined,
    lowStockThreshold: s.low_stock_threshold ?? undefined,
  });
  console.log('settings         1');
}

/** Row-count parity between the two databases — the check that the
 *  migration didn't silently drop anything. */
async function verify(sql) {
  const count = async (table) => {
    const [[row]] = await sql.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    return row.n;
  };

  const [mysqlVariants, mysqlImages, mysqlItems, mysqlHistory] = await Promise.all([
    count('product_variants'),
    count('product_images'),
    count('order_items'),
    count('order_status_history'),
  ]);

  const [variantAgg] = await Product.aggregate([{ $project: { n: { $size: '$variants' } } }, { $group: { _id: null, total: { $sum: '$n' } } }]);
  const [imageAgg] = await Product.aggregate([{ $project: { n: { $size: '$images' } } }, { $group: { _id: null, total: { $sum: '$n' } } }]);
  const [itemAgg] = await Order.aggregate([{ $project: { n: { $size: '$items' } } }, { $group: { _id: null, total: { $sum: '$n' } } }]);
  const [historyAgg] = await Order.aggregate([{ $project: { n: { $size: '$statusHistory' } } }, { $group: { _id: null, total: { $sum: '$n' } } }]);

  const rows = [
    ['users', await count('users'), await User.countDocuments()],
    ['categories', await count('categories'), await Category.countDocuments()],
    ['products', await count('products'), await Product.countDocuments()],
    ['  variants (embedded)', mysqlVariants, variantAgg?.total ?? 0],
    ['  images (embedded)', mysqlImages, imageAgg?.total ?? 0],
    ['orders', await count('orders'), await Order.countDocuments()],
    ['  items (embedded)', mysqlItems, itemAgg?.total ?? 0],
    ['  history (embedded)', mysqlHistory, historyAgg?.total ?? 0],
    ['auditLogs', await count('audit_logs'), await AuditLog.countDocuments()],
    ['settings', await count('settings'), await Settings.countDocuments()],
  ];

  console.log('PARITY CHECK          MySQL   Mongo');
  let ok = true;
  for (const [label, a, b] of rows) {
    const match = a === b;
    if (!match) ok = false;
    console.log(`${label.padEnd(22)}${String(a).padStart(5)}${String(b).padStart(8)}   ${match ? 'ok' : 'MISMATCH'}`);
  }
  console.log('');
  console.log(ok ? 'All counts match.' : 'MISMATCH — do not cut over until resolved.');
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
