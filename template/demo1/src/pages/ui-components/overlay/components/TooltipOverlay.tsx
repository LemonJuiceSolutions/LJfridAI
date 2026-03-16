import { useState, useRef } from 'react';
import { Button, Overlay, Tooltip } from 'react-bootstrap';

function TooltipOverlayExample() {
  const [show, setShow] = useState(false);
  const target = useRef(null);

  return (
    <>
      <Button ref={target} onClick={() => setShow(!show)}>
        Click me!
      </Button>
      <Overlay target={target.current} show={show} placement="right">
        {(props) => (
          <Tooltip id="overlay-example" {...props}>
            My Tooltip
          </Tooltip>
        )}
      </Overlay>
    </>
  );
}

export default TooltipOverlayExample;

export const tooltipOverlayExampleCode = `import { useState, useRef } from 'react';
import { Button, Overlay, Tooltip } from 'react-bootstrap';

function TooltipOverlayExample() {
  const [show, setShow] = useState(false);
  const target = useRef(null);

  return (
    <>
      <Button ref={target} onClick={() => setShow(!show)}>
        Click me!
      </Button>
      <Overlay target={target.current} show={show} placement="right">
        {(props) => (
          <Tooltip id="overlay-example" {...props}>
            My Tooltip
          </Tooltip>
        )}
      </Overlay>
    </>
  );
}

export default TooltipOverlayExample;`;
