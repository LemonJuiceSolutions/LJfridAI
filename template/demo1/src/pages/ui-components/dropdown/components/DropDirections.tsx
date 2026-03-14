import { ButtonGroup, Dropdown, DropdownButton, SplitButton } from 'react-bootstrap';

function DropDirectionExample() {
  const directions = ['up', 'up-centered', 'down', 'down-centered', 'start', 'end'] as const;

  return (
    <>
      {directions.map((direction) => (
        <DropdownButton
          as={ButtonGroup}
          key={direction}
          id={`dropdown-button-drop-${direction}`}
          drop={direction}
          variant="secondary"
          title={`Drop ${direction}`}
        >
          <Dropdown.Item eventKey="1">Action</Dropdown.Item>
          <Dropdown.Item eventKey="2">Another action</Dropdown.Item>
          <Dropdown.Item eventKey="3">Something else here</Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item eventKey="4">Separated link</Dropdown.Item>
        </DropdownButton>
      ))}

      {directions.map((direction) => (
        <SplitButton
          key={direction}
          id={`dropdown-button-drop-${direction}`}
          drop={direction}
          variant="secondary"
          title={`Drop ${direction}`}
        >
          <Dropdown.Item eventKey="1">Action</Dropdown.Item>
          <Dropdown.Item eventKey="2">Another action</Dropdown.Item>
          <Dropdown.Item eventKey="3">Something else here</Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item eventKey="4">Separated link</Dropdown.Item>
        </SplitButton>
      ))}
    </>
  );
}

export default DropDirectionExample;

export const dropDirectionExampleCode = `import { ButtonGroup, Dropdown, DropdownButton, SplitButton } from "react-bootstrap";

function DropDirectionExample() {
  const directions = ['up', 'up-centered', 'down', 'down-centered', 'start', 'end'] as const;

  return (
    <>
      {directions.map(
        (direction) => (
          <DropdownButton
            as={ButtonGroup}
            key={direction}
            id={\`dropdown-button-drop-\${direction}\`}
            drop={direction}
            variant="secondary"
            title={\`Drop \${direction}\`}
          >
            <Dropdown.Item eventKey="1">Action</Dropdown.Item>
            <Dropdown.Item eventKey="2">Another action</Dropdown.Item>
            <Dropdown.Item eventKey="3">Something else here</Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item eventKey="4">Separated link</Dropdown.Item>
          </DropdownButton>
        ),
      )}

      {directions.map(
        (direction) => (
          <SplitButton
            key={direction}
            id={\`dropdown-button-drop-\${direction}\`}
            drop={direction}
            variant="secondary"
            title={\`Drop \${direction}\`}
          >
            <Dropdown.Item eventKey="1">Action</Dropdown.Item>
            <Dropdown.Item eventKey="2">Another action</Dropdown.Item>
            <Dropdown.Item eventKey="3">Something else here</Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item eventKey="4">Separated link</Dropdown.Item>
          </SplitButton>
        ),
      )}
    </>
  );
}

export default DropDirectionExample;`;
