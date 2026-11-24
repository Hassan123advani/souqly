import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageSpinner } from '@/components/ui';
import { AppEffects } from '@/components/layout/AppEffects';
import { CartSync } from '@/components/cart/CartSync';
import { CookieConsent } from '@/components/layout/CookieConsent';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { MarketplaceLayout } from '@/components/layout/MarketplaceLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { RequireAuth, RequireGuest, RequirePlatformStaff, RequireSellerMode } from '@/routes/guards';

// ---- Lazy pages ----
const HomePage = lazy(() => import('@/pages/buyer/HomePage'));
const CategoriesPage = lazy(() => import('@/pages/buyer/CategoriesPage'));
const CategoryPage = lazy(() => import('@/pages/buyer/CategoryPage'));
const SearchPage = lazy(() => import('@/pages/buyer/SearchPage'));
const ProductPage = lazy(() => import('@/pages/buyer/ProductPage'));
const StorePage = lazy(() => import('@/pages/buyer/StorePage'));
const StoresPage = lazy(() => import('@/pages/buyer/StoresPage'));
const CampaignPage = lazy(() => import('@/pages/buyer/CampaignPage'));
const BrandPage = lazy(() => import('@/pages/buyer/BrandPage'));
const CmsStaticPage = lazy(() => import('@/pages/static/CmsStaticPage'));
const CmsPage = lazy(() => import('@/pages/static/CmsPage'));
const SellPage = lazy(() => import('@/pages/static/SellPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const CartPage = lazy(() => import('@/pages/cart/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/checkout/CheckoutPage'));
const CheckoutSuccessPage = lazy(() => import('@/pages/checkout/CheckoutSuccessPage'));
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/orders/OrderDetailPage'));
// Phase 7: notifications, returns, rider
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'));
const ReturnRequestPage = lazy(() => import('@/pages/returns/ReturnRequestPage'));
const ReturnsPage = lazy(() => import('@/pages/returns/ReturnsPage'));
const ReturnDetailPage = lazy(() => import('@/pages/returns/ReturnDetailPage'));
const SellerReturnsPage = lazy(() => import('@/pages/seller/returns/ReturnsPage'));
const SellerReturnDetailPage = lazy(() => import('@/pages/seller/returns/ReturnDetailPage'));
const SellerRidersPage = lazy(() => import('@/pages/seller/riders/RidersPage'));
const RiderLayout = lazy(() => import('@/components/rider/RiderLayout'));
const RiderHomePage = lazy(() => import('@/pages/rider/RiderHomePage'));
const RiderDeliveryPage = lazy(() => import('@/pages/rider/RiderDeliveryPage'));
const RiderCashPage = lazy(() => import('@/pages/rider/RiderCashPage'));
const RiderEarningsPage = lazy(() => import('@/pages/rider/RiderEarningsPage'));

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
// Phase 8: social, chat, wallet & loyalty
const WishlistPage = lazy(() => import('@/pages/wishlist/WishlistPage'));
const ChatPage = lazy(() => import('@/pages/chat/ChatPage'));
const MyReviewsPage = lazy(() => import('@/pages/social/MyReviewsPage'));
const FollowingPage = lazy(() => import('@/pages/social/FollowingPage'));
const WalletPage = lazy(() => import('@/pages/wallet/WalletPage'));
const CoinsPage = lazy(() => import('@/pages/wallet/CoinsPage'));
const ReferralsPage = lazy(() => import('@/pages/wallet/ReferralsPage'));
const SellerChatPage = lazy(() => import('@/pages/seller/chat/SellerChatPage'));
const SellerReviewsPage = lazy(() => import('@/pages/seller/reviews/SellerReviewsPage'));
const SellerQuestionsPage = lazy(() => import('@/pages/seller/reviews/SellerQuestionsPage'));
// Phase 10: seller growth
const SellerMarketingPage = lazy(() => import('@/pages/seller/marketing/MarketingPage'));
const SellerAnalyticsPage = lazy(() => import('@/pages/seller/analytics/AnalyticsPage'));
const SellerPosPage = lazy(() => import('@/pages/seller/pos/PosPage'));
const SellerBulkProductsPage = lazy(() => import('@/pages/seller/products/BulkProductsPage'));
const ReceiptPage = lazy(() => import('@/pages/static/ReceiptPage'));
// Billing: subscriptions, 15% commission, invoices (docs/api-billing.md)
const SellerBillingLayout = lazy(() => import('@/pages/seller/billing/BillingLayout'));
const SellerBillingOverviewPage = lazy(() => import('@/pages/seller/billing/OverviewPage'));
const SellerBillingPlansPage = lazy(() => import('@/pages/seller/billing/PlansPage'));
const SellerBillingInvoicesPage = lazy(() => import('@/pages/seller/billing/InvoicesPage'));
const SellerBillingInvoiceDetailPage = lazy(() => import('@/pages/seller/billing/InvoiceDetailPage'));
const SellerBillingPaymentsPage = lazy(() => import('@/pages/seller/billing/PaymentsPage'));
const SellerBillingCommissionsPage = lazy(() => import('@/pages/seller/billing/CommissionsPage'));
const SellerBillingPayoutsPage = lazy(() => import('@/pages/seller/billing/PayoutsPage'));
const AdminBillingOverviewPage = lazy(() => import('@/pages/admin/billing/BillingOverviewPage'));
const AdminBillingStoresPage = lazy(() => import('@/pages/admin/billing/BillingStoresPage'));
const AdminBillingStoreDetailPage = lazy(() => import('@/pages/admin/billing/BillingStoreDetailPage'));
const AdminBillingPaymentsPage = lazy(() => import('@/pages/admin/billing/BillingPaymentsPage'));
const AdminBillingInvoicesPage = lazy(() => import('@/pages/admin/billing/BillingInvoicesPage'));
const AdminBillingInvoiceDetailPage = lazy(() => import('@/pages/admin/billing/BillingInvoiceDetailPage'));
const AdminBillingAdjustmentsPage = lazy(() => import('@/pages/admin/billing/BillingAdjustmentsPage'));
const AdminBillingReportsPage = lazy(() => import('@/pages/admin/billing/BillingReportsPage'));
const AdminBillingSettingsPage = lazy(() => import('@/pages/admin/billing/BillingSettingsPage'));
const AffiliatePage = lazy(() => import('@/pages/affiliate/AffiliatePage'));
const AdminNominationsPage = lazy(() => import('@/pages/admin/marketing/NominationsPage'));

const AdminLayout = lazy(() => import('@/components/layout/AdminLayout'));
const AdminHomePage = lazy(() => import('@/pages/admin/AdminHomePage'));
const AdminProfilePage = lazy(() => import('@/pages/admin/AdminProfilePage'));
const AdminSecurityPage = lazy(() => import('@/pages/admin/AdminSecurityPage'));
const AdminUsersPage = lazy(() => import('@/pages/admin/users/UsersPage'));
const AdminUserDetailPage = lazy(() => import('@/pages/admin/users/UserDetailPage'));
const AdminStoresPage = lazy(() => import('@/pages/admin/stores/StoresPage'));
const AdminStoreDetailPage = lazy(() => import('@/pages/admin/stores/StoreDetailPage'));
const AdminModerationQueuePage = lazy(() => import('@/pages/admin/products/ModerationQueuePage'));
const AdminCategoriesPage = lazy(() => import('@/pages/admin/catalog/CategoriesPage'));
const AdminBrandsPage = lazy(() => import('@/pages/admin/catalog/BrandsPage'));
const AdminOrdersPage = lazy(() => import('@/pages/admin/orders/OrdersPage'));
const AdminOrderDetailPage = lazy(() => import('@/pages/admin/orders/OrderDetailPage'));
const AdminDisputesPage = lazy(() => import('@/pages/admin/disputes/DisputesPage'));
const AdminDisputeDetailPage = lazy(() => import('@/pages/admin/disputes/DisputeDetailPage'));
const AdminCampaignsPage = lazy(() => import('@/pages/admin/marketing/CampaignsPage'));
const AdminFlashSalesPage = lazy(() => import('@/pages/admin/marketing/FlashSalesPage'));
const AdminVouchersPage = lazy(() => import('@/pages/admin/marketing/VouchersPage'));
const AdminGiftCardsPage = lazy(() => import('@/pages/admin/marketing/GiftCardsPage'));
const AdminHomeCmsPage = lazy(() => import('@/pages/admin/cms/HomeCmsPage'));
const AdminCmsPagesPage = lazy(() => import('@/pages/admin/cms/CmsPagesPage'));
const AdminCmsPageEditorPage = lazy(() => import('@/pages/admin/cms/CmsPageEditorPage'));
const AdminCommissionPage = lazy(() => import('@/pages/admin/finance/CommissionPage'));
const AdminPayoutsPage = lazy(() => import('@/pages/admin/finance/PayoutsPage'));
const AdminFinanceReportsPage = lazy(() => import('@/pages/admin/finance/FinanceReportsPage'));
const AdminModerationPage = lazy(() => import('@/pages/admin/moderation/ModerationPage'));
const AdminTicketsPage = lazy(() => import('@/pages/admin/support/TicketsPage'));
const AdminTicketDetailPage = lazy(() => import('@/pages/admin/support/TicketDetailPage'));
const AdminSettingsPage = lazy(() => import('@/pages/admin/settings/SettingsPage'));
const AdminEmailTemplatesPage = lazy(() => import('@/pages/admin/settings/EmailTemplatesPage'));
const AdminStaffPage = lazy(() => import('@/pages/admin/platform/StaffPage'));
const AdminAuditLogsPage = lazy(() => import('@/pages/admin/platform/AuditLogsPage'));
const AdminSystemHealthPage = lazy(() => import('@/pages/admin/platform/SystemHealthPage'));
const SupportTicketsPage = lazy(() => import('@/pages/support/SupportTicketsPage'));
const NewTicketPage = lazy(() => import('@/pages/support/NewTicketPage'));
const TicketThreadPage = lazy(() => import('@/pages/support/TicketThreadPage'));

export function App() {
  return (
    <ErrorBoundary>
      <AppEffects />
      <ImpersonationBanner />
      <CartSync />
      <CookieConsent />
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
            <Route path="about" element={<CmsStaticPage page="about" />} />
            <Route path="terms" element={<CmsStaticPage page="terms" />} />
            <Route path="privacy" element={<CmsStaticPage page="privacy" />} />
            <Route path="help" element={<CmsStaticPage page="help" />} />
            <Route path="pages/:slug" element={<CmsPage />} />
            <Route path="sell" element={<SellPage />} />

            <Route element={<RequireAuth />}>
              <Route path="seller/onboarding" element={<SellerOnboardingPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="wishlist" element={<WishlistPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="chat/:id" element={<ChatPage />} />
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
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="orders/:number/return" element={<ReturnRequestPage />} />
                <Route path="returns" element={<ReturnsPage />} />
                <Route path="returns/:id" element={<ReturnDetailPage />} />
                <Route path="reviews" element={<MyReviewsPage />} />
                <Route path="following" element={<FollowingPage />} />
                <Route path="wallet" element={<WalletPage />} />
                <Route path="coins" element={<CoinsPage />} />
                <Route path="referrals" element={<ReferralsPage />} />
                <Route path="affiliate" element={<AffiliatePage />} />
                <Route path="support" element={<SupportTicketsPage />} />
                <Route path="support/new" element={<NewTicketPage />} />
                <Route path="support/:id" element={<TicketThreadPage />} />
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
              <Route path="products/bulk" element={<SellerBulkProductsPage />} />
              <Route path="products/:id" element={<SellerProductEditorPage />} />
              <Route path="inventory" element={<SellerInventoryPage />} />
              <Route path="orders" element={<SellerOrdersPage />} />
              <Route path="orders/:id" element={<SellerOrderDetailPage />} />
              <Route path="store" element={<SellerStoreSettingsPage />} />
              <Route path="staff" element={<SellerStaffPage />} />
              <Route path="settings" element={<SellerSettingsPage />} />
              <Route path="chat" element={<SellerChatPage />} />
              <Route path="reviews" element={<SellerReviewsPage />} />
              <Route path="questions" element={<SellerQuestionsPage />} />
              <Route path="returns" element={<SellerReturnsPage />} />
              <Route path="returns/:id" element={<SellerReturnDetailPage />} />
              <Route path="riders" element={<SellerRidersPage />} />
              <Route path="marketing" element={<SellerMarketingPage />} />
              <Route path="analytics" element={<SellerAnalyticsPage />} />
              <Route path="pos" element={<SellerPosPage />} />
              <Route path="billing" element={<SellerBillingLayout />}>
                <Route index element={<SellerBillingOverviewPage />} />
                <Route path="plans" element={<SellerBillingPlansPage />} />
                <Route path="invoices" element={<SellerBillingInvoicesPage />} />
                <Route path="invoices/:id" element={<SellerBillingInvoiceDetailPage />} />
                <Route path="payments" element={<SellerBillingPaymentsPage />} />
                <Route path="commissions" element={<SellerBillingCommissionsPage />} />
                <Route path="payouts" element={<SellerBillingPayoutsPage />} />
              </Route>
              <Route path="finance" element={<Navigate to="/seller/billing" replace />} />
            </Route>
          </Route>

          <Route path="r/:token" element={<ReceiptPage />} />

          <Route path="rider" element={<RiderLayout />}>
            <Route index element={<RiderHomePage />} />
            <Route path="d/:orderId" element={<RiderDeliveryPage />} />
            <Route path="cash" element={<RiderCashPage />} />
            <Route path="earnings" element={<RiderEarningsPage />} />
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
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:id" element={<AdminUserDetailPage />} />
            <Route path="stores" element={<AdminStoresPage />} />
            <Route path="stores/:id" element={<AdminStoreDetailPage />} />
            <Route path="products" element={<AdminModerationQueuePage />} />
            <Route path="catalog/categories" element={<AdminCategoriesPage />} />
            <Route path="catalog/brands" element={<AdminBrandsPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="orders/:id" element={<AdminOrderDetailPage />} />
            <Route path="disputes" element={<AdminDisputesPage />} />
            <Route path="disputes/:id" element={<AdminDisputeDetailPage />} />
            <Route path="marketing/campaigns" element={<AdminCampaignsPage />} />
            <Route path="marketing/nominations" element={<AdminNominationsPage />} />
            <Route path="marketing/flash-sales" element={<AdminFlashSalesPage />} />
            <Route path="marketing/vouchers" element={<AdminVouchersPage />} />
            <Route path="marketing/gift-cards" element={<AdminGiftCardsPage />} />
            <Route path="cms/home" element={<AdminHomeCmsPage />} />
            <Route path="cms/pages" element={<AdminCmsPagesPage />} />
            <Route path="cms/pages/:id" element={<AdminCmsPageEditorPage />} />
            <Route path="finance/payouts" element={<AdminPayoutsPage />} />
            <Route path="finance/commission" element={<AdminCommissionPage />} />
            <Route path="finance/reports" element={<AdminFinanceReportsPage />} />
            <Route path="billing" element={<AdminBillingOverviewPage />} />
            <Route path="billing/stores" element={<AdminBillingStoresPage />} />
            <Route path="billing/stores/:storeId" element={<AdminBillingStoreDetailPage />} />
            <Route path="billing/payments" element={<AdminBillingPaymentsPage />} />
            <Route path="billing/invoices" element={<AdminBillingInvoicesPage />} />
            <Route path="billing/invoices/:id" element={<AdminBillingInvoiceDetailPage />} />
            <Route path="billing/adjustments" element={<AdminBillingAdjustmentsPage />} />
            <Route path="billing/reports" element={<AdminBillingReportsPage />} />
            <Route path="billing/settings" element={<AdminBillingSettingsPage />} />
            <Route path="moderation" element={<AdminModerationPage />} />
            <Route path="support" element={<AdminTicketsPage />} />
            <Route path="support/:id" element={<AdminTicketDetailPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="settings/email-templates" element={<AdminEmailTemplatesPage />} />
            <Route path="staff" element={<AdminStaffPage />} />
            <Route path="audit" element={<AdminAuditLogsPage />} />
            <Route path="system" element={<AdminSystemHealthPage />} />
            <Route path="catalog" element={<Navigate to="categories" replace />} />
            <Route path="marketing" element={<Navigate to="campaigns" replace />} />
            <Route path="cms" element={<Navigate to="home" replace />} />
            <Route path="finance" element={<Navigate to="payouts" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
