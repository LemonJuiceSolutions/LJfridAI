import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { Form, Dropdown } from 'react-bootstrap';

const BasicExample = () => {
  const [selected, setSelected] = useState<Date>();
  const [show, setShow] = useState(false);

  // Format date for input
  const formatDate = (date?: Date) => (date ? date.toLocaleDateString() : '');

  // Handle date selection
  const handleSelect = (date?: Date) => {
    setSelected(date);
    setShow(false);
  };

  return (
    <Form.Group>
      <Dropdown show={show} onToggle={setShow} autoClose>
        <Dropdown.Toggle as={Form.Control} value={formatDate(selected)} placeholder="Pick a date" readOnly />
        <Dropdown.Menu>
          <DayPicker
            animate
            mode="single"
            captionLayout="dropdown"
            navLayout="around"
            selected={selected}
            onSelect={handleSelect}
          />
        </Dropdown.Menu>
      </Dropdown>
    </Form.Group>
  );
};

export default BasicExample;
