import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';
import SizesExample, { sizesExampleCode } from './components/Sizes';
import DisabledExample, { disabledExampleCode } from './components/Disabled';
import ReadOnlyExample, { readOnlyExampleCode } from './components/ReadOnly';
import PlaintextExample, { plaintextExampleCode } from './components/Plaintext';
import FileExample, { fileExampleCode } from './components/File';
import ColorPickerExample, { colorPickerExampleCode } from './components/Color';

const FormControlPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Form controls</h1>
        <p className="lead">
          Give textual form controls like &lt;input&gt;s and &lt;textarea&gt;s an upgrade with custom styles, sizing,
          focus states, and more. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/form-control" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Example</h4>
        <p className="mb-3">
          For textual form controls—like <code>input</code>s and <code>textarea</code>s—use the <code>FormControl</code>{' '}
          component. FormControl adds some additional styles for general appearance, focus state, sizing, and more.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="sizing">Sizing</h4>
        <p className="mb-3">
          Use <code>size</code> on <code>&lt;FormControl&gt;</code> to change the size of the input.
        </p>
        <div className="example">
          <SizesExample />
        </div>
        <CodePreview code={sizesExampleCode} language="javascript" />

        <hr />

        <h4 id="disabled">Disabled</h4>
        <p className="mb-3">
          Add the <code>disabled</code> prop on an input to give it a grayed out appearance and remove pointer events.
        </p>
        <div className="example">
          <DisabledExample />
        </div>
        <CodePreview code={disabledExampleCode} language="javascript" />

        <hr />

        <h4 id="readonly">Readonly</h4>
        <p className="mb-3">
          Add the <code>readOnly</code> prop on an input to prevent modification of the input's value. Read-only inputs
          appear lighter (just like disabled inputs), but retain the standard cursor.
        </p>
        <div className="example">
          <ReadOnlyExample />
        </div>
        <CodePreview code={readOnlyExampleCode} language="javascript" />

        <hr />

        <h4 id="text">Readonly plain text</h4>
        <p className="mb-3">
          If you want to have readonly elements in your form styled as plain text, use the <code>plaintext</code> prop
          on FormControls to remove the default form field styling and preserve the correct margin and padding.
        </p>
        <div className="example">
          <PlaintextExample />
        </div>
        <CodePreview code={plaintextExampleCode} language="javascript" />

        <hr />

        <h4 id="file">File input</h4>
        <div className="example">
          <FileExample />
        </div>
        <CodePreview code={fileExampleCode} language="javascript" />

        <hr />

        <h4 id="color">Color</h4>
        <div className="example">
          <ColorPickerExample />
        </div>
        <CodePreview code={colorPickerExampleCode} language="javascript" />
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
          <li className="nav-item">
            <a href="#disabled" className="nav-link">
              Disabled
            </a>
          </li>
          <li className="nav-item">
            <a href="#readonly" className="nav-link">
              Readonly
            </a>
          </li>
          <li className="nav-item">
            <a href="#text" className="nav-link">
              Readonly plain text
            </a>
          </li>
          <li className="nav-item">
            <a href="#file" className="nav-link">
              File input
            </a>
          </li>
          <li className="nav-item">
            <a href="#color" className="nav-link">
              Color
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default FormControlPage;
