import { ProgressBar } from 'react-bootstrap';

function WithLabelExample() {
  const now = 60;
  return <ProgressBar now={now} label={`${now}%`} />;
}

export default WithLabelExample;

export const withLabelExampleCode = `import { ProgressBar } from 'react-bootstrap';

function WithLabelExample() {
  const now = 60;
  return <ProgressBar now={now} label={\`\${now}%\`} />;
}

export default WithLabelExample;`;
