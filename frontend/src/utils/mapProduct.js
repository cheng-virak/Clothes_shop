/**
 * Maps a raw row from GET /api/products or GET /api/products/:id into the
 * shape ProductCard / ProductDetail / useProductVariantSelection expect.
 * Used by both the list and detail pages so they can never drift apart.
 */
export function mapApiProductToCard(row) {
  const variants = row.variants ?? [];
  const colorMap = new Map(variants.map((v) => [v.color, v.colorHex]));

  // The list endpoint (GET /api/products) precomputes `primary_image`; the
  // detail endpoint (GET /api/products/:id) doesn't — it hands back the
  // full `images` array instead, ordered by sort_order, not by is_primary.
  // Picking images[0] as a stand-in for "the primary one" breaks the
  // moment an admin changes which image is primary without also
  // reordering — always resolve it from the is_primary flag itself.
  const primaryFromImages = row.images?.find((img) => img.is_primary)?.image_url;
  const image =
    row.primary_image || primaryFromImages || row.images?.[0]?.image_url || 'https://placehold.co/600x800?text=No+Image';

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    price: row.base_price,
    image,
    colors: Array.from(colorMap, ([name, hex]) => ({ name, hex })),
    variants,
  };
}
