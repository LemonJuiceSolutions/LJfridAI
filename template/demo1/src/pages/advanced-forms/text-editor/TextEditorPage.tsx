import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import TextEditorExample from './components/TextEditor';

const TextEditorPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced Forms
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Text Editor</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React Quill New</Card.Title>
              <p className="text-secondary">
                A WYSIWYG editor built for the modern web. Read the Official{' '}
                <a href="https://github.com/VaguelySerious/react-quill" target="_blank" rel="noopener noreferrer">
                  React Quill New{' '}
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
              <TextEditorExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default TextEditorPage;
