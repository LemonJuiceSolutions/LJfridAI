import { Row, Col, Form } from 'react-bootstrap';

function GridColSizesExample() {
  return (
    <Form>
      <Row>
        <Col xs={7}>
          <Form.Control placeholder="City" />
        </Col>
        <Col>
          <Form.Control placeholder="State" />
        </Col>
        <Col>
          <Form.Control placeholder="Zip" />
        </Col>
      </Row>
    </Form>
  );
}

export default GridColSizesExample;

export const gridColSizesExampleCode = `import { Row, Col, Form } from "react-bootstrap";

function GridColSizesExample() {
  return (
    <Form>
      <Row>
        <Col xs={7}>
          <Form.Control placeholder="City" />
        </Col>
        <Col>
          <Form.Control placeholder="State" />
        </Col>
        <Col>
          <Form.Control placeholder="Zip" />
        </Col>
      </Row>
    </Form>
  );
}

export default GridColSizesExample;`;
