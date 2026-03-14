import { useState } from 'react';
import { Block } from '@uiw/react-color';

const BlockExample = () => {
  const [hsva, setHsva] = useState({ h: 0, s: 100, v: 100, a: 1 });
  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <Block color={hsva} showTriangle={false} onChange={(color) => setHsva(color.hsva)} />
      <p className="text-secondary">
        HSVA: {hsva.h}, {hsva.s}, {hsva.v}, {hsva.a}
      </p>
    </div>
  );
};
export default BlockExample;
