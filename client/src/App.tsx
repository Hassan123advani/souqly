import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageSpinner } from '@/components/ui';
import { AppEffects } from '@/components/layout/AppEffects';
import { CartSync } from '@/components/cart/CartSync';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { MarketplaceLayout } from '@/components/layout/MarketplaceLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { RequireAuth, RequireGuest, RequirePlatformStaff, RequireSellerMode } from '@/routes/guards';

// ---- Lazy pages ----
const HomePage = lazy(() => import('@/pages/buyer/HomePage'));
const ComingSoonPage = lazy(() => import('@/pages/buyer/ComingSoonPage'));
const CategoriesPage = lazy(() => import('@/pages/buyer/CategoriesPage'));
const CategoryPage = lazy(() => import('@/pages/buyer/CategoryPage'));
const SearchPage = lazy(() => import('@/pages/buyer/SearchPage'));
const ProductPage = lazy(() => import('@/pages/buyer/ProductPage'));
const StorePage = lazy(() => import('@/pages/buyer/StorePage'));
const StoresPage = lazy(() => import('@/pages/buyer/StoresPage'));
const CampaignPage = lazy(() => import('@/pages/buyer/CampaignPage'));
const BrandPage = lazy(() => import('@/pages/buyer/BrandPage'));
const StaticPage = lazy(() => import('@/pages/static/StaticPage'));
const HelpPage = lazy(() => import('@/pages/static/HelpPage'));
const SellPage = lazy(() => import('@/pages/static/SellPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const CartPage = lazy(() => import('@/pages/cart/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/checkout/CheckoutPage'));
const CheckoutSuccessPage = lazy(() => import('@/pages/checkout/CheckoutSuccessPage'));
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/orders/OrderDetailPage'));

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));

const AccountLayout = lazy(() => import('@/pages/account/AccountLayout'));
const ProfilePage = lazy(() => import('@/pages/account/ProfilePage'));
const AddressesPage = lazy(() => import('@/pages/account/AddressesPage'));
const SecurityPage = lazy(() => import('@/pages/account/SecurityPage'));
const PreferencesPage = lazy(() => import('@/pages/account/PreferencesPage'));
const PrivacyDataPage = lazy(() => import('@/pages/account/PrivacyDataPage'));

const SellerLayout = lazy(() => import('@/components/layout/SellerLayout'));
const SellerOnboardingPage = lazy(() => import('@/pages/seller/SellerOnboardingPage'));
const SellerHomePage = lazy(() => import('@/pages/seller/SellerHomePage'));
const SellerFrame = lazy(() => import('@/components/seller/SellerFrame'));
const SellerProductsPage = lazy(() => import('@/pages/seller/products/ProductsPage'));
const SellerProductEditorPage = lazy(() => import('@/pages/seller/products/ProductEditorPage'));
const SellerInventoryPage = lazy(() => import('@/pages/seller/InventoryPage'));
const SellerOrdersPage = lazy(() => import('@/pages/seller/orders/OrdersPage'));
const SellerOrderDetailPage = lazy(() => import('@/pages/seller/orders/OrderDetailPage'));
const SellerStoreSettingsPage = lazy(() => import('@/pages/seller/StoreSettingsPage'));
const SellerStaffPage = lazy(() => import('@/pages/seller/StaffPage'));
const SellerSettingsPage = lazy(() => import('@/pages/seller/SettingsPage'));

const AdminLayout = lazy(() => import('@/components/layout/AdminLayout'));
const AdminHomePage = lazy(() => import('@/pages/admin/AdminHomePage'));
const AdminProfilePage = lazy(() => import('@/pages/admin/AdminProfilePage'));
const AdminSecurityPage = lazy(() => import('@/pages/admin/AdminSecurityPage'));

export function App() {
  return (
    <ErrorBoundary>
      <AppEffects />
      <CartSync />
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route element={<MarketplaceLayout />}>
            <Route index element={<HomePage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="c/:slug" element={<CategoryPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="p/:slug" element={<ProductPage />} />
            <Route path="store/:slug" element={<StorePage />} />
            <Route path="stores" element={<StoresPage />} />
            <Route path="mall" element={<StoresPage key="mall" mall />} />
            <Route path="campaign/:slug" element={<CampaignPage />} />
            <Route path="campaigns/:slug" element={<CampaignPage />} />
            <Route path="brand/:slug" element={<BrandPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="wishlist" element={<ComingSoonPage feature="wishlist" />} />
            <Route path="chat" element={<ComingSoonPage feature="chat" />} />
            <Route path="about" element={<StaticPage page="about" />} />
            <Route path="terms" element={<StaticPage page="terms" />} />
            <Route path="privacy" element={<StaticPage page="privacy" />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="sell" element={<SellPage />} />

            <Route element={<RequireAuth />}>
              <Route path="seller/onboarding" element={<SellerOnboardingPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="checkout/success/:number" element={<CheckoutSuccessPage />} />
              <Route path="account" element={<AccountLayout />}>
                <Route index element={<Navigate to="profile" replace />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="addresses" element={<AddressesPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:number" element={<OrderDetailPage />} />
                <Route path="security" element={<SecurityPage />} />
                <Route path="preferences" element={<PreferencesPage />} />
                <Route path="privacy" element={<PrivacyDataPage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route element={<AuthLayout />}>
            <Route element={<RequireGuest />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="signup" element={<SignupPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password" element={<ResetPasswordPage />} />
            </Route>
            <Route path="verify-email" element={<VerifyEmailPage />} />
          </Route>

          <Route
            path="seller"
            element={
              <RequireSellerMode>
                <SellerLayout />
              </RequireSellerMode>
            }
          >
            <Route element={<SellerFrame />}>
              <Route index element={<SellerHomePage />} />
              <Route path="products" element={<SellerProductsPage />} />
              <Route path="products/:id" element={<SellerProductEditorPage />} />
              <Route path="inventory" element={<SellerInventoryPage />} />
              <Route path="orders" element={<SellerOrdersPage />} />
              <Route path="orders/:id" element={<SellerOrderDetailPage />} />
              <Route path="store" element={<SellerStoreSettingsPage />} />
              <Route path="staff" element={<SellerStaffPage />} />
              <Route path="settings" element={<SellerSettingsPage />} />
            </Route>
          </Route>

          <Route
            path="admin"
            element={
              <RequirePlatformStaff>
                <AdminLayout />
              </RequirePlatformStaff>
            }
          >
            <Route index element={<AdminHomePage />} />
            <Route path="profile" element={<AdminProfilePage />} />
            <Route path="security" element={<AdminSecurityPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
