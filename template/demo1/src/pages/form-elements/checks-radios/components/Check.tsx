import { Form } from 'react-bootstrap';

function CheckExample() {
  return (
    <Form>
      {(['checkbox', 'radio'] as const).map((type) => (
        <div key={`default-${type}`} className="mb-3">
          <Form.Check type={type} id={`default-${type}`} label={`default ${type}`} />

          <Form.Check disabled type={type} label={`disabled ${type}`} id={`disabled-default-${type}`} />
        </div>
      ))}
    </Form>
  );
}

export default CheckExample;

export const checkExampleCode = `import { Form } from "react-bootstrap";

function CheckExample() {
  return (
    <Form>
      {(['checkbox', 'radio'] as const).map((type) => (
        <div key={\`default-\${type}\`} className="mb-3">
          <Form.Check
            type={type}
            id={\`default-\${type}\`}
            label={\`default \${type}\`}
          />

          <Form.Check
            disabled
            type={type}
            label={\`disabled \${type}\`}
            id={\`disabled-default-\${type}\`}
          />
        </div>
      ))}
    </Form>
  );
}

export default CheckExample;`;
