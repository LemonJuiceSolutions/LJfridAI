import { Nav } from 'react-bootstrap';

function JustifiedExample() {
  return (
    <Nav justify variant="tabs" defaultActiveKey="link-0">
      <Nav.Item>
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-1">Loooonger NavLink</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-2">Link</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="disabled" disabled>
          Disabled
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

export default JustifiedExample;

export const justifiedExampleCode = `import { Nav } from 'react-bootstrap';

function JustifiedExample() {
  return (
    <Nav justify variant="tabs" defaultActiveKey="link-0">
      <Nav.Item>
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-1">Loooonger NavLink</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-2">Link</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="disabled" disabled>
          Disabled
        </Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

export default JustifiedExample;`;
