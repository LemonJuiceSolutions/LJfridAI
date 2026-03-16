import React from 'react';
import { Table, Badge } from 'react-bootstrap';

const ProjectsTable = () => {
  return (
    <Table responsive hover>
      <thead>
        <tr>
          <th className="pt-0">#</th>
          <th className="pt-0">Project Name</th>
          <th className="pt-0">Start Date</th>
          <th className="pt-0">Due Date</th>
          <th className="pt-0">Status</th>
          <th className="pt-0">Assign</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>NobleUI HTML</td>
          <td>01/03/2026</td>
          <td>26/08/2026</td>
          <td>
            <Badge bg="danger">Released</Badge>
          </td>
          <td>Leonardo Payne</td>
        </tr>
        <tr>
          <td>2</td>
          <td>NobleUI Angular</td>
          <td>01/01/2026</td>
          <td>26/04/2026</td>
          <td>
            <Badge bg="success">Review</Badge>
          </td>
          <td>Carl Henson</td>
        </tr>
        <tr>
          <td>3</td>
          <td>NobleUI React</td>
          <td>01/05/2026</td>
          <td>10/09/2026</td>
          <td>
            <Badge bg="info" text="dark">
              Pending
            </Badge>
          </td>
          <td>Jensen Combs</td>
        </tr>
        <tr>
          <td>4</td>
          <td>NobleUI Vue</td>
          <td>01/09/2026</td>
          <td>31/11/2026</td>
          <td>
            <Badge bg="warning" text="dark">
              Work in Progress
            </Badge>
          </td>
          <td>Amiah Burton</td>
        </tr>
        <tr>
          <td>5</td>
          <td>NobleUI Laravel</td>
          <td>01/04/2026</td>
          <td>31/12/2026</td>
          <td>
            <Badge bg="danger" text="white">
              Coming soon
            </Badge>
          </td>
          <td>Yaretzi Mayo</td>
        </tr>
        <tr>
          <td>6</td>
          <td>NobleUI NodeJs</td>
          <td>01/01/2026</td>
          <td>31/07/2026</td>
          <td>
            <Badge bg="primary">Coming soon</Badge>
          </td>
          <td>Carl Henson</td>
        </tr>
        <tr>
          <td>6</td>
          <td>NobleUI Svelte</td>
          <td>01/08/2026</td>
          <td>31/12/2026</td>
          <td>
            <Badge bg="warning" text="dark">
              Testing
            </Badge>
          </td>
          <td>Ava Smith</td>
        </tr>
        <tr>
          <td>7</td>
          <td>NobleUI NextJs</td>
          <td>01/05/2026</td>
          <td>10/11/2026</td>
          <td>
            <Badge bg="info" text="dark">
              Pending
            </Badge>
          </td>
          <td>Jensen Combs</td>
        </tr>
      </tbody>
    </Table>
  );
};

export default React.memo(ProjectsTable);
