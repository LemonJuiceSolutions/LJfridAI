import { Pagination } from 'react-bootstrap';

function BasicExample() {
  const active = 2;
  const items = [];

  for (let number = 1; number <= 5; number++) {
    items.push(
      <Pagination.Item key={number} active={number === active}>
        {number}
      </Pagination.Item>
    );
  }

  return (
    <div>
      <Pagination>{items}</Pagination>

      <Pagination size="lg">{items}</Pagination>

      <Pagination size="sm">{items}</Pagination>
    </div>
  );
}

export default BasicExample;

export const basicExampleCode = `import { Pagination } from 'react-bootstrap'

function BasicExample() {
  const active = 2;
  const items = [];
  
  for (let number = 1; number <= 5; number++) {
    items.push(
      <Pagination.Item key={number} active={number === active}>
        {number}
      </Pagination.Item>,
    );
  }

  return (
    <div>
      <Pagination>{items}</Pagination>

      <Pagination size="lg">{items}</Pagination>

      <Pagination size="sm">{items}</Pagination>
    </div>
  );
}

export default BasicExample`;
