import { ComponentType } from 'react';
import { NumericFormat } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const ThousandSeperatorExample = () => {
  return (
    <NumericFormat
      customInput={Form.Control as ComponentType<FormControlProps>}
      value={987654321}
      thousandSeparator={true}
      prefix={'$'}
    />
  );
};

export default ThousandSeperatorExample;
