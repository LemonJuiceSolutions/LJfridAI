import { MoreHorizontal } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';

function CustomTogglerExample() {
  return (
    <Dropdown>
      <Dropdown.Toggle as="a" id="custom-toggler" className="no-toggle-icon">
        <MoreHorizontal className="text-secondary icon-md" />
      </Dropdown.Toggle>

      <Dropdown.Menu>
        <Dropdown.Item href="#/action-1">Action</Dropdown.Item>
        <Dropdown.Item href="#/action-2">Another action</Dropdown.Item>
        <Dropdown.Item href="#/action-3">Something else</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default CustomTogglerExample;

export const customTogglerExampleCode = `import { MoreHorizontal } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';

function CustomTogglerExample() {
  return (
    <Dropdown>
      <Dropdown.Toggle as='a' id="custom-toggler" className='no-toggle-icon'>
        <MoreHorizontal className='text-secondary icon-md'/>
      </Dropdown.Toggle>

      <Dropdown.Menu>
        <Dropdown.Item href="#/action-1">Action</Dropdown.Item>
        <Dropdown.Item href="#/action-2">Another action</Dropdown.Item>
        <Dropdown.Item href="#/action-3">Something else</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default CustomTogglerExample;`;
