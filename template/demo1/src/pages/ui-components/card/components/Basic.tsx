import { getUrl } from '@/utils/getUrl';
import { Button, Card } from 'react-bootstrap';

function BasicExample() {
  return (
    <Card style={{ width: '18rem' }}>
      <Card.Img variant="top" src={getUrl('/images/others/placeholder.webp')} />
      <Card.Body>
        <Card.Title>Card Title</Card.Title>
        <Card.Text className="mb-3">
          Some quick example text to build on the card title and make up the bulk of the card's content.
        </Card.Text>
        <Button variant="primary">Go somewhere</Button>
      </Card.Body>
    </Card>
  );
}

export default BasicExample;

export const basicExampleCode = `import { getUrl } from "@/utils/getUrl";
import { Button, Card } from "react-bootstrap";

function BasicExample() {
  return (
    <Card style={{ width: '18rem' }}>
      <Card.Img variant="top" src={getUrl('/images/others/placeholder.webp')} />
      <Card.Body>
        <Card.Title>Card Title</Card.Title>
        <Card.Text className="mb-3">
          Some quick example text to build on the card title and make up the
          bulk of the card's content.
        </Card.Text>
        <Button variant="primary">Go somewhere</Button>
      </Card.Body>
    </Card>
  );
}

export default BasicExample;`;
