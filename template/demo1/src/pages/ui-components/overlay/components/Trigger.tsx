import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { TooltipProps } from 'react-bootstrap'; // Import the TooltipProps type

function TriggerExample() {
  const renderTooltip = (props: TooltipProps) => (
    <Tooltip id="button-tooltip" {...props}>
      Simple tooltip
    </Tooltip>
  );

  return (
    <OverlayTrigger placement="right" delay={{ show: 250, hide: 400 }} overlay={renderTooltip}>
      <Button variant="success">Hover me to see</Button>
    </OverlayTrigger>
  );
}

export default TriggerExample;

export const triggerExampleCode = `import { Button, OverlayTrigger, Tooltip } from "react-bootstrap";
import type { TooltipProps } from "react-bootstrap"; // Import the TooltipProps type


function TriggerExample() {
  const renderTooltip = (props: TooltipProps) => (
    <Tooltip id="button-tooltip" {...props}>
      Simple tooltip
    </Tooltip>
  );

  return (
    <OverlayTrigger
      placement="right"
      delay={{ show: 250, hide: 400 }}
      overlay={renderTooltip}
    >
      <Button variant="success">Hover me to see</Button>
    </OverlayTrigger>
  );
}

export default TriggerExample;`;
