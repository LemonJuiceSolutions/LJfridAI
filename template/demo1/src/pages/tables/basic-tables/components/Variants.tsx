import { Table } from 'react-bootstrap';

const Variants = () => {
  return (
    <Table responsive>
      <thead>
        <tr className="table-dark">
          <th>#</th>
          <th>Name</th>
          <th>Product</th>
          <th>Salary</th>
          <th>Start date</th>
        </tr>
      </thead>
      <tbody>
        <tr className="table-info">
          <td>1</td>
          <td>Cedric Kelly</td>
          <td>Photoshop</td>
          <td>$206,850</td>
          <td>June 21, 2010</td>
        </tr>
        <tr className="table-warning">
          <td>2</td>
          <td>Haley Kennedy</td>
          <td>Flash</td>
          <td>$313,500</td>
          <td>May 15, 2013</td>
        </tr>
        <tr className="table-danger">
          <td>3</td>
          <td>Bradley Greer</td>
          <td>Premeire</td>
          <td>$132,000</td>
          <td>Apr 12, 2014</td>
        </tr>
        <tr className="table-success">
          <td>4</td>
          <td>Brenden Wagner</td>
          <td>After effects</td>
          <td>$206,850</td>
          <td>June 21, 2010</td>
        </tr>
        <tr className="table-primary">
          <td>5</td>
          <td>Bruno Nash</td>
          <td>Illustrator</td>
          <td>$163,500</td>
          <td>January 01, 2016</td>
        </tr>
      </tbody>
    </Table>
  );
};

export default Variants;
