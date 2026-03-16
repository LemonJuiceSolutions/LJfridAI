import { Pagination } from 'react-bootstrap';

function RoundedExample() {
  return (
    <Pagination className="pagination-rounded">
      <Pagination.Item>1</Pagination.Item>
      <Pagination.Item>2</Pagination.Item>
      <Pagination.Item active>3</Pagination.Item>
      <Pagination.Item>4</Pagination.Item>
      <Pagination.Item>5</Pagination.Item>
    </Pagination>
  );
}

export default RoundedExample;

export const roundedExampleCode = `import { Pagination } from 'react-bootstrap'

function RoundedExample() {
  return (
    <Pagination className="pagination-rounded">
      <Pagination.Item>1</Pagination.Item>
      <Pagination.Item>2</Pagination.Item>
      <Pagination.Item active>3</Pagination.Item>
      <Pagination.Item>4</Pagination.Item>
      <Pagination.Item>5</Pagination.Item>
    </Pagination>
  );
}

export default RoundedExample`;
