import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import StaticBackdropExample, { staticBackdropExampleCode } from './components/StaticBackdrop';
import VerticallyCenteredExample, { verticallyCenteredExampleCode } from './components/VerticallyCentered';
import SizingExample, { SizingExampleCode } from './components/Sizing';
import FullscreenExample, { fullscreenExampleCode } from './components/Fullscreen';
import ScrollableExample, { scrollableExampleCode } from './components/Scrollable';

const ModalPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Modals</h1>
        <p className="lead">
          Add dialogs to your site for lightboxes, user notifications, or completely custom content. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/modal" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          A modal with header, body, and set of actions in the footer. Use <code>&lt;Modal/&gt;</code> in combination
          with other components to show or hide your Modal. The <code>&lt;Modal/&gt;</code> Component comes with a few
          convenient "sub components": <code>&lt;Modal.Header/&gt;</code>, <code>&lt;Modal.Title/&gt;</code>,{' '}
          <code>&lt;Modal.Body/&gt;</code>, and <code>&lt;Modal.Footer/&gt;</code>, which you can use to build the Modal
          content.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="backdrop">Static backdrop</h4>
        <p className="mb-3">
          When backdrop is set to static, the modal will not close when clicking outside it. Click the button below to
          try it.
        </p>
        <div className="example">
          <StaticBackdropExample />
        </div>
        <CodePreview code={staticBackdropExampleCode} language="javascript" />

        <hr />

        <h4 id="v-center">Vertically centered</h4>
        <p className="mb-3">
          You can vertically center a modal by passing the <code>centered</code> prop.
        </p>
        <div className="example">
          <VerticallyCenteredExample />
        </div>
        <CodePreview code={verticallyCenteredExampleCode} language="javascript" />

        <hr />

        <h4 id="scrolling">Scrolling long content</h4>
        <p className="mb-3">
          When modals become too long for the user’s viewport or device. Pass the <code>scrollable</code> prop.
        </p>
        <div className="example">
          <ScrollableExample />
        </div>
        <CodePreview code={scrollableExampleCode} language="javascript" />

        <hr />

        <h4 id="sizing">Optional Sizes</h4>
        <p className="mb-3">
          You can specify a Bootstrap large or small modal by using the <code>size</code> prop.
        </p>
        <div className="example">
          <SizingExample />
        </div>
        <CodePreview code={SizingExampleCode} language="javascript" />

        <hr />

        <h4 id="fullscreen">Fullscreen Modal</h4>
        <p className="mb-3">
          You can use the <code>fullscreen</code> prop to make the modal fullscreen. Specifying a breakpoint will only
          set the modal as fullscreen <strong>below</strong> the breakpoint size.
        </p>
        <div className="example">
          <FullscreenExample />
        </div>
        <CodePreview code={fullscreenExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#backdrop" className="nav-link">
              Static backdrop
            </a>
          </li>
          <li className="nav-item">
            <a href="#v-center" className="nav-link">
              Vertically centered
            </a>
          </li>
          <li className="nav-item">
            <a href="#scrolling" className="nav-link">
              Scrolling long content
            </a>
          </li>
          <li className="nav-item">
            <a href="#sizing" className="nav-link">
              Optional Sizes
            </a>
          </li>
          <li className="nav-item">
            <a href="#fullscreen" className="nav-link">
              Fullscreen Modal
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ModalPage;
