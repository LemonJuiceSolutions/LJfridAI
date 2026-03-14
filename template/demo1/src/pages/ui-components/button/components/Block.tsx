import { Button } from 'react-bootstrap';

function BlockExample() {
  return (
    <div className="d-grid gap-2">
      <Button variant="primary">Block level button</Button>
      <Button variant="secondary">Block level button</Button>
    </div>
  );
}

export default BlockExample;

export const blockExampleCode = `import { Button } from "react-bootstrap";

function BlockExample() {
  return (
    <div className="d-grid gap-2">
      <Button variant="primary">
        Block level button
      </Button>
      <Button variant="secondary">
        Block level button
      </Button>
    </div>
  );
}

export default BlockExample;`;
