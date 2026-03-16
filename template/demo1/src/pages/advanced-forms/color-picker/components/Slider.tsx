import { useState } from 'react';
import { Slider } from '@uiw/react-color';

const SliderExample = () => {
  const [hsva, setHsva] = useState({ h: 0, s: 100, v: 100, a: 1 });
  return (
    <div className="d-flex flex-column gap-3">
      <Slider
        color={hsva}
        onChange={(color) => {
          setHsva({ ...hsva, ...color.hsv });
        }}
      />
      <p className="text-secondary">
        HSVA: {hsva.h}, {hsva.s}, {hsva.v}, {hsva.a}
      </p>
    </div>
  );
};
export default SliderExample;
