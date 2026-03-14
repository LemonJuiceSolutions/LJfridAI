import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';
import ValidationInputGroupExample, { ValidationInputGroupExampleCode } from './components/InputGroup';

const ValidationPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Validation</h1>
        <p className="lead">
          Provide valuable, actionable feedback to your users with HTML5 form validation, via browser default behaviors
          or custom styles and JavaScript. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/validation" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Native HTML5 form validation</h4>
        <p className="mb-3">
          For native HTML form validation–
          <a href="https://caniuse.com/#feat=form-validation" target="_blank" rel="noopener noreferrer">
            available in all our supported browsers
          </a>
          , the <code>:valid</code> and <code>:invalid</code> pseudo selectors are used to apply validation styles as
          well as display feedback messages.
        </p>
        <p className="mb-3">
          Bootstrap scopes the <code>:valid</code> and <code>:invalid</code> styles to parent{' '}
          <code>.was-validated</code>
          class, usually applied to the <code>&lt;Form&gt;</code> (you can use the <code>validated</code> prop as a
          shortcut). Otherwise, any required field without a value shows up as invalid on page load. This way, you may
          choose when to activate them (typically after form submission is attempted).
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="input-group">Input group validation</h4>
        <p className="mb-3">
          To properly show rounded corners in an <code>&lt;InputGroup&gt;</code> with validation, the{' '}
          <code>&lt;InputGroup&gt;</code> requires the <code>hasValidation</code> prop.
        </p>
        <div className="example">
          <ValidationInputGroupExample />
        </div>
        <CodePreview code={ValidationInputGroupExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Native HTML5 form validation
            </a>
          </li>
          <li className="nav-item">
            <a href="#input-group" className="nav-link">
              Input group validation
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ValidationPage;
