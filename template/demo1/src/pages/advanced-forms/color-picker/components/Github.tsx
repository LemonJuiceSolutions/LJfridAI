import { useState } from 'react';
import Github from '@uiw/react-color-github';
import { GithubPlacement } from '@uiw/react-color-github';

const GithubExample = () => {
  const [hex, setHex] = useState('#F44E3B');
  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <Github
        color={hex}
        onChange={(color) => setHex(color.hex)}
        placement={GithubPlacement.Right}
        showTriangle={true}
      />
      <p className="text-secondary">HEX: {hex}</p>
    </div>
  );
};
export default GithubExample;
