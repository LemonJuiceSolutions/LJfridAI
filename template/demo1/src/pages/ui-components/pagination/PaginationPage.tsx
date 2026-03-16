import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import AdvancedExample, { advancedExampleCode } from './components/Advanced';
import SeparatedExample, { separatedExampleCode } from './components/Separated';
import RoundedExample, { roundedExampleCode } from './components/Rounded';

const PaginationPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Pagination</h1>
        <p className="lead">
          A set of presentational components for building pagination UI. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/pagination" target="_blank" rel="noopener noreferrer">
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

        <h4 id="separated">Separated</h4>
        <p className="mb-3">
          Add className <code>.pagination-separated</code>
        </p>
        <div className="example">
          <SeparatedExample />
        </div>
        <CodePreview code={separatedExampleCode} language="javascript" />

        <hr />

        <h4 id="rounded">Rounded</h4>
        <p className="mb-3">
          Add className <code>.pagination-rounded</code>
        </p>
        <div className="example">
          <RoundedExample />
        </div>
        <CodePreview code={roundedExampleCode} language="javascript" />

        <hr />

        <h4 id="more">More options</h4>
        <p className="mb-3">
          For building more complex pagination UI, there are few convenient sub-components for adding "First",
          "Previous", "Next", and "Last" buttons, as well as an "Ellipsis" item for indicating previous or continuing
          results.
        </p>
        <div className="example">
          <AdvancedExample />
        </div>
        <CodePreview code={advancedExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#separated" className="nav-link">
              Separated
            </a>
          </li>
          <li className="nav-item">
            <a href="#rounded" className="nav-link">
              Rounded
            </a>
          </li>
          <li className="nav-item">
            <a href="#more" className="nav-link">
              More options
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default PaginationPage;
