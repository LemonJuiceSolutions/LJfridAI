import { useState, ComponentType } from 'react';
import { PatternFormat, type NumberFormatValues } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const PhoneNumberExample = () => {
  const [phoneNumber, setPhoneNumber] = useState('');

  return (
    <PatternFormat
      customInput={Form.Control as ComponentType<FormControlProps>}
      format="+1 (###) #### ###"
      mask="_"
      allowEmptyFormatting={true}
      value={phoneNumber}
      onValueChange={(values: NumberFormatValues) => setPhoneNumber(values.value)}
    />
  );
};

export default PhoneNumberExample;
