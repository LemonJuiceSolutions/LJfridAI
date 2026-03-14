import { Alert } from 'react-bootstrap';

function FillExample() {
  return (
    <>
      <Alert variant="fill-primary">This is a fill-primary alert—check it out!</Alert>

      <Alert variant="fill-secondary">This is a fill-secondary alert—check it out!</Alert>

      <Alert variant="fill-success">This is a fill-success alert—check it out!</Alert>

      <Alert variant="fill-danger">This is a fill-danger alert—check it out!</Alert>

      <Alert variant="fill-warning">This is a fill-warning alert—check it out!</Alert>

      <Alert variant="fill-info">This is a fill-info alert—check it out!</Alert>

      <Alert variant="fill-light">This is a fill-light alert—check it out!</Alert>

      <Alert variant="fill-dark">This is a fill-dark alert—check it out!</Alert>
    </>
  );
}

export default FillExample;

export const fillExampleCode = `import { Alert } from "react-bootstrap";

function FillExample() {
  return (
    <>
      <Alert variant="fill-primary">
        This is a fill-primary alert—check it out!
      </Alert>
    </>
  );
}

export default FillExample;`;
