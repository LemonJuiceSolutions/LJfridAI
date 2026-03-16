import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';

const ScrollbarPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">SimplebarReact</h1>
        <p className="lead">
          Custom scrollbar with native scroll, done simple, lightweight, easy to use and cross-browser. Read the{' '}
          <a href="https://github.com/Grsmto/simplebar/tree/master/packages/simplebar-react" target="_blank" rel="noopener noreferrer">
            Official SimplebarReact Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Example</h4>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Example
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ScrollbarPage;
