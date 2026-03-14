import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';

const FormTextPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Form text</h1>
        <p className="lead">
          Create block-level or inline-level form text. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/form-text" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Example</h4>
        <p className="mb-3">
          Block-level help text in forms can be created using <code>&lt;Form.Text&gt;</code>. Inline help text can be
          flexibly implemented using any inline HTML element and utility classes like <code>.text-secondary</code>.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Example
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default FormTextPage;
