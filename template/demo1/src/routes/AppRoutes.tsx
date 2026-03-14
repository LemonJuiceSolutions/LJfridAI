import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import AuthGuard from '@/auth/AuthGuard';
import RouteErrorBoundary from '@/components/error-boundaries/RouteErrorBoundary';

const MainLayout = lazy(() => import('@/layouts/MainLayout'));
const AuthLayout = lazy(() => import('@/layouts/AuthLayout'));
const ErrorLayout = lazy(() => import('@/layouts/ErrorLayout'));

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));

const ChatPage = lazy(() => import('@/pages/apps/chat/ChatPage'));
const CalendarPage = lazy(() => import('@/pages/apps/calendar/CalendarPage'));
const EmailLayout = lazy(() => import('@/pages/apps/email/EmailLayout'));
const InboxPage = lazy(() => import('@/pages/apps/email/inbox/InboxPage'));
const ReadPage = lazy(() => import('@/pages/apps/email/read/ReadPage'));
const ComposePage = lazy(() => import('@/pages/apps/email/compose/ComposePage'));

const AccordionPage = lazy(() => import('@/pages/ui-components/accordion/AccordionPage'));
const AlertPage = lazy(() => import('@/pages/ui-components/alert/AlertPage'));
const BadgePage = lazy(() => import('@/pages/ui-components/badge/BadgePage'));
const BreadcrumbPage = lazy(() => import('@/pages/ui-components/breadcrumb/BreadcrumbPage'));
const ButtonPage = lazy(() => import('@/pages/ui-components/button/ButtonPage'));
const ButtonGroupPage = lazy(() => import('@/pages/ui-components/button-group/ButtonGroupPage'));
const CardPage = lazy(() => import('@/pages/ui-components/card/CardPage'));
const CarouselPage = lazy(() => import('@/pages/ui-components/carousel/CarouselPage'));
const CollapsePage = lazy(() => import('@/pages/ui-components/collapse/CollapsePage'));
const DropdownPage = lazy(() => import('@/pages/ui-components/dropdown/DropdownPage'));
const ListGroupPage = lazy(() => import('@/pages/ui-components/list-group/ListGroupPage'));
const ModalPage = lazy(() => import('@/pages/ui-components/modal/ModalPage'));
const NavPage = lazy(() => import('@/pages/ui-components/nav/NavPage'));
const OffcanvasPage = lazy(() => import('@/pages/ui-components/offcanvas/OffcanvasPage'));
const OverlayPage = lazy(() => import('@/pages/ui-components/overlay/OverlayPage'));
const PaginationPage = lazy(() => import('@/pages/ui-components/pagination/PaginationPage'));
const PlaceholderPage = lazy(() => import('@/pages/ui-components/placeholder/PlaceholderPage'));
const ProgressBarPage = lazy(() => import('@/pages/ui-components/progress-bar/ProgressbarPage'));
const ScrollbarPage = lazy(() => import('@/pages/ui-components/scrollbar/ScrollbarPage'));
const SpinnerPage = lazy(() => import('@/pages/ui-components/spinner/SpinnerPage'));
const TablePage = lazy(() => import('@/pages/ui-components/table/TablePage'));
const TabsPage = lazy(() => import('@/pages/ui-components/tabs/TabsPage'));
const ToastPage = lazy(() => import('@/pages/ui-components/toast/ToastPage'));

const ImageCropperPage = lazy(() => import('@/pages/advanced-ui/image-cropper/ImageCropperPage'));
const SwiperPage = lazy(() => import('@/pages/advanced-ui/swiper/SwiperPage'));
const SortablePage = lazy(() => import('@/pages/advanced-ui/sortable/SortablePage'));
const SweetAlertPage = lazy(() => import('@/pages/advanced-ui/sweet-alert/SweetAlertPage'));

