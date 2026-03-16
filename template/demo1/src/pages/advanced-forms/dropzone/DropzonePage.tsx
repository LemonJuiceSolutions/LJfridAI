import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import DropzoneExample from './components/Example';

const DropzonePage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced Forms
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Dropzone</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Dropzone</Card.Title>
              <p className="text-secondary">
                Simple HTML5 drag-drop zone with React.js. Read the Official{' '}
                <a href="https://github.com/react-dropzone/react-dropzone" target="_blank" rel="noopener noreferrer">
                  React Dropzone{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Example</Card.Title>
              <DropzoneExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default DropzonePage;
