import { useState } from 'react';
import { Colorful } from '@uiw/react-color';
import { Popover, OverlayTrigger, Button } from 'react-bootstrap';

const PopoverExample = () => {
  const [hex, setHex] = useState('#6571ff');

  const popover = (
    <Popover id="color-picker-popover">
      <Popover.Header as="h3">Pick a color</Popover.Header>
      <Popover.Body>
        <div className="d-flex flex-column align-items-center gap-3">
          <Colorful
            color={hex}
            disableAlpha
            onChange={(color) => {
              setHex(color.hex);
            }}
          />
        </div>
      </Popover.Body>
    </Popover>
  );

  // Determine text color for contrast
  const getContrastYIQ = (hexColor: string): string => {
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c: string) => c + c)
        .join('');
    }
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#222' : '#fff';
  };

  return (
    <div className="d-flex flex-column align-items-center gap-3">
      <OverlayTrigger trigger="click" overlay={popover} rootClose>
        <Button
          style={{
            backgroundColor: hex,
            borderColor: 'var(--bs-secondary)',
            color: getContrastYIQ(hex),
          }}
        >
          Open Color Picker
        </Button>
      </OverlayTrigger>
      <p className="text-secondary mb-0">HEX: {hex}</p>
    </div>
  );
};
export default PopoverExample;
