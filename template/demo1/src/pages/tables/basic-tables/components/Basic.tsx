import { Table } from 'react-bootstrap';

const Basic = () => {
  return (
    <Table responsive>
      <thead>
        <tr>
          <th>#</th>
          <th>First Name</th>
          <th>LAST NAME</th>
          <th>USERNAME</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>1</th>
          <td>Mark</td>
          <td>Otto</td>
          <td>&#64;mdo</td>
        </tr>
        <tr>
          <th>2</th>
          <td>Jacob</td>
          <td>Thornton</td>
          <td>&#64;fat</td>
        </tr>
        <tr>
          <th>3</th>
          <td>Larry</td>
          <td>the Bird</td>
          <td>&#64;twitter</td>
        </tr>
        <tr>
          <th>4</th>
          <td>Larry</td>
          <td>Jellybean</td>
          <td>&#64;lajelly</td>
        </tr>
        <tr>
          <th>5</th>
          <td>Larry</td>
          <td>Kikat</td>
          <td>&#64;lakitkat</td>
        </tr>
      </tbody>
    </Table>
  );
};

export default Basic;
