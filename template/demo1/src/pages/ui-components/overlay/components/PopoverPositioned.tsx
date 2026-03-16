import { OverlayTrigger, Popover, Button } from 'react-bootstrap';

function PopoverPositionedExample() {
  return (
    <>
      {(['top', 'right', 'bottom', 'left'] as const).map((placement) => (
        <OverlayTrigger
          trigger="click"
          key={placement}
          placement={placement}
          overlay={
            <Popover id={`popover-positioned-${placement}`}>
              <Popover.Header as="h3">{`Popover ${placement}`}</Popover.Header>
              <Popover.Body>
                <strong>Holy guacamole!</strong> Check this info.
              </Popover.Body>
            </Popover>
          }
        >
          <Button variant="secondary">Popover on {placement}</Button>
        </OverlayTrigger>
      ))}
    </>
  );
}

export default PopoverPositionedExample;

export const popoverPositionedExampleCode = `import { OverlayTrigger, Popover, Button } from "react-bootstrap";

function PopoverPositionedExample() {
  return (
    <>
      {(['top', 'right', 'bottom', 'left'] as const).map((placement) => (
        <OverlayTrigger
          trigger="click"
          key={placement}
          placement={placement}
          overlay={
            <Popover id={\`popover-positioned-\${placement}\`}>
              <Popover.Header as="h3">{\`Popover \${placement}\`}</Popover.Header>
              <Popover.Body>
                <strong>Holy guacamole!</strong> Check this info.
              </Popover.Body>
            </Popover>
          }
        >
          <Button variant="secondary">Popover on {placement}</Button>
        </OverlayTrigger>
      ))}
    </>
  );
}

export default PopoverPositionedExample;`;
