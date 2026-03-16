import { Nav } from 'react-bootstrap';

function ListExample() {
  return (
    <Nav defaultActiveKey="link-0" as="ul">
      <Nav.Item as="li">
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item as="li">
        <Nav.Link eventKey="link-1">Link</Nav.Link>
      </Nav.Item>
      <Nav.Item as="li">
        <Nav.Link eventKey="link-2">Link</Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

export default ListExample;

export const listExampleCode = `import { Nav } from 'react-bootstrap';

function ListExample() {
  return (
    <Nav defaultActiveKey="link-0" as="ul">
      <Nav.Item as="li">
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item as="li">
        <Nav.Link eventKey="link-1">Link</Nav.Link>
      </Nav.Item>
      <Nav.Item as="li">
        <Nav.Link eventKey="link-2">Link</Nav.Link>
      </Nav.Item>
    </Nav>
  );
}

export default ListExample;`;
