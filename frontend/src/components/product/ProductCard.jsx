import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HiPlus } from 'react-icons/hi';
import ColorSwatches from './ColorSwatches.jsx';
import SizeSelector from './SizeSelector.jsx';
import QuickAddSheet from './QuickAddSheet.jsx';
import { useProductVariantSelection } from '../../hooks/useProductVariantSelection.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { usesContainFit } from '../../utils/productImageFit.js';

const MAX_COLOR_DOTS = 4;

/**
 * Expected `product` shape (see utils/mapProduct.js):
 * {
 *   id, slug, title, brand, price, image, hoverImage?,
 *   colors: [{ name, hex }],
 *   variants: [{ variantId, size, color, stockQuantity, price }],
 * }
 *
 * Two distinct layouts, split at `sm:` rather than shared-with-tweaks —
 * a 173px-wide phone card genuinely can't hold a variant picker once tap
 * targets are 44px, so on phone the card is image + title + price + a
 * non-interactive colour indicator, and all selection moves into the "+"
 * quick-add sheet or the product page. At sm: and up the original full
 * card (interactive swatches, size chips, Add to Cart) renders unchanged.
 */
export default function ProductCard({ product }) {
  const {
    selectedColor,
    selectedSize,
    setSelectedSize,
    selectColor,
    sizes,
    showSizeSelector,
    unavailableSizes,
    addToCart,
  } = useProductVariantSelection(product);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const containFit = usesContainFit(product.slug);
  const colors = product.colors ?? [];
  const dots = colors.slice(0, MAX_COLOR_DOTS);
  const extraColorCount = colors.length - dots.length;

  return (
    <div className="group flex flex-col">
      <Link
        to={`/products/${product.slug}`}
        className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-stone-100 sm:aspect-[3/4]"
      >
        <img
          src={product.image}
          alt={product.title}
          className={
            containFit
              ? 'h-full w-full object-contain p-6 transition-transform duration-300 ease-out group-hover:scale-105'
              : 'h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105'
          }
        />
        {product.hoverImage && (
          <img
            src={product.hoverImage}
            alt=""
            aria-hidden="true"
            className={
              containFit
                ? 'absolute inset-0 h-full w-full object-contain p-6 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100'
                : 'absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100'
            }
          />
        )}

        {/* Phone-only quick add. preventDefault stops the wrapping Link from
            navigating — tapping anywhere else on the card still should. */}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsQuickAddOpen(true);
          }}
          aria-label={`Quick add ${product.title}`}
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white text-stone-900 shadow-md transition active:scale-95 sm:hidden"
        >
          <HiPlus size={20} />
        </button>
      </Link>

      <div className="mt-2 flex flex-col gap-1 sm:mt-3 sm:gap-1.5">
        {/* Phone: price stacked under the title — side by side collides at 173px. */}
        <div className="sm:hidden">
          <Link
            to={`/products/${product.slug}`}
            className="line-clamp-2 text-xs font-medium text-stone-900 hover:underline"
          >
            {product.title}
          </Link>
          <p className="mt-0.5 text-xs font-semibold text-stone-900">{formatCurrency(product.price)}</p>
        </div>

        {/* sm: and up — the original title/price row, unchanged. */}
        <div className="hidden items-start justify-between gap-2 sm:flex">
          <div className="min-w-0">
            {product.brand && (
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                {product.brand}
              </p>
            )}
            <Link
              to={`/products/${product.slug}`}
              className="line-clamp-2 text-xs font-medium text-stone-900 hover:underline sm:text-sm"
            >
              {product.title}
            </Link>
          </div>
          <p className="whitespace-nowrap text-xs font-semibold text-stone-900 sm:text-sm">
            {formatCurrency(product.price)}
          </p>
        </div>

        {/* Phone: indicator, not a control — so no 44px tap target applies. */}
        {colors.length > 0 && (
          <div className="flex items-center gap-1 sm:hidden">
            <span className="sr-only">
              {colors.length} color{colors.length === 1 ? '' : 's'} available
            </span>
            {dots.map((color) => (
              <span
                key={color.name}
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full ring-1 ring-stone-300"
                style={{ backgroundColor: color.hex || '#d6d3d1' }}
              />
            ))}
            {extraColorCount > 0 && (
              <span aria-hidden="true" className="text-[10px] leading-none text-stone-500">
                +{extraColorCount}
              </span>
            )}
          </div>
        )}

        {/* sm: and up — full selection controls. The wrapper's own gap
            reproduces the spacing these had as direct flex siblings. */}
        <div className="hidden sm:flex sm:flex-col sm:gap-1.5">
          {colors.length > 0 && (
            <ColorSwatches colors={colors} selectedColor={selectedColor} onSelect={selectColor} />
          )}

          {showSizeSelector && (
            <SizeSelector
              sizes={sizes}
              selectedSize={selectedSize}
              onSelect={setSelectedSize}
              unavailableSizes={unavailableSizes}
            />
          )}

          <button
            type="button"
            onClick={() => addToCart(1)}
            className="mt-1 w-full rounded-lg bg-stone-900 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700 active:scale-[0.98]"
          >
            Add to Cart
          </button>
        </div>
      </div>

      <QuickAddSheet
        product={product}
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
      />
    </div>
  );
}
