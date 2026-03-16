import { useState } from 'react';
import { Row, Col, Toast, Button } from 'react-bootstrap';

function AutohideExample() {
  const [show, setShow] = useState(false);

  return (
    <Row>
      <Col xs={6}>
        <Button onClick={() => setShow(true)}>Show Toast</Button>
      </Col>
      <Col xs={6}>
        <Toast onClose={() => setShow(false)} show={show} delay={3000} autohide className="ms-auto">
          <Toast.Header>
            <strong className="me-auto">Bootstrap</strong>
            <small>11 mins ago</small>
          </Toast.Header>
          <Toast.Body>Woohoo, you're reading this text in a Toast!</Toast.Body>
        </Toast>
      </Col>
    </Row>
  );
}

export default AutohideExample;

export const autohideExampleCode = `import { useState } from "react";
import { Row, Col, Toast, Button } from "react-bootstrap";

function AutohideExample() {
  const [show, setShow] = useState(false);

  return (
    <Row>
      <Col xs={6}>
        <Button onClick={() => setShow(true)}>Show Toast</Button>
      </Col>
      <Col xs={6}>
        <Toast onClose={() => setShow(false)} show={show} delay={3000} autohide className="ms-auto">
          <Toast.Header>
            <strong className="me-auto">Bootstrap</strong>
            <small>11 mins ago</small>
          </Toast.Header>
          <Toast.Body>Woohoo, you're reading this text in a Toast!</Toast.Body>
        </Toast>
      </Col>
      
    </Row>
  );
}

export default AutohideExample;`;
