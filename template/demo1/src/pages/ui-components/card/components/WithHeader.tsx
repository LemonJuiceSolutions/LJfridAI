import { Button, Card } from 'react-bootstrap';

function WithHeaderExample() {
  return (
    <Card>
      <Card.Header>Featured</Card.Header>
      <Card.Body>
        <Card.Title>Special title treatment</Card.Title>
        <Card.Text className="mb-3">With supporting text below as a natural lead-in to additional content.</Card.Text>
        <Button variant="primary">Go somewhere</Button>
      </Card.Body>
    </Card>
  );
}

export default WithHeaderExample;

export const withHeaderExampleCode = `import { Button, Card } from "react-bootstrap";

function WithHeaderExample() {
  return (
    <Card>
      <Card.Header>Featured</Card.Header>
      <Card.Body>
        <Card.Title>Special title treatment</Card.Title>
        <Card.Text className="mb-3">
          With supporting text below as a natural lead-in to additional content.
        </Card.Text>
        <Button variant="primary">Go somewhere</Button>
      </Card.Body>
    </Card>
  );
}

export default WithHeaderExample;`;
