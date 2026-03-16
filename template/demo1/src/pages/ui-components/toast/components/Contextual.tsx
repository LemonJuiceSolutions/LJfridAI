import { Toast } from 'react-bootstrap';

function ContextualExample() {
  return (
    <>
      {['Primary', 'Secondary', 'Success', 'Danger', 'Warning', 'Info', 'Light', 'Dark'].map((variant, idx) => (
        <Toast className="d-inline-block m-1" bg={variant.toLowerCase()} key={idx}>
          <Toast.Header>
            <strong className="me-auto">Bootstrap</strong>
            <small>11 mins ago</small>
          </Toast.Header>
          <Toast.Body className={variant === 'Dark' ? 'text-white' : ''}>
            Hello, world! This is a toast message.
          </Toast.Body>
        </Toast>
      ))}
    </>
  );
}

export default ContextualExample;

export const contextualExampleCode = `import { Toast } from "react-bootstrap";

function ContextualExample() {
  return (
    <>
      {[
        'Primary',
        'Secondary',
        'Success',
        'Danger',
        'Warning',
        'Info',
        'Light',
        'Dark',
      ].map((variant, idx) => (
        <Toast
          className="d-inline-block m-1"
          bg={variant.toLowerCase()}
          key={idx}
        >
          <Toast.Header>
            <strong className="me-auto">Bootstrap</strong>
            <small>11 mins ago</small>
          </Toast.Header>
          <Toast.Body className={variant === 'Dark' ? 'text-white' : ''}>
            Hello, world! This is a toast message.
          </Toast.Body>
        </Toast>
      ))}
    </>
  );
}

export default ContextualExample;`;
