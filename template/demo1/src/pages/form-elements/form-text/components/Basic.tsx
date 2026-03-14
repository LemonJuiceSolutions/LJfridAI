import { Form } from 'react-bootstrap';

function BasicExample() {
  return (
    <>
      <Form.Label htmlFor="inputPassword5">Password</Form.Label>
      <Form.Control type="password" id="inputPassword5" aria-describedby="passwordHelpBlock" />
      <Form.Text id="passwordHelpBlock" className="text-secondary">
        Your password must be 8-20 characters long, contain letters and numbers, and must not contain spaces, special
        characters, or emoji.
      </Form.Text>
    </>
  );
}

export default BasicExample;

export const basicExampleCode = `import { Form } from "react-bootstrap";

function BasicExample() {
  return (
    <>
      <Form.Label htmlFor="inputPassword5">Password</Form.Label>
      <Form.Control
        type="password"
        id="inputPassword5"
        aria-describedby="passwordHelpBlock"
      />
      <Form.Text id="passwordHelpBlock" className="text-secondary">
        Your password must be 8-20 characters long, contain letters and numbers,
        and must not contain spaces, special characters, or emoji.
      </Form.Text>
    </>
  );
}

export default BasicExample;`;
