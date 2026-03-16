import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import SmallExample, { SmallExampleCode } from './components/Small';
import DarkExample, { DarkExampleCode } from './components/Dark';
import ResponsiveExample, { responsiveExampleCode } from './components/Responsive';

const TablePage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Tables</h1>
        <p className="lead">
          Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/table" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Use the <code>striped</code>, <code>bordered</code> and <code>hover</code> props to customise the table.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="small">Small Table</h4>
        <p className="mb-3">
          Use <code>size="sm"</code> to make tables compact by cutting cell padding in half.
        </p>
        <div className="example">
          <SmallExample />
        </div>
        <CodePreview code={SmallExampleCode} language="javascript" />

        <hr />

        <h4 id="dark">Dark Table</h4>
        <p className="mb-3">
          Use <code>variant="dark"</code> to invert the colors of the table and get light text on a dark background.
        </p>
        <div className="example">
          <DarkExample />
        </div>
        <CodePreview code={DarkExampleCode} language="javascript" />

        <hr />

        <h4 id="responsive">Responsive</h4>
        <p className="mb-3">
          Across every breakpoint, use <code>responsive</code> for horizontally scrolling tables. Responsive tables are
          wrapped automatically in a <code>div</code>. The following example has 12 columns that are scrollable
          horizontally.
        </p>
        <div className="example">
          <ResponsiveExample />
        </div>
        <CodePreview code={responsiveExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#small" className="nav-link">
              Small Table
            </a>
          </li>
          <li className="nav-item">
            <a href="#dark" className="nav-link">
              Dark Table
            </a>
          </li>
          <li className="nav-item">
            <a href="#responsive" className="nav-link">
              Responsive
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default TablePage;
