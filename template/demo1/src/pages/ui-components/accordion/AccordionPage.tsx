import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';

const AccordionPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Accordion</h1>
        <p className="lead">
          Build vertically collapsing accordions in combination with the Collapse component. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/accordion" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>
        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">Click the accordions below to expand/collapse the accordion content.</p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default AccordionPage;
