import { Card, Col, Container, Row } from 'react-bootstrap';
import { Outlet } from 'react-router';

const AuthLayout = () => {
  return (
    <Container className="container">
      <Row className="vh-100 align-items-center">
        <Col md={10} lg={8} xl={6} className="mx-auto">
          <Card>
            <Outlet />
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AuthLayout;
