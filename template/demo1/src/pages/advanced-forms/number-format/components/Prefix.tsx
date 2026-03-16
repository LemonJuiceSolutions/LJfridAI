import { ComponentType } from 'react';
import { NumericFormat } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const PrefixExample = () => {
  return <NumericFormat customInput={Form.Control as ComponentType<FormControlProps>} value={1234} prefix={'$'} />;
};

export default PrefixExample;
