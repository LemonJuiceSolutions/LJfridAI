import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import ResponsiveExample, { responsiveExampleCode } from './components/Responsive';
import PlacementExample, { placementExampleCode } from './components/Placement';
import BackdropExample, { backdropExampleCode } from './components/Backdrop';
import StaticBackdropExample, { StaticBackdropExampleCode } from './components/StaticBackdrop';

const OffcanvasPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Offcanvas</h1>
        <p className="lead">
          Build hidden sidebars into your project for navigation, shopping carts, and more. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/offcanvas" target="_blank" rel="noopener noreferrer">
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

        <h4 id="responsive">Responsive</h4>
        <p className="mb-3">
          Responsive offcanvas classes hide content outside the viewport from a specified breakpoint and down. Above
          that breakpoint, the contents within will behave as usual.
        </p>
        <div className="example">
          <ResponsiveExample />
        </div>
        <CodePreview code={responsiveExampleCode} language="javascript" />

        <hr />

        <h4 id="placement">Placement</h4>
        <p className="mb-3">Offcanvas supports a few different placements:</p>
        <ul>
          <li>
            <code>start</code> places offcanvas on the left of the viewport
          </li>
          <li>
            <code>end</code> places offcanvas on the right of the viewport
          </li>
          <li>
            <code>top</code> places offcanvas on the top of the viewport
          </li>
          <li>
            <code>bottom</code> places offcanvas on the bottom of the viewport
          </li>
        </ul>
        <div className="example">
          <PlacementExample />
        </div>
        <CodePreview code={placementExampleCode} language="javascript" />

        <hr />

        <h4 id="backdrop">Backdrop</h4>
        <p className="mb-3">
          Scrolling the <code>&lt;body&gt;</code> element is disabled when an offcanvas and its backdrop are visible.
          Use the <code>scroll</code> prop to toggle <code>&lt;body&gt;</code> scrolling and the <code>backdrop</code>{' '}
          prop to toggle the backdrop.
        </p>
        <div className="example">
          <BackdropExample />
        </div>
        <CodePreview code={backdropExampleCode} language="javascript" />

        <hr />

        <h4 id="static">Static backdrop</h4>
        <p className="mb-3">
          When <code>backdrop</code> is set to <code>static</code>, the offcanvas will not close when clicking outside
          of it.
        </p>
        <div className="example">
          <StaticBackdropExample />
        </div>
        <CodePreview code={StaticBackdropExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#responsive" className="nav-link">
              Responsive
            </a>
          </li>
          <li className="nav-item">
            <a href="#placement" className="nav-link">
              Placement
            </a>
          </li>
          <li className="nav-item">
            <a href="#backdrop" className="nav-link">
              Backdrop
            </a>
          </li>
          <li className="nav-item">
            <a href="#static" className="nav-link">
              Static backdrop
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default OffcanvasPage;
