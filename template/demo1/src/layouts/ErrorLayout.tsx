import { Outlet } from 'react-router';
import { Container } from 'react-bootstrap';
const ErrorLayout = () => {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper full-page">
        <Container fluid="xxl" className="page-content d-flex align-items-center justify-content-center">
          <Outlet />
        </Container>
      </div>
    </div>
  );
};

export default ErrorLayout;
