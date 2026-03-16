import { Nav } from 'react-bootstrap';

function BasicExample() {
  return (
    <Nav activeKey="link-0" onSelect={(selectedKey) => alert(`selected ${selectedKey}`)}>
      <Nav.Item>
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-1">Link</Nav.Link>
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

export default BasicExample;

export const basicExampleCode = `import { Nav } from 'react-bootstrap';

function BasicExample() {
  return (
    <Nav
      activeKey="link-0"
      onSelect={(selectedKey) => alert(\`selected \${selectedKey}\`)}
    >
      <Nav.Item>
        <Nav.Link eventKey="link-0">Active</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="link-1">Link</Nav.Link>
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

export default BasicExample;`;
