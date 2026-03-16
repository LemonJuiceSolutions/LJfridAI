import { getUrl } from '@/utils/getUrl';
import { ArrowLeft } from 'lucide-react';
import { Button, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';

const Error404Page = () => (
  <Row className="w-100 mx-0 auth-page">
    <Col md={8} xl={6} className="mx-auto d-flex flex-column align-items-center">
      <img src={getUrl('/images/others/404.svg')} className="img-fluid mb-2" alt="404" />
      <h1 className="fw-bolder mt-2 fs-150px text-secondary">404</h1>
      <h4 className="mb-3">Page Not Found</h4>
      <p className="text-secondary mb-3 text-center">
        Sorry, we couldn't find the page you're looking for. <br /> It might have been moved or deleted.
      </p>
      <Link to="/">
        <Button variant="primary">
          <ArrowLeft className="w-15px" /> Back to Home
        </Button>
      </Link>
    </Col>
  </Row>
);

export default Error404Page;
