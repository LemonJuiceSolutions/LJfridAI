import { Button } from 'react-bootstrap';

function ActiveExample() {
  return (
    <>
      <Button variant="primary" active>
        Primary button
      </Button>
      <Button variant="secondary" active>
        Button
      </Button>
    </>
  );
}

export default ActiveExample;

export const activeExampleCode = `import { Button } from 'react-bootstrap';

function ActiveExample() {
  return (
    <>
      <Button variant="primary" active>
        Primary button
      </Button>
      <Button variant="secondary" active>
        Button
      </Button>
    </>
  );
}

export default ActiveExample;`;
