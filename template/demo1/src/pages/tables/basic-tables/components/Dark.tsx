import { Table } from 'react-bootstrap';

const Dark = () => {
  return (
    <Table responsive variant="dark">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Salary</th>
          <th>Start date</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>Cedric Kelly</td>
          <td>$206,850</td>
          <td>June 21, 2010</td>
        </tr>
        <tr>
          <td>2</td>
          <td>Haley Kennedy</td>
          <td>$313,500</td>
          <td>May 15, 2013</td>
        </tr>
        <tr>
          <td>3</td>
          <td>Bradley Greer</td>
          <td>$132,000</td>
          <td>Apr 12, 2014</td>
        </tr>
        <tr>
          <td>4</td>
          <td>Brenden Wagner</td>
          <td>$206,850</td>
          <td>June 21, 2010</td>
        </tr>
        <tr>
          <td>5</td>
          <td>Bruno Nash</td>
          <td>$163,500</td>
          <td>January 01, 2016</td>
        </tr>
        <tr>
          <td>6</td>
          <td>Sonya Frost</td>
          <td>$103,600</td>
          <td>July 18, 2011</td>
        </tr>
        <tr>
          <td>7</td>
          <td>Zenaida Frank</td>
          <td>$313,500</td>
          <td>March 22, 2013</td>
        </tr>
      </tbody>
    </Table>
  );
};

export default Dark;
