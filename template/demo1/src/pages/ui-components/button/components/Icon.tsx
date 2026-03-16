import { Box, CheckSquare } from 'lucide-react';
import { Button } from 'react-bootstrap';

function IconExample() {
  return (
    <>
      <Button variant="primary" className="btn-icon">
        <CheckSquare />
      </Button>
      <Button variant="secondary" className="btn-icon">
        <Box />
      </Button>
    </>
  );
}

export default IconExample;

export const iconExampleCode = `import { Box, CheckSquare } from 'lucide-react';
import { Button } from 'react-bootstrap';

function IconExample() {
  return (
    <>
      <Button variant="primary" className='btn-icon'>
        <CheckSquare />
      </Button>
      <Button variant="secondary" className='btn-icon'>
        <Box />
      </Button>
    </>
  );
}

export default IconExample;`;
