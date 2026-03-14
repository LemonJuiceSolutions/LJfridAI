import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import ToolbarBasicExample, { toolbarBasicExampleCode } from './components/ToolbarBasic';
import ToolbarExample, { toolbarExampleCode } from './components/Toolbar';
import SizesExample, { sizesExampleCode } from './components/Sizes';
import NestedExample, { nestedExampleCode } from './components/Nested';
import VerticalExample, { verticalExampleCode } from './components/Vertical';

const ButtonGroupPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Button group</h1>
        <p className="lead">
          Group a series of buttons together on a single line or stack them in a vertical column. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/button-group" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Wrap a series of <code>&lt;Button&gt;</code>s in a <code>&lt;ButtonGroup&gt;</code>.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="toolbar">Button toolbar</h4>
        <p className="mb-3">
          Combine sets of <code>&lt;ButtonGroup&gt;</code>s into a <code>&lt;ButtonToolbar&gt;</code> for more complex
          components.
        </p>
        <div className="example">
          <ToolbarBasicExample />
        </div>
        <CodePreview code={toolbarBasicExampleCode} language="javascript" />

        <p className="mb-3">
          Feel free to mix input groups with button groups in your toolbars. Similar to the example above, you’ll likely
          need some utilities though to space things properly.
        </p>
        <div className="example">
          <ToolbarExample />
        </div>
        <CodePreview code={toolbarExampleCode} language="javascript" />

        <hr />

        <h4 id="sizing">Sizing</h4>
        <p className="mb-3">
          Instead of applying button sizing props to every button in a group, just add <code>size</code> prop to the{' '}
          <code>&lt;ButtonGroup&gt;</code>.
        </p>
        <div className="example">
          <SizesExample />
        </div>
        <CodePreview code={sizesExampleCode} language="javascript" />

        <hr />

        <h4 id="nesting">Nesting</h4>
        <p className="mb-3">
          You can place other button types within the <code>&lt;ButtonGroup&gt;</code> like{' '}
          <code>&lt;DropdownButton&gt;</code>s.
        </p>
        <div className="example">
          <NestedExample />
        </div>
        <CodePreview code={nestedExampleCode} language="javascript" />

        <hr />

        <h4 id="vertical">Vertical variation</h4>
        <p className="mb-3">
          Make a set of buttons appear vertically stacked rather than horizontally, by adding <code>vertical</code> to
          the <code>&lt;ButtonGroup&gt;</code>.<strong>Split button dropdowns are not supported here.</strong>
        </p>
        <div className="example">
          <VerticalExample />
        </div>
        <CodePreview code={verticalExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#toolbar" className="nav-link">
              Button toolbar
            </a>
          </li>
          <li className="nav-item">
            <a href="#sizing" className="nav-link">
              Sizing
            </a>
          </li>
          <li className="nav-item">
            <a href="#nesting" className="nav-link">
              Nesting
            </a>
          </li>
          <li className="nav-item">
            <a href="#vertical" className="nav-link">
              Vertical variation
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ButtonGroupPage;
