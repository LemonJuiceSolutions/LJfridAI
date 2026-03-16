import { Placeholder } from 'react-bootstrap';

function SizeExample() {
  return (
    <>
      <Placeholder xs={12} size="lg" />
      <Placeholder xs={12} />
      <Placeholder xs={12} size="sm" />
      <Placeholder xs={12} size="xs" />
    </>
  );
}

export default SizeExample;

export const sizeExampleCode = `import { Placeholder } from 'react-bootstrap';

function SizeExample() {
  return (
    <>
      <Placeholder xs={12} size="lg" />
      <Placeholder xs={12} />
      <Placeholder xs={12} size="sm" />
      <Placeholder xs={12} size="xs" />
    </>
  );
}

export default SizeExample;`;
