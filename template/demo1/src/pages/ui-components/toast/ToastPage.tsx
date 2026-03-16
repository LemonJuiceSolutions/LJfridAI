import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import DismissibleExample, { dismissibleExampleCode } from './components/Dismissible';
import StackingExample, { stackingExampleCode } from './components/Stacking';
import PlacementExample, { placementExampleCode } from './components/Placement';
import PlacementMultiExample, { placementMultiExampleCode } from './components/PlacementMulti';
import AutohideExample, { autohideExampleCode } from './components/Autohide';
import ContextualExample, { contextualExampleCode } from './components/Contextual';

const ToastPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Toasts</h1>
        <p className="lead">
          Push notifications to your visitors with a toast, a lightweight and easily customizable alert message. Read
          the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/toasts" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="dismissible">Dismissible</h4>
        <div className="example">
          <DismissibleExample />
        </div>
        <CodePreview code={dismissibleExampleCode} language="javascript" />

        <hr />

        <h4 id="stacking">Stacking</h4>
        <p className="mb-3">
          When you have multiple toasts, we default to vertically stacking them in a readable manner.
        </p>
        <div className="example">
          <StackingExample />
        </div>
        <CodePreview code={stackingExampleCode} language="javascript" />

        <hr />

        <h4 id="placement">Placement</h4>
        <p className="mb-3">
          Place toasts by setting a <code>position</code> in a <code>ToastContainer</code>. The top right is often used
          for notifications, as is the top middle.
        </p>
        <div className="example">
          <PlacementExample />
        </div>
        <CodePreview code={placementExampleCode} language="javascript" />

        <p className="mb-3">
          For systems that generate more notifications, consider using a wrapping element so they can easily stack.
        </p>
        <div className="example">
          <PlacementMultiExample />
        </div>
        <CodePreview code={placementMultiExampleCode} language="javascript" />

        <hr />

        <h4 id="autohide">Autohide</h4>
        <p className="mb-3">
          A Toast can also automatically hide after X milliseconds using the <code>autohide</code> prop with the{' '}
          <code>delay</code> prop to specify the delay. To open the toast, manually change the show property.
        </p>
        <div className="example">
          <AutohideExample />
        </div>
        <CodePreview code={autohideExampleCode} language="javascript" />

        <hr />

        <h4 id="contextual">Contextual variations</h4>
        <p className="mb-3">Add any of the below mentioned modifier classes to change the appearance of a toast.</p>
        <div className="example">
          <ContextualExample />
        </div>
        <CodePreview code={contextualExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#dismissible" className="nav-link">
              Dismissible
            </a>
          </li>
          <li className="nav-item">
            <a href="#stacking" className="nav-link">
              Stacking
            </a>
          </li>
          <li className="nav-item">
            <a href="#placement" className="nav-link">
              Placement
            </a>
          </li>
          <li className="nav-item">
            <a href="#autohide" className="nav-link">
              Autohide
            </a>
          </li>
          <li className="nav-item">
            <a href="#contextual" className="nav-link">
              Contextual variations
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ToastPage;
