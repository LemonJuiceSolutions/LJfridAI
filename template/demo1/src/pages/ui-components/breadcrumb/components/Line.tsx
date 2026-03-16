import { Breadcrumb } from 'react-bootstrap';

function LineExample() {
  return (
    <Breadcrumb bsPrefix="breadcrumb breadcrumb-line">
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">Library</Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  );
}

export default LineExample;

export const lineExampleCode = `import { Breadcrumb } from 'react-bootstrap'

function LineExample() {
  return (
    <Breadcrumb bsPrefix="breadcrumb breadcrumb-line">
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">
        Library
      </Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  )
}

export default LineExample`;
