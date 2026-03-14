import { Placeholder } from 'react-bootstrap';

function BasicExample() {
  return (
    <>
      <p aria-hidden="true" className="mb-3">
        <Placeholder xs={6} />
      </p>

      <Placeholder.Button xs={4} aria-hidden="true" />
    </>
  );
}

export default BasicExample;

export const basicExampleCode = `import { Placeholder } from 'react-bootstrap';

function BasicExample() {
  return (
    <>
      <p aria-hidden="true" className="mb-3">
        <Placeholder xs={6} />
      </p>

      <Placeholder.Button xs={4} aria-hidden="true" />
    </>
  );
}

export default BasicExample;`;
