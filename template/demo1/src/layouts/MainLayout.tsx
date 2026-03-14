import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Footer from './components/Footer';
import LoadingFallback from '@/components/loading-fallback/LoadingFallback';
import { Container } from 'react-bootstrap';

const MainLayout = () => {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="main-wrapper">
      <Sidebar />
      <div className="page-wrapper">
        <Header />
        <Container fluid="xxl" className="page-content">
          <Suspense fallback={<LoadingFallback />} key={location.key}>
            <Outlet />
          </Suspense>
        </Container>
        <Footer />
      </div>
    </div>
  );
};

export default MainLayout;
