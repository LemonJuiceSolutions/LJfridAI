import { useState } from 'react';
import { Button, Offcanvas, OffcanvasProps } from 'react-bootstrap';

function OffCanvasExample({
  name,
  placement,
}: {
  name: OffcanvasProps['placement'];
  placement: OffcanvasProps['placement'];
}) {
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button variant="primary" onClick={handleShow} className="me-2">
        {name}
      </Button>
      <Offcanvas show={show} onHide={handleClose} placement={placement}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Offcanvas</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          Some text as placeholder. In real life you can have the elements you have chosen. Like, text, images, lists,
          etc.
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}

function PlacementExample() {
  const placements: OffcanvasProps['placement'][] = ['start', 'end', 'top', 'bottom'];

  return (
    <>
      {placements.map((placement, idx) => (
        <OffCanvasExample key={idx} placement={placement} name={placement} />
      ))}
    </>
  );
}

export default PlacementExample;

export const placementExampleCode = `import { useState } from 'react';
import { Button, Offcanvas, OffcanvasProps } from 'react-bootstrap';

function OffCanvasExample({ 
  name, 
  placement 
}: { 
  name: OffcanvasProps['placement'], 
  placement: OffcanvasProps['placement']
}) {
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return (
    <>
      <Button variant="primary" onClick={handleShow} className="me-2">
        {name}
      </Button>
      <Offcanvas show={show} onHide={handleClose} placement={placement}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Offcanvas</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          Some text as placeholder. In real life you can have the elements you
          have chosen. Like, text, images, lists, etc.
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}

function PlacementExample() {
  const placements: OffcanvasProps['placement'][] = ['start', 'end', 'top', 'bottom']
  
  return (
    <>
      {placements.map((placement, idx) => (
        <OffCanvasExample key={idx} placement={placement} name={placement} />
      ))}
    </>
  );
}

export default PlacementExample`;
