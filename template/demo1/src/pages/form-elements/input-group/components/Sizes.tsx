import { Form, InputGroup } from 'react-bootstrap';

function SizesExample() {
  return (
    <>
      <InputGroup size="sm" className="mb-3">
        <InputGroup.Text id="inputGroup-sizing-sm">Small</InputGroup.Text>
        <Form.Control aria-label="Small" aria-describedby="inputGroup-sizing-sm" />
      </InputGroup>
      <br />
      <InputGroup className="mb-3">
        <InputGroup.Text id="inputGroup-sizing-default">Default</InputGroup.Text>
        <Form.Control aria-label="Default" aria-describedby="inputGroup-sizing-default" />
      </InputGroup>
      <br />
      <InputGroup size="lg">
        <InputGroup.Text id="inputGroup-sizing-lg">Large</InputGroup.Text>
        <Form.Control aria-label="Large" aria-describedby="inputGroup-sizing-sm" />
      </InputGroup>
    </>
  );
}

export default SizesExample;

export const sizesExampleCode = `import { Form, InputGroup } from "react-bootstrap";

function SizesExample() {
  return (
    <>
      <InputGroup size="sm" className="mb-3">
        <InputGroup.Text id="inputGroup-sizing-sm">Small</InputGroup.Text>
        <Form.Control
          aria-label="Small"
          aria-describedby="inputGroup-sizing-sm"
        />
      </InputGroup>
      <br />
      <InputGroup className="mb-3">
        <InputGroup.Text id="inputGroup-sizing-default">
          Default
        </InputGroup.Text>
        <Form.Control
          aria-label="Default"
          aria-describedby="inputGroup-sizing-default"
        />
      </InputGroup>
      <br />
      <InputGroup size="lg">
        <InputGroup.Text id="inputGroup-sizing-lg">Large</InputGroup.Text>
        <Form.Control
          aria-label="Large"
          aria-describedby="inputGroup-sizing-sm"
        />
      </InputGroup>
    </>
  );
}

export default SizesExample;`;
