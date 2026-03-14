import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import UncontrolledExample, { uncontrolledExampleCode } from './components/Uncontrolled';
import ControlledTabsExample, { ControlledTabsExampleCode } from './components/Controlled';
import FillExample, { fillExampleCode } from './components/Fill';
import JustifiedExample, { justifiedExampleCode } from './components/Justified';
import LeftTabsExample, { LeftTabsExampleCode } from './components/LeftTabs';

const TabsPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Tabbed components</h1>
        <p className="lead">
          Dynamic tabbed interfaces. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/tabs" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          <code>Tabs</code> is a higher-level component for quickly creating a <code>Nav</code> matched with a set of{' '}
          <code>TabPane</code>s.
        </p>
        <div className="example">
          <UncontrolledExample />
        </div>
        <CodePreview code={uncontrolledExampleCode} language="javascript" />

        <hr />

        <h4 id="controlled">Controlled</h4>
        <p className="mb-3">
          <code>Tabs</code> can be controlled directly when you want to handle the selection logic personally.
        </p>
        <div className="example">
          <ControlledTabsExample />
        </div>
        <CodePreview code={ControlledTabsExampleCode} language="javascript" />

        <hr />

        <h4 id="fill">Fill and justify</h4>
        <p className="mb-3">
          Similar to the <code>Nav</code> component, you can force the contents of your <code>Tabs</code> to extend the
          full available width. To proportionately fill the space use <code>fill</code>. Notice that the{' '}
          <code>Tabs</code> is the entire width but each <code>Tab</code> item is a different size.
        </p>
        <div className="example">
          <FillExample />
        </div>
        <CodePreview code={fillExampleCode} language="javascript" />

        <p className="mb-3">
          If you want each <code>Tab</code> to be the same size use <code>justify</code>.
        </p>
        <div className="example">
          <JustifiedExample />
        </div>
        <CodePreview code={justifiedExampleCode} language="javascript" />

        <hr />

        <h4 id="custom">Custom Tab Layout</h4>
        <p className="mb-3">
          For more complex layouts the flexible <code>TabContainer</code>,
        </p>
        <p className="mb-3">
          <code>TabContent</code>, and <code>TabPane</code> components along with any style of <code>Nav</code> allow
          you to quickly piece together your own Tabs component with additional markup needed.
        </p>
        <p className="mb-3">
          Create a set of NavItems each with an <code>eventKey</code>
          corresponding to the eventKey of a <code>TabPane</code>. Wrap the whole thing in a <code>TabContainer</code>{' '}
          and you have fully functioning custom tabs component. Check out the below example making use of the grid
          system, pills and underline.
        </p>
        <div className="example">
          <LeftTabsExample />
        </div>
        <CodePreview code={LeftTabsExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#controlled" className="nav-link">
              Controlled
            </a>
          </li>
          <li className="nav-item">
            <a href="#fill" className="nav-link">
              Fill and justify
            </a>
          </li>
          <li className="nav-item">
            <a href="#custom" className="nav-link">
              Custom Tab Layout
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default TabsPage;
