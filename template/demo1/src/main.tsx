import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

// Fonts (self-hosted via @fontsource)
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

// Styles for LTR Layout
//
import './styles/styles.scss';

// Styles for RTL Layout.
// NOTE: Replace the above styles.scss with these CSS files to enable RTL mode.
//
// import './styles/rtl-css/styles.rtl.css';
// import './styles/rtl-css/custom.rtl.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
