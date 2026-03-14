import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import BasicExample, { basicExampleCode } from './components/Basic';
import SizesExample, { sizesExampleCode } from './components/Sizes';
import CheckboxExample, { checkboxExampleCode } from './components/Checkbox';
import MultipleInputsExample, { multipleInputsExampleCode } from './components/MultipleInputs';
import MultipleAddonsExample, { multipleAddonsExampleCode } from './components/Multipleaddons';
import ButtonsExample, { buttonsExampleCode } from './components/Buttons';
import ButtonDropdownsExample, { buttonDropdownsExampleCode } from './components/ButtonDropdowns';
import SegmentedButtonDropdownsExample, {
  segmentedButtonDropdownsExampleCode,
} from './components/SegmentedButtonDropdowns';

const InputGroupPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Input Group</h1>
        <p className="lead">
          Easily extend form controls by adding text, buttons, or button groups on either side of textual inputs, custom
          selects, and custom file inputs. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/forms/input-group" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Example</h4>
        <p className="mb-3">
          Place one add-on or button on either side of an input. You may also place one on both sides of an input.
          Remember to place <code>&lt;label&gt;</code>s outside the input group.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="sizing">Sizing</h4>
        <p className="mb-3">
          Add the relative form sizing classes to the <code>InputGroup</code> and contents within will automatically
          resize—no need for repeating the form control size classes on each element.
        </p>
        <div className="example">
          <SizesExample />
        </div>
        <CodePreview code={sizesExampleCode} language="javascript" />

        <hr />

        <h4 id="checkbox">Checkboxes and radios</h4>
        <p className="mb-3">
          Use the <code>InputGroup.Radio</code> or <code>InputGroup.Checkbox</code> to add options to an input group.
        </p>
        <div className="example">
          <CheckboxExample />
        </div>
        <CodePreview code={checkboxExampleCode} language="javascript" />

        <hr />

        <h4 id="multiple-inputs">Multiple inputs</h4>
        <p className="mb-3">
          While multiple inputs are supported visually, validation styles are only available for input groups with a
          single input.
        </p>
        <div className="example">
          <MultipleInputsExample />
        </div>
        <CodePreview code={multipleInputsExampleCode} language="javascript" />

        <hr />

        <h4 id="multiple-addons">Multiple addons</h4>
        <p className="mb-3">Multiple add-ons are supported and can be mixed with checkbox and radio input versions.</p>
        <div className="example">
          <MultipleAddonsExample />
        </div>
        <CodePreview code={multipleAddonsExampleCode} language="javascript" />

        <hr />

        <h4 id="button-addons">Button addons</h4>
        <div className="example">
          <ButtonsExample />
        </div>
        <CodePreview code={buttonsExampleCode} language="javascript" />

        <hr />

        <h4 id="button-Dropdown">Buttons with Dropdowns</h4>
        <div className="example">
          <ButtonDropdownsExample />
        </div>
        <CodePreview code={buttonDropdownsExampleCode} language="javascript" />

        <hr />

        <h4 id="segmented-button">Segmented buttons</h4>
        <div className="example">
          <SegmentedButtonDropdownsExample />
        </div>
        <CodePreview code={segmentedButtonDropdownsExampleCode} language="javascript" />
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
            <a href="#checkbox" className="nav-link">
              Checkboxes and radios
            </a>
          </li>
          <li className="nav-item">
            <a href="#multiple-inputs" className="nav-link">
              Multiple inputs
            </a>
          </li>
          <li className="nav-item">
            <a href="#multiple-addons" className="nav-link">
              Multiple addons
            </a>
          </li>
          <li className="nav-item">
            <a href="#button-addons" className="nav-link">
              Button addons
            </a>
          </li>
          <li className="nav-item">
            <a href="#button-Dropdown" className="nav-link">
              Buttons with Dropdowns
            </a>
          </li>
          <li className="nav-item">
            <a href="#segmented-button" className="nav-link">
              Segmented buttons
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default InputGroupPage;
