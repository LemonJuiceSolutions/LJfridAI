import { Breadcrumb } from 'react-bootstrap';

function DotExample() {
  return (
    <Breadcrumb bsPrefix="breadcrumb breadcrumb-dot">
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">Library</Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  );
}

export default DotExample;

export const dotExampleCode = `import { Breadcrumb } from 'react-bootstrap'

function DotExample() {
  return (
    <Breadcrumb bsPrefix="breadcrumb breadcrumb-dot">
      <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
      <Breadcrumb.Item href="https://getbootstrap.com/docs/5.3/components/breadcrumb/">
        Library
      </Breadcrumb.Item>
      <Breadcrumb.Item active>Data</Breadcrumb.Item>
    </Breadcrumb>
  )
}

export default DotExample`;
