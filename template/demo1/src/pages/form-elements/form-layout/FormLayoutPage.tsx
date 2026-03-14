import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import FormGroupExample, { formGroupExampleCode } from './components/FormGroup';
import GridBasicExample, { gridBasicExampleCode } from './components/GridBasic';
import GridComplexExample, { gridComplexExampleCode } from './components/GridComplex';
import HorizontalExample, { horizontalExampleCode } from './components/Horizontal';
import FormLabelSizingExample, { formLabelSizingExampleCode } from './components/LabelSizes';
import GridColSizesExample, { gridColSizesExampleCode } from './components/ColumnSizing';
import GridAutoSizingExample, { gridAutoSizingExampleCode } from './components/AutoSizing';

const FormLayoutPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Layout</h1>
        <p className="lead">
          Give your forms some structure—from inline to horizontal to custom grid implementations—with our form layout
          options. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/layout" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="forms">Forms</h4>
        <p className="mb-3">
          Every group of form fields should reside in a <code>&lt;Form&gt;</code> element. Bootstrap provides no default
          styling for the <code>&lt;Form&gt;</code> element, but there are some powerful browser features that are
          provided by default.
        </p>
        <ul className="mb-3">
          <li>
            New to browser forms? Consider reviewing{' '}
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form"
              target="_blank"
              rel="noopener noreferrer"
            >
              the MDN form docs
            </a>
            for an overview and complete list of available attributes.
          </li>
          <li>
            <code>&lt;button&gt;</code>s within a <code>&lt;Form&gt;</code> default to <code>type="submit"</code>, so
            strive to be specific and always include a <code>type</code>.
          </li>
          <li>
            You can disable all controls within a form by wrapping them in a <code>&lt;fieldset&gt;</code> and setting
            the <code>disabled</code> attribute on it.
          </li>
        </ul>
        <p>
          Since Bootstrap applies <code>display: block</code> and <code>width: 100%</code> to almost all our form
          controls, forms will by default stack vertically. Additional classes can be used to vary this layout on a
          per-form basis.
        </p>

        <hr />

        <h4 id="form-group">Form groups</h4>
        <p className="mb-3">
          The <code>FormGroup</code> component is the easiest way to add some structure to forms. It provides a flexible
          container for grouping of labels, controls, optional help text, and form validation messaging. Use it with{' '}
          <code>fieldset</code>s, <code>div</code>s, or nearly any other element.
        </p>
        <p className="mb-3">
          You also add the <code>controlId</code> prop to accessibly wire the nested label and input together via the{' '}
          <code>id</code>.
        </p>
        <div className="example">
          <FormGroupExample />
        </div>
        <CodePreview code={formGroupExampleCode} language="javascript" />

        <hr />

        <h4 id="form-grid">Form grid</h4>
        <p className="mb-3">
          More complex forms can be built using the grid components. Use these for form layouts that require multiple
          columns, varied widths, and additional alignment options.
        </p>
        <div className="example">
          <GridBasicExample />
        </div>
        <CodePreview code={gridBasicExampleCode} language="javascript" />

        <p className="mb-3">More complex layouts can also be created with the grid system.</p>
        <div className="example">
          <GridComplexExample />
        </div>
        <CodePreview code={gridComplexExampleCode} language="javascript" />

        <hr />

        <h4 id="horizontal-form">Horizontal form</h4>
        <p className="mb-3">
          Create horizontal forms with the grid by adding <code>as=&#123;Row&#125;</code> to form groups and using{' '}
          <code>Col</code> to specify the width of your labels and controls. Be sure to add the <code>column </code>{' '}
          prop to your <code>FormLabel</code>s as well so they’re vertically centered with their associated form
          controls.
        </p>
        <p className="mb-3">
          At times, you maybe need to use margin or padding utilities to create that perfect alignment you need. For
          example, we’ve removed the <code>padding-top</code> on our stacked radio inputs label to better align the text
          baseline.
        </p>
        <div className="example">
          <HorizontalExample />
        </div>
        <CodePreview code={horizontalExampleCode} language="javascript" />

        <hr />

        <h4 id="label-size">Horizontal form label sizing</h4>
        <p className="mb-3">
          You can size the <code>&lt;FormLabel&gt;</code> using the <code>column</code> prop as shown.
        </p>
        <div className="example">
          <FormLabelSizingExample />
        </div>
        <CodePreview code={formLabelSizingExampleCode} language="javascript" />

        <hr />

        <h4 id="column-sizing">Column sizing</h4>
        <p className="mb-3">
          As shown in the previous examples, our grid system allows you to place any number of <code>&lt;Col&gt;</code>s
          within a <code>&lt;Row&gt;</code>. They'll split the available width equally between them. You may also pick a
          subset of your columns to take up more or less space, while the remaining <code>&lt;Col&gt;</code>s equally
          split the rest, with specific column classes like <code>&lt;Col xs={7}&gt;</code>.
        </p>
        <div className="example">
          <GridColSizesExample />
        </div>
        <CodePreview code={gridColSizesExampleCode} language="javascript" />

        <hr />

        <h4 id="auto-sizing">Auto-sizing</h4>
        <p className="mb-3">
          The example below uses a flexbox utility to vertically center the contents and changes{' '}
          <code>&lt;Col&gt;</code> to <code>&lt;Col xs="auto"&gt;</code> so that your columns only take up as much space
          as needed. Put another way, the column sizes itself based on the contents.
        </p>
        <div className="example">
          <GridAutoSizingExample />
        </div>
        <CodePreview code={gridAutoSizingExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#forms" className="nav-link">
              Forms
            </a>
          </li>
          <li className="nav-item">
            <a href="#form-group" className="nav-link">
              Form groups
            </a>
          </li>
          <li className="nav-item">
            <a href="#form-grid" className="nav-link">
              Form grid
            </a>
          </li>
          <li className="nav-item">
            <a href="#horizontal-form" className="nav-link">
              Horizontal form
            </a>
          </li>
          <li className="nav-item">
            <a href="#label-size" className="nav-link">
              Label sizing
            </a>
          </li>
          <li className="nav-item">
            <a href="#column-sizing" className="nav-link">
              Column sizing
            </a>
          </li>
          <li className="nav-item">
            <a href="#auto-sizing" className="nav-link">
              Auto-sizing
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default FormLayoutPage;
