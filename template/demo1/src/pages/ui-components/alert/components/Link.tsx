import { Alert } from 'react-bootstrap';

function LinkExample() {
  return (
    <>
      <Alert variant="danger">
        This is a danger alert with <Alert.Link href="#">an example link</Alert.Link>. Give it a click if you like.
      </Alert>
    </>
  );
}

export default LinkExample;

export const linkExampleCode = `import { Alert } from "react-bootstrap";

function LinkExample() {
  return (
    <>
      <Alert variant="danger">
        This is a danger alert with{' '}
        <Alert.Link href="#">an example link</Alert.Link>. Give it a click if
        you like.
      </Alert>
    </>
  );
}

export default LinkExample;`;
