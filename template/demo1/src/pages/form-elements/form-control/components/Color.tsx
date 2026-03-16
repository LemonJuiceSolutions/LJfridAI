import { Form } from 'react-bootstrap';

function ColorPickerExample() {
  return (
    <>
      <Form.Label htmlFor="exampleColorInput">Color picker</Form.Label>
      <Form.Control type="color" id="exampleColorInput" defaultValue="#563d7c" title="Choose your color" />
    </>
  );
}

export default ColorPickerExample;

export const colorPickerExampleCode = `import { Form } from "react-bootstrap";

function ColorPickerExample() {
  return (
    <>
      <Form.Label htmlFor="exampleColorInput">Color picker</Form.Label>
      <Form.Control
        type="color"
        id="exampleColorInput"
        defaultValue="#563d7c"
        title="Choose your color"
      />
    </>
  );
}

export default ColorPickerExample;`;
