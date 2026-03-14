import { useState } from 'react';
import { Chrome } from '@uiw/react-color';
import { GithubPlacement } from '@uiw/react-color-github';

const ChromeExample = () => {
  const [hsva, setHsva] = useState({ h: 0, s: 100, v: 100, a: 1 });
  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <Chrome color={hsva} placement={GithubPlacement.Right} onChange={(color) => setHsva(color.hsva)} />
      <p className="text-secondary">
        HSVA: {hsva.h}, {hsva.s}, {hsva.v}, {hsva.a}
      </p>
    </div>
  );
};
export default ChromeExample;
