import { useState } from 'react';
import { Compact } from '@uiw/react-color';

const CompactExample = () => {
  const [hex, setHex] = useState('#F44E3B');
  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <Compact color={hex} onChange={(color) => setHex(color.hex)} />
      <p className="text-secondary">HEX: {hex}</p>
    </div>
  );
};
export default CompactExample;
