import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import LineExample, { lineExampleCode } from './components/Line';
import DotExample, { dotExampleCode } from './components/Dot';
import ArrowExample, { arrowExampleCode } from './components/Arrow';

const BreadcrumbPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Breadcrumbs</h1>
        <p className="lead">
          Indicate the current page’s location within a navigational hierarchy that automatically adds separators via
          CSS. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/breadcrumb" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Add <code>active</code> prop to the active <code>Breadcrumb.Item</code>. Do not set both <code>active</code>{' '}
          and <code>href</code> attributes. <code>active</code> overrides <code>href</code> and <code>span</code>{' '}
          element is rendered instead of <code>a</code>.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="line">Line seperator</h4>
        <p className="mb-3">
          Add <code>bsPrefix="breadcrumb breadcrumb-line"</code> prop to the <code>Breadcrumb</code>.
        </p>
        <div className="example">
          <LineExample />
        </div>
        <CodePreview code={lineExampleCode} language="javascript" />

        <hr />

        <h4 id="dot">Dot seperator</h4>
        <p className="mb-3">
          Add <code>bsPrefix="breadcrumb breadcrumb-dot"</code> prop to the <code>Breadcrumb</code>.
        </p>
        <div className="example">
          <DotExample />
        </div>
        <CodePreview code={dotExampleCode} language="javascript" />

        <hr />

        <h4 id="arrow">Arrow seperator</h4>
        <p className="mb-3">
          Add <code>bsPrefix="breadcrumb breadcrumb-arrow"</code> prop to the <code>Breadcrumb</code>.
        </p>
        <div className="example">
          <ArrowExample />
        </div>
        <CodePreview code={arrowExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#line" className="nav-link">
              Line seperator
            </a>
          </li>
          <li className="nav-item">
            <a href="#dot" className="nav-link">
              Dot seperator
            </a>
          </li>
          <li className="nav-item">
            <a href="#arrow" className="nav-link">
              Arrow seperator
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default BreadcrumbPage;
