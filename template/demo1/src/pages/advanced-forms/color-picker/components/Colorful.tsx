import { useState } from 'react';
import { Colorful } from '@uiw/react-color';

const ColorfulExample = () => {
  const [hsva, setHsva] = useState({ h: 0, s: 100, v: 100, a: 1 });
  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <Colorful
        color={hsva}
        onChange={(color) => {
          setHsva(color.hsva);
        }}
      />
      <p className="text-secondary">
        HSVA: {hsva.h}, {hsva.s}, {hsva.v}, {hsva.a}
      </p>
    </div>
  );
};
export default ColorfulExample;
