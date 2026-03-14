import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import OutlineExample, { outlineExampleCode } from './components/Outline';
import TagsExample, { tagsExampleCode } from './components/Tags';
import SizesExample, { sizesExampleCode } from './components/Sizes';
import BlockExample, { blockExampleCode } from './components/Block';
import ActiveExample, { activeExampleCode } from './components/Active';
import DisabledExample, { disabledExampleCode } from './components/Disabled';
import LoadingButton, { loadingButtonCode } from './components/Loading';
import IconExample, { iconExampleCode } from './components/Icon';
import IconTextExample, { iconTextExampleCode } from './components/IconText';

const ButtonPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Buttons</h1>
        <p className="lead">
          Use Bootstrap’s custom button styles for actions in forms, dialogs, and more with support for multiple sizes,
          states, and more. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/buttons" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Use any of the available button style types to quickly create a styled button. Just modify the{' '}
          <code>variant</code> prop.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="outline">Outline buttons</h4>
        <p className="mb-3">
          For a lighter touch, Buttons also come in <code>outline-*</code> variants with no background color.
        </p>
        <div className="example">
          <OutlineExample />
        </div>
        <CodePreview code={outlineExampleCode} language="javascript" />

        <hr />

        <h4 id="tags">Button tags</h4>
        <p className="mb-3">
          Normally <code>&lt;Button&gt;</code> components will render a HTML
          <code>&lt;button&gt;</code> element. However you can render whatever you'd like, adding a <code>href</code>{' '}
          prop will automatically render an
          <code>&lt;a /&gt;</code> element. You can use the <code>as</code> prop to render whatever your heart desires.
          React Bootstrap will take care of the proper ARIA roles for you.
        </p>
        <div className="example">
          <TagsExample />
        </div>
        <CodePreview code={tagsExampleCode} language="javascript" />

        <hr />

        <h4 id="sizes">Sizes</h4>
        <p className="mb-3">
          Fancy larger or smaller buttons? Add <code>size="lg"</code>, <code>size="sm"</code> for additional sizes.
        </p>
        <div className="example">
          <SizesExample />
        </div>
        <CodePreview code={sizesExampleCode} language="javascript" />

        <hr />

        <h4 id="block">Block buttons</h4>
        <p className="mb-3">
          Create responsive stacks of full-width, “block buttons” with a mix of our display and gap utilities.
        </p>
        <div className="example">
          <BlockExample />
        </div>
        <CodePreview code={blockExampleCode} language="javascript" />

        <hr />

        <h4 id="active">Active state</h4>
        <p className="mb-3">
          To set a button's active state simply set the component's <code>active</code> prop.
        </p>
        <div className="example">
          <ActiveExample />
        </div>
        <CodePreview code={activeExampleCode} language="javascript" />

        <hr />

        <h4 id="disabled">Disabled state</h4>
        <p className="mb-3">
          To set a button's active state simply set the component's <code>active</code> prop.
        </p>
        <div className="example">
          <DisabledExample />
        </div>
        <CodePreview code={disabledExampleCode} language="javascript" />

        <hr />

        <h4 id="loading">Button loading state</h4>
        <p>
          When activating an asynchronous action from a button it is a good UX pattern to give the user feedback as to
          the loading state, this can easily be done by updating your <code>&lt;Button /&gt;</code>s props from a state
          change like below.
        </p>
        <p className="mb-3">
          To set a button's active state simply set the component's <code>active</code> prop.
        </p>
        <div className="example">
          <LoadingButton />
        </div>
        <CodePreview code={loadingButtonCode} language="javascript" />

        <hr />

        <h4 id="icon">Icon buttons</h4>
        <p className="mb-3">
          Add class <code>.btn-icon</code> for buttons with only icons.
        </p>
        <div className="example">
          <IconExample />
        </div>
        <CodePreview code={iconExampleCode} language="javascript" />

        <hr />

        <h4 id="iconText">Button with icon and text</h4>
        <p className="mb-3">
          Add class <code>.btn-icon-text</code> for buttons and use <code>.btn-icon-prepend</code> or{' '}
          <code>.btn-icon-append</code> for icon tags.
        </p>
        <div className="example">
          <IconTextExample />
        </div>
        <CodePreview code={iconTextExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#outline" className="nav-link">
              Outline buttons
            </a>
          </li>
          <li className="nav-item">
            <a href="#tags" className="nav-link">
              Button tags
            </a>
          </li>
          <li className="nav-item">
            <a href="#sizes" className="nav-link">
              Sizes
            </a>
          </li>
          <li className="nav-item">
            <a href="#block" className="nav-link">
              Block buttons
            </a>
          </li>
          <li className="nav-item">
            <a href="#active" className="nav-link">
              Active state
            </a>
          </li>
          <li className="nav-item">
            <a href="#disabled" className="nav-link">
              Disabled state
            </a>
          </li>
          <li className="nav-item">
            <a href="#loading" className="nav-link">
              Button loading state
            </a>
          </li>
          <li className="nav-item">
            <a href="#icon" className="nav-link">
              Icon buttons
            </a>
          </li>
          <li className="nav-item">
            <a href="#iconText" className="nav-link">
              With icon and text
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ButtonPage;
