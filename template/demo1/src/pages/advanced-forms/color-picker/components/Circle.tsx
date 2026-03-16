import { useState } from 'react';
import { Circle } from '@uiw/react-color';

const CircleExample = () => {
  const [hex, setHex] = useState('#F44E3B');
  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <Circle
        colors={[
          '#F44E3B',
          '#FE9200',
          '#FCDC00',
          '#DBDF00',
          '#A4DD00',
          '#68CCCA',
          '#3099E5',
          '#0072B5',
          '#605EBC',
          '#AA4674',
          '#E11E71',
          '#E01E4A',
          '#A51C30',
        ]}
        color={hex}
        onChange={(color) => setHex(color.hex)}
      />
      <p className="text-secondary">HEX: {hex}</p>
    </div>
  );
};
export default CircleExample;
