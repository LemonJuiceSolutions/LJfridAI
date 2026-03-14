import { useState } from 'react';
import { Tabs, Tab } from 'react-bootstrap';

function ControlledTabsExample() {
  const [key, setKey] = useState('home');

  return (
    <Tabs id="controlled-tab-example" activeKey={key} onSelect={(k) => k && setKey(k)} className="mb-3">
      <Tab eventKey="home" title="Home">
        Tab content for Home
      </Tab>
      <Tab eventKey="profile" title="Profile">
        Tab content for Profile
      </Tab>
      <Tab eventKey="contact" title="Contact" disabled>
        Tab content for Contact
      </Tab>
    </Tabs>
  );
}

export default ControlledTabsExample;

export const ControlledTabsExampleCode = `import { useState } from 'react';
import { Tabs, Tab } from 'react-bootstrap';

function ControlledTabsExample() {
  const [key, setKey] = useState('home');

  return (
    <Tabs
      id="controlled-tab-example"
      activeKey={key}
      onSelect={(k) => k && setKey(k)}
      className="mb-3"
    >
      <Tab eventKey="home" title="Home">
        Tab content for Home
      </Tab>
      <Tab eventKey="profile" title="Profile">
        Tab content for Profile
      </Tab>
      <Tab eventKey="contact" title="Contact" disabled>
        Tab content for Contact
      </Tab>
    </Tabs>
  );
}

export default ControlledTabsExample;`;
