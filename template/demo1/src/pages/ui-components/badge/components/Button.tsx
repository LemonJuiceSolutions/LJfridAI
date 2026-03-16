import { Badge, Button } from 'react-bootstrap';

function ButtonExample() {
  return (
    <Button variant="primary">
      Notifications{' '}
      <Badge bg="light" text="dark">
        9
      </Badge>
      <span className="visually-hidden">unread messages</span>
    </Button>
  );
}

export default ButtonExample;

export const buttonExampleCode = `import { Badge, Button } from 'react-bootstrap';

function ButtonExample() {
  return (
    <Button variant="primary">
      Notifications <Badge bg="light" text="dark">9</Badge>
      <span className="visually-hidden">unread messages</span>
    </Button>
  );
}

export default ButtonExample;`;
