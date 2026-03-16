import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';
import TextareaExample, { textareaExampleCode } from './components/Textarea';
import SelectExample, { selectExampleCode } from './components/Select';
import LayoutExample, { layoutExampleCode } from './components/Layout';

const FloatingLabelPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Floating labels</h1>
        <p className="lead">
          Create beautifully simple form labels that float over your input fields. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/floating-labels" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Example</h4>
        <p className="mb-3">
          Wrap a <code>&lt;Form.Control&gt;</code> element in <code>&lt;FloatingLabel&gt;</code> to enable floating
          labels with Bootstrap’s textual form fields. A <code>placeholder</code> is required on each{' '}
          <code>&lt;Form.Control&gt;</code> as our method of CSS-only floating labels uses the{' '}
          <code>:placeholder-shown</code> pseudo-element.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="textarea">Textareas</h4>
        <p className="mb-3">
          By default, <code>&lt;textarea&gt;</code>s will be the same height as <code>&lt;input&gt;</code>s. To set a
          custom height on your <code>&lt;textarea&gt;</code>, do not use the <code>rows</code> attribute. Instead, set
          an explicit <code>height</code> (either inline or via custom CSS).
        </p>
        <div className="example">
          <TextareaExample />
        </div>
        <CodePreview code={textareaExampleCode} language="javascript" />

        <hr />

        <h4 id="select">Selects</h4>
        <p className="mb-3">
          Other than <code>&lt;Form.Control&gt;</code>, floating labels are only available on{' '}
          <code>&lt;Form.Select&gt;</code>s. They work in the same way, but unlike <code>&lt;input&gt;</code>s, they’ll
          always show the <code>&lt;label&gt;</code> in its floated state.
        </p>
        <div className="example">
          <SelectExample />
        </div>
        <CodePreview code={selectExampleCode} language="javascript" />

        <hr />

        <h4 id="layout">Layout</h4>
        <p className="mb-3">
          When working with the Bootstrap grid system, be sure to place form elements within column classes.
        </p>
        <div className="example">
          <LayoutExample />
        </div>
        <CodePreview code={layoutExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#textarea" className="nav-link">
              Textareas
            </a>
          </li>
          <li className="nav-item">
            <a href="#select" className="nav-link">
              Selects
            </a>
          </li>
          <li className="nav-item">
            <a href="#layout" className="nav-link">
              Layout
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default FloatingLabelPage;
