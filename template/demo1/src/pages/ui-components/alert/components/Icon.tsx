import { Alert } from 'react-bootstrap';
import { AlertOctagon } from 'lucide-react';

function IconExample() {
  return (
    <>
      <Alert variant="success">
        <div className="d-flex align-items-center">
          <AlertOctagon size={24} className="me-2" />
          This is a success alert—check it out!
        </div>
      </Alert>
    </>
  );
}

export default IconExample;

export const iconExampleCode = `import { Alert } from 'react-bootstrap';
import { AlertOctagon } from 'lucide-react';

function IconExample() {
  return (
    <>
      <Alert variant="success">
        <div className="d-flex align-items-center">
          <AlertOctagon size={24} className="me-2" />
          This is a success alert—check it out!
        </div>
      </Alert>
    </>
  );
}

export default IconExample;`;
