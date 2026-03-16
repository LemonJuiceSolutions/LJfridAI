import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';
import BasicButtonExample, { BasicButtonExampleCode } from './components/BasicButton';
import VariantsExample, { variantsExampleCode } from './components/Variants';
import SplitBasicExample, { splitBasicExampleCode } from './components/SplitBasic';
import SplitVariantExample, { splitVariantExampleCode } from './components/SplitVariants';
import ButtonSizesExample, { buttonSizesExampleCode } from './components/Sizes';
import DropDirectionExample, { dropDirectionExampleCode } from './components/DropDirections';
import CustomTogglerExample, { customTogglerExampleCode } from './components/CustomToggler';

const DropdownPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Dropdowns</h1>
        <p className="lead">
          Toggle contextual overlays for displaying lists of links and more with the Bootstrap dropdown plugin. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/dropdowns" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          The basic Dropdown is composed of a wrapping <code>Dropdown</code> and inner <code>&lt;DropdownMenu&gt;</code>
          , and <code>&lt;DropdownToggle&gt;</code>. By default the <code>&lt;DropdownToggle&gt;</code> will render a
          <code>Button</code> component and accepts all the same props.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <p className="mb-3">
          Since the above is such a common configuration react-bootstrap provides the{' '}
          <code>&lt;DropdownButton&gt;</code> component to help reduce typing. Provide a <code>title</code> prop and
          some <code>&lt;DropdownItem&gt;</code>s and you're ready to go.
        </p>
        <div className="example">
          <BasicButtonExample />
        </div>
        <CodePreview code={BasicButtonExampleCode} language="javascript" />

        <p className="mb-3">DropdownButton will forward Button props to the underlying Toggle component</p>
        <div className="example">
          <VariantsExample />
        </div>
        <CodePreview code={variantsExampleCode} language="javascript" />

        <hr />

        <h4 id="split">Split button dropdowns</h4>
        <p className="mb-3">
          Similarly, You create a split dropdown by combining the Dropdown components with another Button and a
          ButtonGroup.
        </p>
        <div className="example">
          <SplitBasicExample />
        </div>
        <CodePreview code={splitBasicExampleCode} language="javascript" />

        <p className="mb-3">
          As with DropdownButton, <code>SplitButton</code> is provided as convenience component.
        </p>
        <div className="example">
          <SplitVariantExample />
        </div>
        <CodePreview code={splitVariantExampleCode} language="javascript" />

        <hr />

        <h4 id="sizing">Sizing</h4>
        <p className="mb-3">Dropdowns work with buttons of all sizes.</p>
        <div className="example">
          <ButtonSizesExample />
        </div>
        <CodePreview code={buttonSizesExampleCode} language="javascript" />

        <hr />

        <h4 id="directions">Drop directions</h4>
        <p className="mb-3">
          Trigger dropdown menus above, below, left, or to the right of their toggle elements, with the{' '}
          <code>drop</code> prop.
        </p>
        <div className="example">
          <DropDirectionExample />
        </div>
        <CodePreview code={dropDirectionExampleCode} language="javascript" />

        <hr />

        <h4 id="custom">Custom toggler</h4>
        <div className="example">
          <CustomTogglerExample />
        </div>
        <CodePreview code={customTogglerExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#split" className="nav-link">
              Split button dropdowns
            </a>
          </li>
          <li className="nav-item">
            <a href="#sizing" className="nav-link">
              Sizing
            </a>
          </li>
          <li className="nav-item">
            <a href="#directions" className="nav-link">
              Drop directions
            </a>
          </li>
          <li className="nav-item">
            <a href="#custom" className="nav-link">
              Custom toggler
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default DropdownPage;
