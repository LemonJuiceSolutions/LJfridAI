import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import ButtonExample, { buttonExampleCode } from './components/Button';
import PositionExample, { positionExampleCode } from './components/Position';
import VariationsExample, { variationsExampleCode } from './components/Variations';
import PillExample, { pillExampleCode } from './components/Pill';

const BadgePage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Badges</h1>
        <p className="lead">
          Documentation and examples for badges, our small count and labeling component. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/badge" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Badges scale to match the size of the immediate parent element by using relative font sizing and em units.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="buttons">Buttons</h4>
        <p className="mb-3">Badges can be used as part of links or buttons to provide a counter.</p>
        <div className="example">
          <ButtonExample />
        </div>
        <CodePreview code={buttonExampleCode} language="javascript" />

        <hr />

        <h4 id="positioned">Positioned</h4>
        <p className="mb-3">Use utilities to modify a badge and position it in the corner of a link or button.</p>
        <div className="example">
          <PositionExample />
        </div>
        <CodePreview code={positionExampleCode} language="javascript" />

        <hr />

        <h4 id="variations">Contextual variations</h4>
        <p className="mb-3">Add any of the below mentioned modifier classes to change the appearance of a badge.</p>
        <div className="example">
          <VariationsExample />
        </div>
        <CodePreview code={variationsExampleCode} language="javascript" />

        <hr />

        <h4 id="variations">Pill badges</h4>
        <p className="mb-3">
          Use the <code>pill</code> modifier class to make badges more rounded (with a larger <code>border-radius</code>
          ).
        </p>
        <div className="example">
          <PillExample />
        </div>
        <CodePreview code={pillExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#buttons" className="nav-link">
              Buttons
            </a>
          </li>
          <li className="nav-item">
            <a href="#positioned" className="nav-link">
              Positioned
            </a>
          </li>
          <li className="nav-item">
            <a href="#variations" className="nav-link">
              Contextual variations
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

export default BadgePage;
