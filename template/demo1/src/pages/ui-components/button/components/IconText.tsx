import { Box, CheckSquare } from 'lucide-react';
import { Button } from 'react-bootstrap';

function IconTextExample() {
  return (
    <>
      <Button variant="primary" className="btn-icon-text">
        <CheckSquare className="btn-icon-prepend" />
        Button with Icon
      </Button>
      <Button variant="secondary" className="btn-icon-text">
        Button with Icon
        <Box className="btn-icon-append" />
      </Button>
    </>
  );
}

export default IconTextExample;

export const iconTextExampleCode = `import { Box, CheckSquare } from 'lucide-react';
import { Button } from 'react-bootstrap';

function IconTextExample() {
  return (
    <>
      <Button variant="primary" className='btn-icon-text'>
        <CheckSquare className='btn-icon-prepend'/>
        Button with Icon
      </Button>
      <Button variant="secondary" className='btn-icon-text'>
        Button with Icon
        <Box className='btn-icon-append'/>
      </Button>
    </>
  );
}

export default IconTextExample;`;
