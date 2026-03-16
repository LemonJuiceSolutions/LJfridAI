import { Form, InputGroup } from 'react-bootstrap';

function MultipleInputsExample() {
  return (
    <InputGroup className="mb-3">
      <InputGroup.Text>First and last name</InputGroup.Text>
      <Form.Control aria-label="First name" />
      <Form.Control aria-label="Last name" />
    </InputGroup>
  );
}

export default MultipleInputsExample;

export const multipleInputsExampleCode = `import { Form, InputGroup } from "react-bootstrap";

function MultipleInputsExample() {
  return (
    <InputGroup className="mb-3">
      <InputGroup.Text>First and last name</InputGroup.Text>
      <Form.Control aria-label="First name" />
      <Form.Control aria-label="Last name" />
    </InputGroup>
  );
}

export default MultipleInputsExample;`;
