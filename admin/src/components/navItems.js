import {
  HiOutlineViewGrid,
  HiOutlineShoppingBag,
  HiOutlineTag,
  HiOutlineCube,
  HiOutlineCollection,
  HiOutlineUsers,
  HiOutlineStar,
  HiOutlineTicket,
  HiOutlineClipboardList,
  HiOutlineCog,
} from 'react-icons/hi';

// Single source of truth for the sidebar — every section the spec named,
// whether or not it's built yet. A section with no page built still gets
// a real link here; App.jsx routes it to <NotBuiltYet>, never a 404 or a
// blank screen.
export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: HiOutlineViewGrid, exact: true },
  { label: 'Orders', to: '/orders', icon: HiOutlineShoppingBag },
  { label: 'Products', to: '/products', icon: HiOutlineTag },
  { label: 'Inventory', to: '/inventory', icon: HiOutlineCube },
  { label: 'Categories', to: '/categories', icon: HiOutlineCollection },
  { label: 'Customers', to: '/customers', icon: HiOutlineUsers },
  { label: 'Reviews', to: '/reviews', icon: HiOutlineStar },
  { label: 'Coupons', to: '/coupons', icon: HiOutlineTicket },
  { label: 'Audit log', to: '/audit-log', icon: HiOutlineClipboardList },
  { label: 'Settings', to: '/settings', icon: HiOutlineCog },
];
