import { Form } from 'react-bootstrap';

function ReadOnlyExample() {
  return <Form.Control type="text" placeholder="Readonly input here..." readOnly />;
}

export default ReadOnlyExample;

export const readOnlyExampleCode = `import { Form } from "react-bootstrap";

function ReadOnlyExample() {
  return (
    <Form.Control type="text" placeholder="Readonly input here..." readOnly />
  );
}

export default ReadOnlyExample;`;
