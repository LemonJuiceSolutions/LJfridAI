import { ComponentType, useState } from 'react';
import { PatternFormat, type NumberFormatValues } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const DateExample = () => {
  const [date, setDate] = useState('');

  return (
    <PatternFormat
      customInput={Form.Control as ComponentType<FormControlProps>}
      format="##/##/####"
      // mask={['D', 'D', 'M', 'M', 'Y', 'Y', 'Y', 'Y']}
      mask="_"
      placeholder="DD/MM/YYYY"
      value={date}
      onValueChange={(values: NumberFormatValues) => setDate(values.value)}
    />
  );
};

export default DateExample;
