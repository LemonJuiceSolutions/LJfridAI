import { ComponentType } from 'react';
import { NumericFormat } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const SuffixExample = () => {
  return <NumericFormat customInput={Form.Control as ComponentType<FormControlProps>} value={12} suffix={' kg'} />;
};

export default SuffixExample;
