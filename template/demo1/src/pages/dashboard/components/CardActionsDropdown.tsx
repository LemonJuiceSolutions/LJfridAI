import React from 'react';
import { Printer, Trash, Eye, MoreHorizontal, Edit2, Download } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';

const CardActionsDropdown = () => {
  return (
    <Dropdown>
      <Dropdown.Toggle as="a" id="new-customers-dropdown" className="no-toggle-icon">
        <MoreHorizontal className="text-secondary icon-md" />
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item href="#/action-1">
          <Eye size={14} className="me-2" />
          View
        </Dropdown.Item>
        <Dropdown.Item href="#/action-1">
          <Edit2 size={14} className="me-2" />
          Edit
        </Dropdown.Item>
        <Dropdown.Item href="#/action-1">
          <Trash size={14} className="me-2" />
          Delete
        </Dropdown.Item>
        <Dropdown.Item href="#/action-3">
          <Printer size={14} className="me-2" />
          Print
        </Dropdown.Item>
        <Dropdown.Item href="#/action-2">
          <Download size={14} className="me-2" />
          Download
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default React.memo(CardActionsDropdown);
