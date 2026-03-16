import { ProgressBar } from 'react-bootstrap';

function ContextualExample() {
  return (
    <div>
      <ProgressBar variant="success" now={40} />
      <ProgressBar variant="info" now={20} />
      <ProgressBar variant="warning" now={60} />
      <ProgressBar variant="danger" now={80} />
    </div>
  );
}

export default ContextualExample;

export const contextualExampleCode = `import { ProgressBar } from 'react-bootstrap';

function ContextualExample() {
  return (
    <div>
      <ProgressBar variant="success" now={40} />
      <ProgressBar variant="info" now={20} />
      <ProgressBar variant="warning" now={60} />
      <ProgressBar variant="danger" now={80} />
    </div>
  );
}

export default ContextualExample;`;
