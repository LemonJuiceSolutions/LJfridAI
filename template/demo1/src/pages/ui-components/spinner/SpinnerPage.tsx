import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import BorderExample, { borderExampleCode } from './components/Border';
import GrowExample, { growExampleCode } from './components/Grow';
import VariantsExample, { VariantsExampleCode } from './components/Variants';
import SizesExample, { sizesExampleCode } from './components/Sizes';
import ButtonExample, { buttonExampleCode } from './components/Buttons';

const SpinnerPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Spinners</h1>
        <p className="lead">
          Spinners can be used to show the loading state in your projects. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/spinners" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="animations">Animations</h4>
        <p className="mb-3">
          Bootstrap offers two animation styles for spinners. The animation style can be configured with the{' '}
          <code>animation</code> property. An animation style must always be provided when creating a spinner.
        </p>
        <p className="mb-3">
          ** Border Spinner - <code>border</code>**
        </p>
        <div className="example">
          <BorderExample />
        </div>
        <CodePreview code={borderExampleCode} language="javascript" />

        <p className="mb-3">
          ** Grow Spinner - <code>grow</code> **
        </p>
        <div className="example">
          <GrowExample />
        </div>
        <CodePreview code={growExampleCode} language="javascript" />

        <hr />

        <h4 id="variants">Variants</h4>
        <p className="mb-3">
          All standard visual variants are available for both animation styles by setting the <code>variant</code>{' '}
          property. Alternatively spinners can be custom sized with the <code>style</code> property, or custom CSS
          classes.
        </p>
        <div className="example">
          <VariantsExample />
        </div>
        <CodePreview code={VariantsExampleCode} language="javascript" />

        <hr />

        <h4 id="sizing">Sizing</h4>
        <p className="mb-3">
          In addition to the standard size, a smaller additional preconfigured size is available by configuring the{' '}
          <code>size</code> property to <code>sm</code>.
        </p>
        <div className="example">
          <SizesExample />
        </div>
        <CodePreview code={sizesExampleCode} language="javascript" />

        <hr />

        <h4 id="buttons">Buttons</h4>
        <p className="mb-3">
          Like the original Bootstrap spinners, these can also be used with buttons. To use this component
          out-of-the-box it is recommended you change the element type to <code>span</code> by configuring the{' '}
          <code>as</code> property when using spinners inside buttons.
        </p>
        <div className="example">
          <ButtonExample />
        </div>
        <CodePreview code={buttonExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#animations" className="nav-link">
              Animations
            </a>
          </li>
          <li className="nav-item">
            <a href="#variants" className="nav-link">
              Variants
            </a>
          </li>
          <li className="nav-item">
            <a href="#sizing" className="nav-link">
              Sizing
            </a>
          </li>
          <li className="nav-item">
            <a href="#buttons" className="nav-link">
              Buttons
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default SpinnerPage;
