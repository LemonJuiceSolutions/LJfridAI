import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { Dropdown, Form, InputGroup } from 'react-bootstrap';
import { DayPicker } from 'react-day-picker';

interface DatePickerProps {
  selected: Date;
  onDateSelect: (date: Date) => void;
  placeholder?: string;
  className?: string;
}

const DatePicker = ({ selected, onDateSelect, placeholder = 'Pick a date', className = '' }: DatePickerProps) => {
  const [show, setShow] = useState(false);

  // Format date for input
  const formatDate = (date?: Date) => (date ? date.toLocaleDateString() : '');

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      onDateSelect(date);
      setShow(false);
    }
  };

  return (
    <InputGroup className={`${className}`}>
      <InputGroup.Text className="border-primary bg-transparent" onClick={() => setShow(true)}>
        <Calendar size={16} className="text-primary" />
      </InputGroup.Text>
      <Dropdown show={show} onToggle={setShow} autoClose>
        <Dropdown.Toggle
          as={Form.Control}
          value={formatDate(selected)}
          placeholder={placeholder}
          readOnly
          className="border-primary"
          aria-label="Select date"
        />
        <Dropdown.Menu>
          <DayPicker
            animate
            mode="single"
            navLayout="around"
            required
            selected={selected}
            onSelect={handleDateSelect}
          />
        </Dropdown.Menu>
      </Dropdown>
    </InputGroup>
  );
};

export default DatePicker;
