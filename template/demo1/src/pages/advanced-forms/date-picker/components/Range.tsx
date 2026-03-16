import { useState } from 'react';
import { DayPicker, DateRange } from 'react-day-picker';
import { Form, Dropdown } from 'react-bootstrap';

const RangeExample = () => {
  const [selected, setSelected] = useState<DateRange>();
  const [show, setShow] = useState(false);

  // Format date for input
  const formatDate = (date?: DateRange) =>
    date ? date.from?.toLocaleDateString() + ' - ' + date.to?.toLocaleDateString() : '';

  // Handle date selection
  const handleSelect = (date?: DateRange) => {
    setSelected(date);
  };

  return (
    <Form.Group>
      <Dropdown show={show} onToggle={setShow} autoClose={true}>
        <Dropdown.Toggle as={Form.Control} value={formatDate(selected)} placeholder="Pick a date" readOnly />
        <Dropdown.Menu>
          <DayPicker animate mode="range" navLayout="around" selected={selected} onSelect={handleSelect} />
        </Dropdown.Menu>
      </Dropdown>
    </Form.Group>
  );
};

export default RangeExample;
