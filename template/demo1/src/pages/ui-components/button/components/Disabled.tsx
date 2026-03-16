import { Button } from 'react-bootstrap';

function DisabledExample() {
  return (
    <>
      <Button variant="primary" disabled>
        Primary button
      </Button>
      <Button variant="secondary" disabled>
        Button
      </Button>
      <Button href="#" variant="secondary" disabled>
        Link
      </Button>
    </>
  );
}

export default DisabledExample;

export const disabledExampleCode = `import { Button } from 'react-bootstrap';

function DisabledExample() {
  return (
    <>
      <Button variant="primary" disabled>
        Primary button
      </Button>
      <Button variant="secondary" disabled>
        Button
      </Button>
      <Button href="#" variant="secondary" disabled>
        Link
      </Button>
    </>
  );
}

export default DisabledExample;`;
