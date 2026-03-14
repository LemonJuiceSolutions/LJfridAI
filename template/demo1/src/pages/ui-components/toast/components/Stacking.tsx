import { ToastContainer, Toast } from 'react-bootstrap';

function StackingExample() {
  return (
    <ToastContainer className="position-static">
      <Toast>
        <Toast.Header>
          <strong className="me-auto">Bootstrap</strong>
          <small className="text-secondary">just now</small>
        </Toast.Header>
        <Toast.Body>See? Just like this.</Toast.Body>
      </Toast>
      <Toast>
        <Toast.Header>
          <strong className="me-auto">Bootstrap</strong>
          <small className="text-secondary">2 seconds ago</small>
        </Toast.Header>
        <Toast.Body>Heads up, toasts will stack automatically</Toast.Body>
      </Toast>
    </ToastContainer>
  );
}

export default StackingExample;

export const stackingExampleCode = `import { ToastContainer, Toast } from "react-bootstrap";

function StackingExample() {
  return (
    <ToastContainer className="position-static">
      <Toast>
        <Toast.Header>
          <strong className="me-auto">Bootstrap</strong>
          <small className="text-secondary">just now</small>
        </Toast.Header>
        <Toast.Body>See? Just like this.</Toast.Body>
      </Toast>
      <Toast>
        <Toast.Header>
          <strong className="me-auto">Bootstrap</strong>
          <small className="text-secondary">2 seconds ago</small>
        </Toast.Header>
        <Toast.Body>Heads up, toasts will stack automatically</Toast.Body>
      </Toast>
    </ToastContainer>
  );
}

export default StackingExample;`;
