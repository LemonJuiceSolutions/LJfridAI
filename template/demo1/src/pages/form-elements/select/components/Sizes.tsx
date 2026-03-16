import { Form } from 'react-bootstrap';

function SizesExample() {
  return (
    <>
      <Form.Select size="lg">
        <option>Large select</option>
      </Form.Select>
      <br />
      <Form.Select>
        <option>Default select</option>
      </Form.Select>
      <br />
      <Form.Select size="sm">
        <option>Small select</option>
      </Form.Select>
    </>
  );
}

export default SizesExample;

export const sizesExampleCode = `import { Form } from "react-bootstrap";

function SizesExample() {
  return (
    <>
      <Form.Select size="lg">
        <option>Large select</option>
      </Form.Select>
      <br />
      <Form.Select>
        <option>Default select</option>
      </Form.Select>
      <br />
      <Form.Select size="sm">
        <option>Small select</option>
      </Form.Select>
    </>
  );
}

export default SizesExample;`;