const FormControlPage = lazy(() => import('@/pages/form-elements/form-control/FormControlPage'));
const FormTextPage = lazy(() => import('@/pages/form-elements/form-text/FormTextPage'));
const SelectPage = lazy(() => import('@/pages/form-elements/select/SelectPage'));
const ChecksRadiosPage = lazy(() => import('@/pages/form-elements/checks-radios/ChecksRadiosPage'));
const RangePage = lazy(() => import('@/pages/form-elements/range/RangePage'));
const InputGroupPage = lazy(() => import('@/pages/form-elements/input-group/InputGroupPage'));
const FloatingLabelPage = lazy(() => import('@/pages/form-elements/floating-label/FloatingLabelPage'));
const FormLayoutPage = lazy(() => import('@/pages/form-elements/form-layout/FormLayoutPage'));
const ValidationPage = lazy(() => import('@/pages/form-elements/validation/ValidationPage'));

const FormValidationPage = lazy(() => import('@/pages/advanced-forms/form-validation/FormValidationPage'));
const NumberFormatPage = lazy(() => import('@/pages/advanced-forms/number-format/NumberFormatPage'));
const SearchSelectPage = lazy(() => import('@/pages/advanced-forms/search-select/SearchSelectPage'));
const ColorPickerPage = lazy(() => import('@/pages/advanced-forms/color-picker/ColorPickerPage'));
const DropzonePage = lazy(() => import('@/pages/advanced-forms/dropzone/DropzonePage'));
const DatePickerPage = lazy(() => import('@/pages/advanced-forms/date-picker/DatePickerPage'));
const TextEditorPage = lazy(() => import('@/pages/advanced-forms/text-editor/TextEditorPage'));
const ApexChartsPage = lazy(() => import('@/pages/charts/apexcharts/ApexChartsPage'));
const ChartJsPage = lazy(() => import('@/pages/charts/chartjs/ChartJsPage'));

const BasicTablesPage = lazy(() => import('@/pages/tables/basic-tables/BasicTablesPage'));
const DatatablePage = lazy(() => import('@/pages/tables/datatable/DatatablePage'));

const IconsPage = lazy(() => import('@/pages/icons/IconsPage'));

const BlankPage = lazy(() => import('@/pages/general/BlankPage'));
const FaqPage = lazy(() => import('@/pages/general/FaqPage'));
const InvoicePage = lazy(() => import('@/pages/general/InvoicePage'));
const ProfilePage = lazy(() => import('@/pages/general/profile/ProfilePage'));
const PricingPage = lazy(() => import('@/pages/general/PricingPage'));

const Error404Page = lazy(() => import('@/pages/error/Error404Page'));
const Error500Page = lazy(() => import('@/pages/error/Error500Pge'));

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));

