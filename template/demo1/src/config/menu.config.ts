import {
  LucideIcon,
  Calendar,
  Home,
  Mail,
  MessageSquare,
  Feather,
  Anchor,
  FileText,
  PieChart,
  Layout,
  Smile,
  Book,
  Unlock,
  CloudOff,
  SquareStack,
  Hash,
  ExternalLink,
} from 'lucide-react';

export interface MenuItem {
  label: string;
  id?: number;
  icon?: LucideIcon;
  link?: string;
  isExternalLink?: boolean;
  expanded?: boolean;
  subItems?: MenuItem[];
  isTitle?: boolean;
  badge?: { variant: string; isDarkText?: boolean; isPill?: boolean; text: string };
  parentId?: number;
}

export const MENU: MenuItem[] = [
  {
    label: 'Main',
    isTitle: true,
  },
  {
    label: 'Dashboard',
    icon: Home,
    link: '/dashboard',
  },
  {
    label: 'Web Apps',
    isTitle: true,
  },
  {
    label: 'Email',
    icon: Mail,
    subItems: [
      {
        label: 'Inbox',
        link: '/apps/email/inbox',
      },
      {
        label: 'Read',
        link: '/apps/email/read',
      },
      {
        label: 'Compose',
        link: '/apps/email/compose',
      },
    ],
  },
  {
    label: 'Chat',
    icon: MessageSquare,
    link: '/apps/chat',
  },
  {
    label: 'Calendar',
    icon: Calendar,
    link: '/apps/calendar',
    // badge: {
    //   variant: 'primary',
    //   isDarkText: false,
    //   isPill: false,
    //   text: 'Event',
    // },
  },
  {
    label: 'Components',
    isTitle: true,
  },
  {
    label: 'UI Kit',
    icon: Feather,
    subItems: [
      {
        label: 'Accordion',
        link: '/ui-components/accordion',
      },
      {
        label: 'Alerts',
        link: '/ui-components/alerts',
      },
      {
        label: 'Badges',
        link: '/ui-components/badges',
      },
      {
        label: 'Breadcrumbs',
        link: '/ui-components/breadcrumbs',
      },
      {
        label: 'Buttons',
        link: '/ui-components/buttons',
      },
      {
        label: 'Button group',
        link: '/ui-components/button-group',
      },
      {
        label: 'Cards',
        link: '/ui-components/cards',
      },
      {
        label: 'Carousel',
        link: '/ui-components/carousel',
      },
      {
        label: 'Collapse',
        link: '/ui-components/collapse',
      },
      {
        label: 'Dropdowns',
        link: '/ui-components/dropdowns',
      },
      {
        label: 'List group',
        link: '/ui-components/list-group',
      },
      {
        label: 'Modal',
        link: '/ui-components/modal',
      },
      {
        label: 'Navs & tabs',
        link: '/ui-components/navs',
      },
      {
        label: 'Offcanvas',
        link: '/ui-components/offcanvas',
      },
      {
        label: 'Overlay',
        link: '/ui-components/overlay',
      },
      {
        label: 'Pagination',
        link: '/ui-components/pagination',
      },
      {
        label: 'Placeholders',
        link: '/ui-components/placeholder',
      },
      {
        label: 'Progress bars',
        link: '/ui-components/progress',
      },
      {
        label: 'Scrollbar',
        link: '/ui-components/scrollbar',
      },
      {
        label: 'Spinners',
        link: '/ui-components/spinners',
      },
      {
        label: 'Table',
        link: '/ui-components/table',
      },
      {
        label: 'Tabs',
        link: '/ui-components/tabs',
      },
      {
        label: 'Toasts',
        link: '/ui-components/toasts',
      },
    ],
  },
  {
    label: 'Advanced UI',
    icon: Anchor,
    subItems: [
      {
        label: 'Image cropper',
        link: '/advanced-ui/image-cropper',
      },
      {
        label: 'Swiper',
        link: '/advanced-ui/swiper',
      },
      {
        label: 'Sortable',
        link: '/advanced-ui/sortable',
      },
      {
        label: 'Sweet alert',
        link: '/advanced-ui/sweet-alert',
      },
    ],
  },
  {
    label: 'Form Elements',
    icon: FileText,
    subItems: [
      {
        label: 'Form controls',
        link: '/form-elements/form-control',
      },
      {
        label: 'Form text',
        link: '/form-elements/form-text',
      },
      {
        label: 'Select',
        link: '/form-elements/select',
      },
      {
        label: 'Checks and radios',
        link: '/form-elements/checks-radios',
      },
      {
        label: 'Range',
        link: '/form-elements/range',
      },
      {
        label: 'Input group',
        link: '/form-elements/input-group',
      },
      {
        label: 'Floating labels',
        link: '/form-elements/floating-labels',
      },
      {
        label: 'Layout',
        link: '/form-elements/layout',
      },
      {
        label: 'Validation',
        link: '/form-elements/validation',
      },
    ],
  },
  {
    label: 'Advanced Forms',
    icon: FileText,
    subItems: [
      {
        label: 'Form validation',
        link: '/advanced-forms/form-validation',
      },
      {
        label: 'Number format',
        link: '/advanced-forms/number-format',
      },
      {
        label: 'Search select',
        link: '/advanced-forms/search-select',
      },
      {
        label: 'Color picker',
        link: '/advanced-forms/color-picker',
      },
      {
        label: 'Dropzone',
        link: '/advanced-forms/dropzone',
      },
      {
        label: 'Date picker',
        link: '/advanced-forms/datepicker',
      },
      {
        label: 'Text Editor',
        link: '/advanced-forms/text-editor',
      },
    ],
  },
  {
    label: 'Charts',
    icon: PieChart,
    subItems: [
      {
        label: 'ApexCharts',
        link: '/charts/apexcharts',
      },
      {
        label: 'ChartJs',
        link: '/charts/chartjs',
      },
    ],
  },
  {
    label: 'Tables',
    icon: Layout,
    subItems: [
      {
        label: 'Basic tables',
        link: '/tables/basic-tables',
      },
      {
        label: 'Datatable',
        link: '/tables/datatable',
      },
    ],
  },
  {
    label: 'Icons',
    icon: Smile,
    link: '/icons',
  },
  {
    label: 'Pages',
    isTitle: true,
  },
  {
    label: 'General pages',
    icon: Book,
    subItems: [
      {
        label: 'Blank page',
        link: '/general/blank-page',
      },
      {
        label: 'Faq',
        link: '/general/faq',
      },
      {
        label: 'Invoice',
        link: '/general/invoice',
      },
      {
        label: 'Profile',
        link: '/general/profile',
      },
      {
        label: 'Pricing',
        link: '/general/pricing',
      },
    ],
  },
  {
    label: 'Authentication',
    icon: Unlock,
    subItems: [
      {
        label: 'Login',
        link: '/auth/login',
      },
      {
        label: 'Register',
        link: '/auth/register',
      },
      {
        label: 'Forgot password',
        link: '/auth/forgot-password',
      },
    ],
  },
  {
    label: 'Error',
    icon: CloudOff,
    subItems: [
      {
        label: '404',
        link: '/error/404',
      },
      {
        label: '500',
        link: '/error/500',
      },
    ],
  },
  {
    label: 'Other',
    isTitle: true,
  },
  {
    isExternalLink: true,
    label: 'External Link',
    icon: ExternalLink,
    link: 'https://google.com',
  },
  {
    label: 'Multi Level Menu',
    icon: SquareStack,
    subItems: [
      {
        label: 'Level 1.1',
        link: '/multi-level/level-1-1',
      },
      {
        label: 'Level 1.2',
        subItems: [
          {
            label: 'Level 2.1',
            link: '/multi-level/level-1-2/level-2-1',
          },
          {
            label: 'Level 2.2',
            link: '/multi-level/level-1-2/level-2-2',
          },
        ],
      },
    ],
  },
  {
    label: 'Docs',
    isTitle: true,
  },
  {
    isExternalLink: true,
    label: 'Documentation',
    icon: Hash,
    link: 'https://nobleui.com/docs/nobleui-react-bootstrap/',
  },
];
