import { Breadcrumb, Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import Basic from './components/Basic';
import Hoverable from './components/Hoverable';
import Bordered from './components/Bordered';
import Striped from './components/Striped';
import Dark from './components/Dark';
import Variants from './components/Variants';

const BasicTablesPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Tables
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Basic Tables</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Basic Table</Card.Title>
              <Basic />
            </Card.Body>
          </Card>
        </Col>

        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Hoverable Table</Card.Title>
              <Hoverable />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Bordered Table</Card.Title>
              <Bordered />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Striped Table</Card.Title>
              <Striped />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Dark Table</Card.Title>
              <Dark />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={12} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Variants</Card.Title>
              <Variants />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default BasicTablesPage;
