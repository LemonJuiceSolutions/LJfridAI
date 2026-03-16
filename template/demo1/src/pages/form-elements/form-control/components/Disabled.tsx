import { Form } from 'react-bootstrap';

function DisabledExample() {
  return (
    <>
      <Form.Control type="text" placeholder="Disabled input" aria-label="Disabled input example" disabled readOnly />
      <br />
      <Form.Control type="text" placeholder="Disabled readonly input" aria-label="Disabled input example" readOnly />
    </>
  );
}

export default DisabledExample;

export const disabledExampleCode = `import { Form } from "react-bootstrap";

function DisabledExample() {
  return (
    <>
      <Form.Control
        type="text"
        placeholder="Disabled input"
        aria-label="Disabled input example"
        disabled
        readOnly
      />
      <br />
      <Form.Control
        type="text"
        placeholder="Disabled readonly input"
        aria-label="Disabled input example"
        readOnly
      />
    </>
  );
}

export default DisabledExample;`;
