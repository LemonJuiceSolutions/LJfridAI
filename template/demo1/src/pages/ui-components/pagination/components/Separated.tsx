import { Pagination } from 'react-bootstrap';

function SeparatedExample() {
  return (
    <Pagination className="pagination-separated">
      <Pagination.Item>1</Pagination.Item>
      <Pagination.Item>2</Pagination.Item>
      <Pagination.Item active>3</Pagination.Item>
      <Pagination.Item>4</Pagination.Item>
      <Pagination.Item>5</Pagination.Item>
    </Pagination>
  );
}

export default SeparatedExample;

export const separatedExampleCode = `import { Pagination } from 'react-bootstrap'

function SeparatedExample() {
  return (
    <Pagination className="pagination-separated">
      <Pagination.Item>1</Pagination.Item>
      <Pagination.Item>2</Pagination.Item>
      <Pagination.Item active>3</Pagination.Item>
      <Pagination.Item>4</Pagination.Item>
      <Pagination.Item>5</Pagination.Item>
    </Pagination>
  );
}

export default SeparatedExample`;
