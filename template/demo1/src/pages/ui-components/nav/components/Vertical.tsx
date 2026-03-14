import { Nav } from 'react-bootstrap';

function VerticalExample() {
  return (
    <Nav defaultActiveKey="link-0" className="flex-column">
      <Nav.Link eventKey="link-0">Active</Nav.Link>
      <Nav.Link eventKey="link-1">Link</Nav.Link>
      <Nav.Link eventKey="link-2">Link</Nav.Link>
      <Nav.Link eventKey="disabled" disabled>
        Disabled
      </Nav.Link>
    </Nav>
  );
}

export default VerticalExample;

export const verticalExampleCode = `import { Nav } from 'react-bootstrap';

function VerticalExample() {
  return (
    <Nav defaultActiveKey="link-0" className="flex-column">
      <Nav.Link eventKey="link-0">Active</Nav.Link>
      <Nav.Link eventKey="link-1">Link</Nav.Link>
      <Nav.Link eventKey="link-2">Link</Nav.Link>
      <Nav.Link eventKey="disabled" disabled>
        Disabled
      </Nav.Link>
    </Nav>
  );
}

export default VerticalExample;`;
