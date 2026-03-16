import { OverlayTrigger, Tooltip, Button } from 'react-bootstrap';

function TooltipPositionedExample() {
  return (
    <>
      {(['top', 'right', 'bottom', 'left'] as const).map((placement) => (
        <OverlayTrigger
          key={placement}
          placement={placement}
          overlay={
            <Tooltip id={`tooltip-${placement}`}>
              Tooltip on <strong>{placement}</strong>.
            </Tooltip>
          }
        >
          <Button variant="secondary">Tooltip on {placement}</Button>
        </OverlayTrigger>
      ))}
    </>
  );
}

export default TooltipPositionedExample;

export const tooltipPositionedExampleCode = `import { OverlayTrigger, Tooltip, Button } from "react-bootstrap";

function TooltipPositionedExample() {
  return (
    <>
      {(['top', 'right', 'bottom', 'left'] as const).map((placement) => (
        <OverlayTrigger
          key={placement}
          placement={placement}
          overlay={
            <Tooltip id={\`tooltip-\${placement}\`}>
              Tooltip on <strong>{placement}</strong>.
            </Tooltip>
          }
        >
          <Button variant="secondary">Tooltip on {placement}</Button>
        </OverlayTrigger>
      ))}
    </>
  );
}

export default TooltipPositionedExample;`;
