import { useState } from 'react';
import { Button, Card, Collapse } from 'react-bootstrap';

function BasicExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(!open)} aria-controls="example-collapse-text" aria-expanded={open}>
        Toggle
      </Button>
      <Collapse in={open}>
        <div id="example-collapse-text">
          <Card body>
            Anim pariatur cliche reprehenderit, enim eiusmod high life accusamus terry richardson ad squid. Nihil anim
            keffiyeh helvetica, craft beer labore wes anderson cred nesciunt sapiente ea proident.
          </Card>
        </div>
      </Collapse>
    </>
  );
}

export default BasicExample;

export const basicExampleCode = `import { useState } from "react";
import { Button, Card, Collapse } from "react-bootstrap"

function BasicExample() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Button
        onClick={() => setOpen(!open)}
        aria-controls="example-collapse-text"
        aria-expanded={open}
      >
        Toggle
      </Button>
      <Collapse in={open}>
        <div id="example-collapse-text">
          <Card body>
            Anim pariatur cliche reprehenderit, enim eiusmod high life accusamus
            terry richardson ad squid. Nihil anim keffiyeh helvetica, craft beer
            labore wes anderson cred nesciunt sapiente ea proident.
          </Card>
        </div>
      </Collapse>
    </>
  )
}

export default BasicExample`;
