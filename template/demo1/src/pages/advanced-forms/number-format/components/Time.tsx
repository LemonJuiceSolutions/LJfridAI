import { useState, ComponentType } from 'react';
import { PatternFormat, type NumberFormatValues } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const TimeExample = () => {
  const [time, setTime] = useState('');

  return (
    <PatternFormat
      customInput={Form.Control as ComponentType<FormControlProps>}
      format="##:##:##"
      mask="_"
      placeholder="HH:MM:SS"
      value={time}
      onValueChange={(values: NumberFormatValues) => setTime(values.value)}
    />
  );
};

export default TimeExample;
