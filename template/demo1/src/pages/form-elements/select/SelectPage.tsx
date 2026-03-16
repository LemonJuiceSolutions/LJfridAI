import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';
import SizesExample, { sizesExampleCode } from './components/Sizes';

const SelectPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Select</h1>
        <p className="lead">
          Customize the native &lt;select&gt; with custom CSS that changes the element’s initial appearance. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/select" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Example</h4>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="sizing">Sizing</h4>
        <p className="mb-3">
          You may also choose from small and large custom selects to match our similarly sized text inputs.
        </p>
        <div className="example">
          <SizesExample />
        </div>
        <CodePreview code={sizesExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#sizing" className="nav-link">
              Sizing
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default SelectPage;
