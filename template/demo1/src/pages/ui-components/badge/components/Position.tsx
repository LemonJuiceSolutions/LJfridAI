import { Badge, Button } from 'react-bootstrap';

function PositionExample() {
  return (
    <Button variant="primary" className="position-relative">
      Inbox{' '}
      <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle">
        99+
      </Badge>
      <span className="visually-hidden">unread messages</span>
    </Button>
  );
}

export default PositionExample;

export const positionExampleCode = `import { Badge, Button } from "react-bootstrap"

function PositionExample() {
  return (
    <Button variant="primary" className="position-relative">
      Inbox <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle">99+</Badge>
      <span className="visually-hidden">unread messages</span>
    </Button>
  )
}

export default PositionExample`;
