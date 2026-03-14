import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import CheckExample, { checkExampleCode } from './components/Check';
import SwitchExample, { switchExampleCode } from './components/Switch';
import CheckInlineExample, { checkInlineExampleCode } from './components/CheckInline';

const ChecksRadiosPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Checks and radios</h1>
        <p className="lead">
          Create consistent cross-browser and cross-device checkboxes and radios. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/checks-radios" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Default (stacked)</h4>
        <p className="mb-3">
          By default, any number of checkboxes and radios that are immediate sibling will be vertically stacked and
          appropriately spaced with FormCheck.
        </p>
        <div className="example">
          <CheckExample />
        </div>
        <CodePreview code={checkExampleCode} language="javascript" />

        <hr />

        <h4 id="switches">Switches</h4>
        <p className="mb-3">
          A switch has the markup of a custom checkbox but uses <code>type="switch"</code> to render a toggle switch.
          Switches also support the same customizable children as <code>&lt;FormCheck&gt;</code>.
        </p>
        <div className="example">
          <SwitchExample />
        </div>
        <CodePreview code={switchExampleCode} language="javascript" />

        <hr />

        <h4 id="inline">Inline</h4>
        <p className="mb-3">
          Group checkboxes or radios on the same horizontal row by adding the <code>inline</code> prop.
        </p>
        <div className="example">
          <CheckInlineExample />
        </div>
        <CodePreview code={checkInlineExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Default (stacked)
            </a>
          </li>
          <li className="nav-item">
            <a href="#switches" className="nav-link">
              Switches
            </a>
          </li>
          <li className="nav-item">
            <a href="#inline" className="nav-link">
              Inline
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ChecksRadiosPage;
