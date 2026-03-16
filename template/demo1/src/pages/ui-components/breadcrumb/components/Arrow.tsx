import { Breadcrumb } from 'react-bootstrap';

function ArrowExample() {
  return (
    <Breadcrumb bsPrefix="breadcrumb breadcrumb-arrow">
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">Library</Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  );
}

export default ArrowExample;

export const arrowExampleCode = `import { Breadcrumb } from 'react-bootstrap'

function ArrowExample() {
  return (
    <Breadcrumb bsPrefix="breadcrumb breadcrumb-arrow">
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">
        Library
      </Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  )
}

export default ArrowExample`;
