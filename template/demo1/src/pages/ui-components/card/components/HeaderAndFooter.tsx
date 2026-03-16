import { Button, Card } from 'react-bootstrap';

function HeaderAndFooterExample() {
  return (
    <Card className="text-center">
      <Card.Header>Featured</Card.Header>
      <Card.Body>
        <Card.Title>Special title treatment</Card.Title>
        <Card.Text className="mb-3">With supporting text below as a natural lead-in to additional content.</Card.Text>
        <Button variant="primary">Go somewhere</Button>
      </Card.Body>
      <Card.Footer className="text-secondary">2 days ago</Card.Footer>
    </Card>
  );
}

export default HeaderAndFooterExample;

export const headerAndFooterExampleCode = `import { Button, Card } from "react-bootstrap";

function HeaderAndFooterExample() {
  return (
    <Card className="text-center">
      <Card.Header>Featured</Card.Header>
      <Card.Body>
        <Card.Title>Special title treatment</Card.Title>
        <Card.Text className="mb-3">
          With supporting text below as a natural lead-in to additional content.
        </Card.Text>
        <Button variant="primary">Go somewhere</Button>
      </Card.Body>
      <Card.Footer className="text-secondary">2 days ago</Card.Footer>
    </Card>
  );
}

export default HeaderAndFooterExample;`;
