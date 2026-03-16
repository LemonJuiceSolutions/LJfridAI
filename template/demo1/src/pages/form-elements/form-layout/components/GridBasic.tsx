import { Row, Col, Form } from 'react-bootstrap';

function GridBasicExample() {
  return (
    <Form>
      <Row>
        <Col>
          <Form.Control placeholder="First name" />
        </Col>
        <Col>
          <Form.Control placeholder="Last name" />
        </Col>
      </Row>
    </Form>
  );
}

export default GridBasicExample;

export const gridBasicExampleCode = `import { Row, Col, Form } from "react-bootstrap";

function GridBasicExample() {
  return (
    <Form>
      <Row>
        <Col>
          <Form.Control placeholder="First name" />
        </Col>
        <Col>
          <Form.Control placeholder="Last name" />
        </Col>
      </Row>
    </Form>
  );
}

export default GridBasicExample;`;
