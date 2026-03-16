import { Spinner } from 'react-bootstrap';

function SizesExample() {
  return (
    <>
      <Spinner animation="border" size="sm" />
      <Spinner animation="border" />
      <Spinner animation="grow" size="sm" />
      <Spinner animation="grow" />
    </>
  );
}

export default SizesExample;

export const sizesExampleCode = `import { Spinner } from "react-bootstrap";

function SizesExample() {
  return (
    <>
      <Spinner animation="border" size="sm" />
      <Spinner animation="border" />
      <Spinner animation="grow" size="sm" />
      <Spinner animation="grow" />
    </>
  );
}

export default SizesExample;`;
