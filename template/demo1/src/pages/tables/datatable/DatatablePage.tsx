import { Breadcrumb, Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import DatatableExample from './components/Datatable';

const DatatablePage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Tables
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Datatable</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>TanStack Table</Card.Title>
              <p className="text-secondary">
                Read the{' '}
                <a href="https://tanstack.com/table/latest" target="_blank" rel="noopener noreferrer">
                  {' '}
                  Official TanStack Table Documentation{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={12} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Example</Card.Title>
              <DatatableExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default DatatablePage;
