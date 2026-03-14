import { ComponentType } from 'react';
import { NumericFormat } from 'react-number-format';
import { Form, FormControlProps } from 'react-bootstrap';

const MaxLimitExample = () => {
  const MAX_LIMIT = 1001;
  return (
    <NumericFormat
      customInput={Form.Control as ComponentType<FormControlProps>}
      value={368}
      allowNegative={false}
      isAllowed={(values) => {
        if (!values.value) return true;
        const { floatValue } = values;
        return floatValue !== undefined && floatValue < MAX_LIMIT;
      }}
    />
  );
};

export default MaxLimitExample;
