import { Toast } from 'react-bootstrap';

function BasicExample() {
  return (
    <Toast>
      <Toast.Header>
        <strong className="me-auto">Bootstrap</strong>
        <small>11 mins ago</small>
      </Toast.Header>
      <Toast.Body>Hello, world! This is a toast message.</Toast.Body>
    </Toast>
  );
}

export default BasicExample;

export const basicExampleCode = `import { Toast } from "react-bootstrap";

function BasicExample() {
  return (
    <Toast>
      <Toast.Header>
        <strong className="me-auto">Bootstrap</strong>
        <small>11 mins ago</small>
      </Toast.Header>
      <Toast.Body>Hello, world! This is a toast message.</Toast.Body>
    </Toast>
  );
}

export default BasicExample;`;