const AppRoutes = () => {
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <BrowserRouter basename={baseUrl}>
      <Routes>
        <Route element={<AuthGuard />}>
          <Route element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route
              path="dashboard"
              element={
                <RouteErrorBoundary routeName="Dashboard">
                  <DashboardPage />
                </RouteErrorBoundary>
              }
            />

            <Route path="apps/calendar" element={<CalendarPage />} />
            <Route path="apps/chat" element={<ChatPage />} />
            <Route element={<EmailLayout />}>
              <Route path="apps/email/inbox" element={<InboxPage />} />
              <Route path="apps/email/read" element={<ReadPage />} />
              <Route path="apps/email/read/:emailId" element={<ReadPage />} />
              <Route path="apps/email/compose" element={<ComposePage />} />
            </Route>

            <Route path="ui-components/accordion" element={<AccordionPage />} />
            <Route path="ui-components/alerts" element={<AlertPage />} />
            <Route path="ui-components/badges" element={<BadgePage />} />
            <Route path="ui-components/breadcrumbs" element={<BreadcrumbPage />} />
            <Route path="ui-components/buttons" element={<ButtonPage />} />
            <Route path="ui-components/button-group" element={<ButtonGroupPage />} />
            <Route path="ui-components/cards" element={<CardPage />} />
            <Route path="ui-components/carousel" element={<CarouselPage />} />
            <Route path="ui-components/collapse" element={<CollapsePage />} />
            <Route path="ui-components/dropdowns" element={<DropdownPage />} />
            <Route path="ui-components/list-group" element={<ListGroupPage />} />
            <Route path="ui-components/modal" element={<ModalPage />} />
            <Route path="ui-components/navs" element={<NavPage />} />
            <Route path="ui-components/offcanvas" element={<OffcanvasPage />} />
            <Route path="ui-components/overlay" element={<OverlayPage />} />
            <Route path="ui-components/pagination" element={<PaginationPage />} />
            <Route path="ui-components/placeholder" element={<PlaceholderPage />} />
            <Route path="ui-components/progress" element={<ProgressBarPage />} />
            <Route path="ui-components/scrollbar" element={<ScrollbarPage />} />
            <Route path="ui-components/spinners" element={<SpinnerPage />} />
            <Route path="ui-components/table" element={<TablePage />} />
            <Route path="ui-components/tabs" element={<TabsPage />} />
            <Route path="ui-components/toasts" element={<ToastPage />} />

            <Route path="advanced-ui/image-cropper" element={<ImageCropperPage />} />
            <Route path="advanced-ui/swiper" element={<SwiperPage />} />
            <Route path="advanced-ui/sortable" element={<SortablePage />} />
            <Route path="advanced-ui/sweet-alert" element={<SweetAlertPage />} />

            <Route path="form-elements/form-control" element={<FormControlPage />} />
            <Route path="form-elements/form-text" element={<FormTextPage />} />
            <Route path="form-elements/select" element={<SelectPage />} />
            <Route path="form-elements/checks-radios" element={<ChecksRadiosPage />} />
            <Route path="form-elements/range" element={<RangePage />} />
            <Route path="form-elements/input-group" element={<InputGroupPage />} />
            <Route path="form-elements/floating-labels" element={<FloatingLabelPage />} />
            <Route path="form-elements/layout" element={<FormLayoutPage />} />
            <Route path="form-elements/validation" element={<ValidationPage />} />

            <Route path="advanced-forms/form-validation" element={<FormValidationPage />} />
            <Route path="advanced-forms/number-format" element={<NumberFormatPage />} />
            <Route path="advanced-forms/search-select" element={<SearchSelectPage />} />
            <Route path="advanced-forms/color-picker" element={<ColorPickerPage />} />
            <Route path="advanced-forms/dropzone" element={<DropzonePage />} />
            <Route path="advanced-forms/datepicker" element={<DatePickerPage />} />
            <Route path="advanced-forms/text-editor" element={<TextEditorPage />} />

            <Route
              path="charts/apexcharts"
              element={
                <RouteErrorBoundary routeName="ApexCharts">
                  <ApexChartsPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="charts/chartjs"
              element={
                <RouteErrorBoundary routeName="ChartJS">
                  <ChartJsPage />
                </RouteErrorBoundary>
              }
            />

            <Route path="tables/basic-tables" element={<BasicTablesPage />} />
            <Route path="tables/datatable" element={<DatatablePage />} />

            <Route path="icons" element={<IconsPage />} />

            <Route path="general/blank-page" element={<BlankPage />} />
            <Route path="general/faq" element={<FaqPage />} />
            <Route path="general/invoice" element={<InvoicePage />} />
            <Route path="general/profile" element={<ProfilePage />} />
            <Route path="general/pricing" element={<PricingPage />} />
          </Route>
        </Route>
        <Route element={<AuthLayout />}>
          <Route path="auth/login" element={<LoginPage />} />
          <Route path="auth/register" element={<RegisterPage />} />
          <Route path="auth/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route element={<ErrorLayout />}>
          <Route path="error/404" element={<Error404Page />} />
          <Route path="error/500" element={<Error500Page />} />
        </Route>
        <Route path="*" element={<Navigate to="/error/404" />} />
      </Routes>
    </BrowserRouter>
  );
};

export { AppRoutes };
