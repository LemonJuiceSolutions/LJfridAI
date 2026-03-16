import { Breadcrumb } from 'react-bootstrap';

function BasicExample() {
  return (
    <Breadcrumb>
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">Library</Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  );
}

export default BasicExample;

export const basicExampleCode = `import { Breadcrumb } from 'react-bootstrap'

function BasicExample() {
  return (
    <Breadcrumb>
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">
        Library
      </Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  )
}

export default BasicExample`;
