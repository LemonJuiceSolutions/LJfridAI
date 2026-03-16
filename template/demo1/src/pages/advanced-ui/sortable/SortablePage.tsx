import { Breadcrumb, Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import VerticalExample from './components/Vertical';
import GridExample from './components/Grid';
import HorizontalExample from './components/Horizontal';
import MultipleContainersExample from './components/MultipleContainers';

const SortablePage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced UI
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Sortable</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>DND Kit</Card.Title>
              <p className="text-secondary">
                @dnd-kit – A lightweight, modular, performant, accessible and extensible drag & drop toolkit for React.
                Read the{' '}
                <a href="https://github.com/clauderic/dnd-kit" target="_blank" rel="noopener noreferrer">
                  Official DnD Kit Documentation{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Vertical</Card.Title>
              <VerticalExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Grid</Card.Title>
              <GridExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Horizontal</Card.Title>
              <HorizontalExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={12} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Multiple Containers</Card.Title>
              <MultipleContainersExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default SortablePage;
