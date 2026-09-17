import { Route, Routes } from 'react-router-dom';
import RequireAdmin from './components/RequireAdmin.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import NotBuiltYet from './pages/NotBuiltYet.jsx';
import Dashboard from './pages/Dashboard.jsx';
import OrdersList from './pages/Orders/OrdersList.jsx';
import OrderDetail from './pages/Orders/OrderDetail.jsx';
import ProductsList from './pages/Products/ProductsList.jsx';
import ProductEditor from './pages/Products/ProductEditor.jsx';
import CategoriesList from './pages/Categories/CategoriesList.jsx';
import InventoryList from './pages/Inventory/InventoryList.jsx';

// No "/admin" prefix anywhere — this whole app IS the admin, so its
// routes read the same way the storefront's do: "/", "/products", etc.
// Every path in navItems.js has a route here — either a real page or
// <NotBuiltYet>, so the sidebar never links to a blank/dead screen. The
// catch-all at the bottom covers everything NOT in the sidebar too.
function Protected({ roles, children }) {
  return (
    <RequireAdmin roles={roles}>
      <Layout>{children}</Layout>
    </RequireAdmin>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <Protected roles={['staff', 'admin']}>
            <Dashboard />
          </Protected>
        }
      />

      <Route
        path="/orders"
        element={
          <Protected roles={['staff', 'admin']}>
            <OrdersList />
          </Protected>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <Protected roles={['staff', 'admin']}>
            <OrderDetail />
          </Protected>
        }
      />

      <Route
        path="/products"
        element={
          <Protected roles={['admin']}>
            <ProductsList />
          </Protected>
        }
      />
      <Route
        path="/products/:id"
        element={
          <Protected roles={['admin']}>
            <ProductEditor />
          </Protected>
        }
      />

      <Route
        path="/inventory"
        element={
          <Protected roles={['staff', 'admin']}>
            <InventoryList />
          </Protected>
        }
      />
      <Route
        path="/categories"
        element={
          <Protected roles={['admin']}>
            <CategoriesList />
          </Protected>
        }
      />
      <Route
        path="/customers"
        element={
          <Protected roles={['staff', 'admin']}>
            <NotBuiltYet title="Customers" />
          </Protected>
        }
      />
      <Route
        path="/reviews"
        element={
          <Protected roles={['staff', 'admin']}>
            <NotBuiltYet title="Reviews" />
          </Protected>
        }
      />
      <Route
        path="/coupons"
        element={
          <Protected roles={['admin']}>
            <NotBuiltYet title="Coupons" />
          </Protected>
        }
      />
      <Route
        path="/audit-log"
        element={
          <Protected roles={['admin']}>
            <NotBuiltYet title="Audit log" />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected roles={['admin']}>
            <NotBuiltYet title="Settings" />
          </Protected>
        }
      />

      {/* Unmatched routes previously rendered a blank white page — now the
          sidebar stays visible and there's a real way back. */}
      <Route
        path="*"
        element={
          <Protected roles={['staff', 'admin']}>
            <NotFound />
          </Protected>
        }
      />
    </Routes>
  );
}
