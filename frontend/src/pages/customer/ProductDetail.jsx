import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ColorSwatches from '../../components/product/ColorSwatches.jsx';
import SizeSelector from '../../components/product/SizeSelector.jsx';
import QuantityStepper from '../../components/ui/QuantityStepper.jsx';
import { useProductVariantSelection } from '../../hooks/useProductVariantSelection.js';
import { getProduct } from '../../api/productApi.js';
import { mapApiProductToCard } from '../../utils/mapProduct.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { usesContainFit } from '../../utils/productImageFit.js';

function ProductDetailBody({ product }) {
  const [quantity, setQuantity] = useState(1);
  const {
    selectedColor,
    selectedSize,
    setSelectedSize,
    selectColor,
    sizes,
    showSizeSelector,
    unavailableSizes,
    selectedVariant,
    addToCart,
  } = useProductVariantSelection(product);

  const handleAddToCart = () => {
    const added = addToCart(quantity);
    if (added) setQuantity(1);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/products" className="mb-6 inline-block text-sm text-stone-500 hover:text-stone-900">
        ← Back to all products
      </Link>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="aspect-[3/4] overflow-hidden rounded-xl bg-stone-100">
          <img
            src={product.image}
            alt={product.title}
            className={
              usesContainFit(product.slug) ? 'h-full w-full object-contain p-8' : 'h-full w-full object-cover'
            }
          />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{product.title}</h1>
          <p className="mt-1 text-lg font-medium text-stone-700">{formatCurrency(product.price)}</p>

          {product.description && (
            <p className="mt-4 text-sm leading-relaxed text-stone-600">{product.description}</p>
          )}

          {product.colors?.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-stone-900">Color</h3>
              <ColorSwatches
                colors={product.colors}
                selectedColor={selectedColor}
                onSelect={selectColor}
                size="md"
              />
            </div>
          )}

          {showSizeSelector && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-stone-900">Size</h3>
              <SizeSelector
                sizes={sizes}
                selectedSize={selectedSize}
                onSelect={setSelectedSize}
                unavailableSizes={unavailableSizes}
              />
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-stone-900">Quantity</h3>
            <QuantityStepper
              quantity={quantity}
              max={selectedVariant?.stockQuantity ?? 99}
              onIncrement={() => setQuantity((q) => q + 1)}
              onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
            />
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            className="mt-8 w-full rounded-lg bg-stone-900 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700 active:scale-[0.98] sm:w-auto sm:px-10"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'not-found' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setProduct(null);

    getProduct(slug)
      .then((res) => {
        if (cancelled) return;
        setProduct(mapApiProductToCard(res.data));
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) {
          setStatus('not-found');
        } else {
          setErrorMessage(err.message);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === 'loading') {
    return <p className="py-24 text-center text-sm text-stone-500">Loading product…</p>;
  }

  if (status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-xl font-semibold text-stone-900">Product not found</h1>
        <p className="mt-2 text-sm text-stone-500">
          We couldn't find a product at this link. It may have been removed.
        </p>
        <Link to="/products" className="mt-6 inline-block text-sm font-medium underline">
          Back to all products
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-xl font-semibold text-stone-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        <Link to="/products" className="mt-6 inline-block text-sm font-medium underline">
          Back to all products
        </Link>
      </div>
    );
  }

  return <ProductDetailBody product={product} />;
}
