import { ComponentType } from 'react';
import { NumericFormat } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const FixedDecimalScaleExample = () => {
  return (
    <NumericFormat
      customInput={Form.Control as ComponentType<FormControlProps>}
      value={987.654321}
      decimalScale={3}
      fixedDecimalScale={true}
    />
  );
};

export default FixedDecimalScaleExample;
