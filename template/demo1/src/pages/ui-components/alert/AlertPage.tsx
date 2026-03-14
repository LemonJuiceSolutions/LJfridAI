import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';
import FillExample, { fillExampleCode } from './components/Fill';
import IconExample, { iconExampleCode } from './components/Icon';
import LinkExample, { linkExampleCode } from './components/Link';
import AdditionalContentExample, { additionalContentExampleCode } from './components/AdditionalContent';
import AlertDismissibleExample, { AlertDismissibleExampleCode } from './components/Dismissable';

const AlertPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Alerts</h1>
        <p className="lead">
          Provide contextual feedback messages for typical user actions with the handful of available and flexible alert
          messages.. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/alerts" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Alerts are available for any length of text, as well as an optional dismiss button. For proper styling, use
          one of the eight <code>variant</code>s.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="fill">Fill Alert</h4>
        <div className="example">
          <FillExample />
        </div>
        <CodePreview code={fillExampleCode} language="javascript" />

        <hr />

        <h4 id="icon">With Icon</h4>
        <div className="example">
          <IconExample />
        </div>
        <CodePreview code={iconExampleCode} language="javascript" />

        <hr />

        <h4 id="link">Link Alert</h4>
        <p className="mb-3">
          For links, use the <code>&lt;Alert.Link&gt;</code> component to provide matching colored links within any
          alert.
        </p>
        <div className="example">
          <LinkExample />
        </div>
        <CodePreview code={linkExampleCode} language="javascript" />

        <hr />

        <h4 id="additionalContent">Additional content</h4>
        <p className="mb-3">Alerts can contain whatever content you like. Headers, paragraphs, dividers, go crazy.</p>
        <div className="example">
          <AdditionalContentExample />
        </div>
        <CodePreview code={additionalContentExampleCode} language="javascript" />

        <hr />

        <h4 id="dismissing">Dismissing</h4>
        <p className="mb-3">
          Add the <code>dismissible</code> prop to add a functioning dismiss button to the Alert.
        </p>
        <div className="example">
          <AlertDismissibleExample />
        </div>
        <CodePreview code={AlertDismissibleExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#fill" className="nav-link">
              Fill
            </a>
          </li>
          <li className="nav-item">
            <a href="#icon" className="nav-link">
              Icon
            </a>
          </li>
          <li className="nav-item">
            <a href="#link" className="nav-link">
              Link
            </a>
          </li>
          <li className="nav-item">
            <a href="#additionalContent" className="nav-link">
              Additional Content
            </a>
          </li>
          <li className="nav-item">
            <a href="#dismissing" className="nav-link">
              Dismissing
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default AlertPage;
