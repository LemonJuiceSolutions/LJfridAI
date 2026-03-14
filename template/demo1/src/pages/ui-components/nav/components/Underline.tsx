import { Nav } from 'react-bootstrap';

function UnderlineExample() {
  return (
    <Nav variant="underline" defaultActiveKey="link-0">
      <Nav.Item>
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-1">Option 2</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="disabled" disabled>
          Disabled
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

export default UnderlineExample;

export const underlineExampleCode = `import { Nav } from 'react-bootstrap';

function UnderlineExample() {
  return (
    <Nav variant="underline" defaultActiveKey="link-0">
      <Nav.Item>
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-1">Option 2</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="disabled" disabled>
          Disabled
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

export default UnderlineExample;`;
