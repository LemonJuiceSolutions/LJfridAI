import { ListGroup } from 'react-bootstrap';

function NumberedExample() {
  return (
    <ListGroup as="ol" numbered>
      <ListGroup.Item as="li">Cras justo odio</ListGroup.Item>
      <ListGroup.Item as="li">Cras justo odio</ListGroup.Item>
      <ListGroup.Item as="li">Cras justo odio</ListGroup.Item>
    </ListGroup>
  );
}

export default NumberedExample;

export const numberedExampleCode = `import { ListGroup } from "react-bootstrap";

function NumberedExample() {
  return (
    <ListGroup as="ol" numbered>
      <ListGroup.Item as="li">Cras justo odio</ListGroup.Item>
      <ListGroup.Item as="li">Cras justo odio</ListGroup.Item>
      <ListGroup.Item as="li">Cras justo odio</ListGroup.Item>
    </ListGroup>
  );
}

export default NumberedExample;`;
