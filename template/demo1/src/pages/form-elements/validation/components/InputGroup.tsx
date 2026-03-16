import { Form, InputGroup } from 'react-bootstrap';

function ValidationInputGroupExample() {
  return (
    <InputGroup hasValidation>
      <InputGroup.Text>@</InputGroup.Text>
      <Form.Control type="text" required isInvalid />
      <Form.Control.Feedback type="invalid">Please choose a username.</Form.Control.Feedback>
    </InputGroup>
  );
}

export default ValidationInputGroupExample;

export const ValidationInputGroupExampleCode = `import { Form, InputGroup } from "react-bootstrap";

function ValidationInputGroupExample() {
  return (
    <InputGroup hasValidation>
      <InputGroup.Text>@</InputGroup.Text>
      <Form.Control type="text" required isInvalid />
      <Form.Control.Feedback type="invalid">
        Please choose a username.
      </Form.Control.Feedback>
    </InputGroup>
  );
}

export default ValidationInputGroupExample;`;
