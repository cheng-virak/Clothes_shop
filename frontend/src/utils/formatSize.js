/** 'ONE_SIZE' is a real size code in the data (so cart lines/orders can
 *  still match a specific variant) but is never meant to be shown to a
 *  shopper as a "size" — these products (totes, beanies, sunglasses, …)
 *  never had a size choice to begin with. */
export function isOneSize(size) {
  return size === 'ONE_SIZE';
}

/** For anywhere a size still needs a human label (there currently isn't
 *  one — One Size items omit the size entirely rather than showing this —
 *  but this exists so that choice lives in one place if that ever changes). */
export function formatSizeLabel(size) {
  return isOneSize(size) ? 'One Size' : size;
}
