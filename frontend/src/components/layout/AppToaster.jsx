import { Toaster } from 'react-hot-toast';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

// Tailwind's `sm:` breakpoint — matches every other responsive check in
// this app, so "desktop" means the same thing here as it does in CSS.
const DESKTOP_QUERY = '(min-width: 640px)';

/**
 * Bottom-left on desktop (unchanged — see the original comment this
 * replaced: never collides with the header, never overlaps the cart
 * drawer's right-anchored Checkout button). On phone, bottom-center sits
 * directly on top of the cart drawer's Checkout button and the sticky
 * bottom nav some pages have, so toasts anchor to the TOP there instead,
 * offset below the sticky header.
 */
export default function AppToaster() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  return (
    <Toaster
      position={isDesktop ? 'bottom-left' : 'top-center'}
      containerStyle={isDesktop ? { zIndex: 60 } : { zIndex: 60, top: 76 }}
      toastOptions={{ duration: 2500 }}
    />
  );
}
