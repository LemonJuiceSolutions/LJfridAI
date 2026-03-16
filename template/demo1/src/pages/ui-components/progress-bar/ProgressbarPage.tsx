import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import WithLabelExample, { withLabelExampleCode } from './components/Label';
import ContextualExample, { contextualExampleCode } from './components/Contextual';
import StripedExample, { stripedExampleCode } from './components/Striped';
import AnimatedExample, { animatedExampleCode } from './components/Animated';
import StackedExample, { stackedExampleCode } from './components/Stacked';

const ProgressBarPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Progress bars</h1>
        <p className="lead">
          Provide up-to-date feedback on the progress of a workflow or action with simple yet flexible progress bars.
          Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/progress" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">Default progress bar.</p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="label">With label</h4>
        <p className="mb-3">
          Add a <code>label</code> prop to show a visible percentage. For low percentages, consider adding a min-width
          to ensure the label's text is fully visible.
        </p>
        <div className="example">
          <WithLabelExample />
        </div>
        <CodePreview code={withLabelExampleCode} language="javascript" />

        <hr />

        <h4 id="contextual">Contextual alternatives</h4>
        <p className="mb-3">Progress bars use some of the same button and alert classes for consistent styles.</p>
        <div className="example">
          <ContextualExample />
        </div>
        <CodePreview code={contextualExampleCode} language="javascript" />

        <hr />

        <h4 id="striped">Striped</h4>
        <p className="mb-3">Uses a gradient to create a striped effect.</p>
        <div className="example">
          <StripedExample />
        </div>
        <CodePreview code={stripedExampleCode} language="javascript" />

        <hr />

        <h4 id="animated">Animated</h4>
        <p className="mb-3">
          Add <code>animated</code> prop to animate the stripes right to left.
        </p>
        <div className="example">
          <AnimatedExample />
        </div>
        <CodePreview code={animatedExampleCode} language="javascript" />

        <hr />

        <h4 id="stacked">Stacked</h4>
        <p className="mb-3">
          Nest <code>&lt;ProgressBar /&gt;</code>s to stack them.
        </p>
        <div className="example">
          <StackedExample />
        </div>
        <CodePreview code={stackedExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#label" className="nav-link">
              With label
            </a>
          </li>
          <li className="nav-item">
            <a href="#contextual" className="nav-link">
              Contextual alternatives
            </a>
          </li>
          <li className="nav-item">
            <a href="#striped" className="nav-link">
              Striped
            </a>
          </li>
          <li className="nav-item">
            <a href="#animated" className="nav-link">
              Animated
            </a>
          </li>
          <li className="nav-item">
            <a href="#stacked" className="nav-link">
              Stacked
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ProgressBarPage;
