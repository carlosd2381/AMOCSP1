import { lazy } from 'react'
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom'

const AdminSidebarLayout = lazy(() =>
  import('@/layouts/AdminSidebarLayout').then((module) => ({ default: module.AdminSidebarLayout })),
)
const ClientPortalLayout = lazy(() =>
  import('@/layouts/ClientPortalLayout').then((module) => ({ default: module.ClientPortalLayout })),
)
const AdminDashboardPage = lazy(() =>
  import('@/modules/dashboard/pages/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })),
)
const LeadsBoardPage = lazy(() =>
  import('@/modules/leads/pages/LeadsBoardPage').then((module) => ({ default: module.LeadsBoardPage })),
)
const LeadProfilePage = lazy(() =>
  import('@/modules/leads/pages/LeadProfilePage').then((module) => ({ default: module.LeadProfilePage })),
)
const QuoteBuilderPage = lazy(() =>
  import('@/modules/quotes/pages/QuoteBuilderPage').then((module) => ({ default: module.QuoteBuilderPage })),
)
const QuotesListPage = lazy(() =>
  import('@/modules/quotes/pages/QuotesListPage').then((module) => ({ default: module.QuotesListPage })),
)
const ContractEditorPage = lazy(() =>
  import('@/modules/contracts/pages/ContractEditorPage').then((module) => ({ default: module.ContractEditorPage })),
)
const ContractsListPage = lazy(() =>
  import('@/modules/contracts/pages/ContractsListPage').then((module) => ({ default: module.ContractsListPage })),
)
const InvoicesListPage = lazy(() =>
  import('@/modules/invoices/pages/InvoicesListPage').then((module) => ({ default: module.InvoicesListPage })),
)
const InvoiceBuilderPage = lazy(() =>
  import('@/modules/invoices/pages/InvoiceBuilderPage').then((module) => ({ default: module.InvoiceBuilderPage })),
)
const GalleryOverviewPage = lazy(() =>
  import('@/modules/gallery/pages/GalleryOverviewPage').then((module) => ({ default: module.GalleryOverviewPage })),
)
const AddressBookPage = lazy(() =>
  import('@/modules/address-book/pages/AddressBookPage').then((module) => ({ default: module.AddressBookPage })),
)
const VenuesPage = lazy(() =>
  import('@/modules/venues/pages/VenuesPage').then((module) => ({ default: module.VenuesPage })),
)
const VenueProfilePage = lazy(() =>
  import('@/modules/venues/pages/VenueProfilePage').then((module) => ({ default: module.VenueProfilePage })),
)
const ProductsServicesSettingsPage = lazy(() =>
  import('@/modules/settings/pages/ProductsServicesSettingsPage').then((module) => ({ default: module.ProductsServicesSettingsPage })),
)
const CompanyDetailsSettingsPage = lazy(() =>
  import('@/modules/settings/pages/CompanyDetailsSettingsPage').then((module) => ({ default: module.CompanyDetailsSettingsPage })),
)
const FinancialSettingsPage = lazy(() =>
  import('@/modules/settings/pages/FinancialSettingsPage').then((module) => ({ default: module.FinancialSettingsPage })),
)
const PaymentSchedulesSettingsPage = lazy(() =>
  import('@/modules/settings/pages/PaymentSchedulesSettingsPage').then((module) => ({ default: module.PaymentSchedulesSettingsPage })),
)
const ContractTemplatesSettingsPage = lazy(() =>
  import('@/modules/settings/pages/ContractTemplatesSettingsPage').then((module) => ({ default: module.ContractTemplatesSettingsPage })),
)
const QuestionnaireTemplatesSettingsPage = lazy(() =>
  import('@/modules/settings/pages/QuestionnaireTemplatesSettingsPage').then((module) => ({ default: module.QuestionnaireTemplatesSettingsPage })),
)
const TokensSettingsPage = lazy(() =>
  import('@/modules/settings/pages/TokensSettingsPage').then((module) => ({ default: module.TokensSettingsPage })),
)
const SettingsHomePage = lazy(() =>
  import('@/modules/settings/pages/SettingsHomePage').then((module) => ({ default: module.SettingsHomePage })),
)
const ClientPortalHome = lazy(() =>
  import('@/modules/portal/pages/ClientPortalHome').then((module) => ({ default: module.ClientPortalHome })),
)
const PortalProposalPage = lazy(() =>
  import('@/modules/portal/pages/PortalProposalPage').then((module) => ({ default: module.PortalProposalPage })),
)
const PortalQuestionnairePage = lazy(() =>
  import('@/modules/portal/pages/PortalQuestionnairePage').then((module) => ({ default: module.PortalQuestionnairePage })),
)
const PortalContractPage = lazy(() =>
  import('@/modules/portal/pages/PortalContractPage').then((module) => ({ default: module.PortalContractPage })),
)
const PortalInvoicesPage = lazy(() =>
  import('@/modules/portal/pages/PortalInvoicesPage').then((module) => ({ default: module.PortalInvoicesPage })),
)
const PortalReviewsPage = lazy(() =>
  import('@/modules/portal/pages/PortalReviewsPage').then((module) => ({ default: module.PortalReviewsPage })),
)
const LoginPage = lazy(() =>
  import('@/modules/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })),
)

const router = createBrowserRouter([
  {
    path: '/',
    element: <AdminSidebarLayout />,
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'leads', element: <LeadsBoardPage /> },
      { path: 'leads/:leadId', element: <LeadProfilePage /> },
      { path: 'quotes', element: <QuotesListPage /> },
      { path: 'quotes/new', element: <QuoteBuilderPage /> },
      { path: 'contracts', element: <ContractsListPage /> },
      { path: 'contracts/new', element: <ContractEditorPage /> },
      { path: 'invoices', element: <InvoicesListPage /> },
      { path: 'invoices/new', element: <InvoiceBuilderPage /> },
      { path: 'galleries', element: <GalleryOverviewPage /> },
      { path: 'address-book', element: <AddressBookPage /> },
      { path: 'venues', element: <VenuesPage /> },
      { path: 'venues/:venueId', element: <VenueProfilePage /> },
      { path: 'settings', element: <SettingsHomePage /> },
      { path: 'settings/company-details', element: <CompanyDetailsSettingsPage /> },
      { path: 'settings/financials', element: <FinancialSettingsPage /> },
      { path: 'settings/payment-schedules', element: <PaymentSchedulesSettingsPage /> },
      { path: 'settings/contract-templates', element: <ContractTemplatesSettingsPage /> },
      { path: 'settings/questionnaire-templates', element: <QuestionnaireTemplatesSettingsPage /> },
      { path: 'settings/tokens', element: <TokensSettingsPage /> },
      { path: 'settings/products-services', element: <ProductsServicesSettingsPage /> },
      { path: 'portal/preview', element: <ClientPortalHome isPreview /> },
    ],
  },
  {
    path: '/portal',
    element: <ClientPortalLayout />,
    children: [
      { index: true, element: <ClientPortalHome /> },
      { path: 'proposal', element: <PortalProposalPage /> },
      { path: 'questionnaire', element: <PortalQuestionnairePage /> },
      { path: 'contract', element: <PortalContractPage /> },
      { path: 'invoices', element: <PortalInvoicesPage /> },
      { path: 'reviews', element: <PortalReviewsPage /> },
      { path: 'galleries', element: <GalleryOverviewPage isPortal /> },
    ],
  },
  {
    path: '/auth/login',
    element: <LoginPage />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
