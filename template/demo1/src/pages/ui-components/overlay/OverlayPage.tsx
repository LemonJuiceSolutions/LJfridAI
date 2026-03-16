import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import OverlayExample, { overlayExampleCode } from './components/Overlay';
import TriggerExample, { triggerExampleCode } from './components/Trigger';
import TooltipExample, { tooltipExampleCode } from './components/Tooltip';
import TooltipOverlayExample, { tooltipOverlayExampleCode } from './components/TooltipOverlay';
import TooltipPositionedExample, { tooltipPositionedExampleCode } from './components/TooltipPositioned';
import PopoverExample, { popoverExampleCode } from './components/Popover';
import PopoverPositionedExample, { popoverPositionedExampleCode } from './components/PopoverPositioned';

const OverlayPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Overlay</h1>
        <p className="lead">
          A set of components for positioning beautiful overlays, tooltips, popovers, and anything else you need. Read
          the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/overlays" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4>Overview</h4>
        <p className="mb-3">Things to know about the React-Bootstrap Overlay components.</p>
        <ul>
          <li>
            Overlays rely on the third-party library{' '}
            <a href="https://popper.js.org" target="_blank" rel="noopener noreferrer">
              Popper.js
            </a>
            . It's included automatically with React-Bootstrap, but you should reference the API for more advanced use
            cases.
          </li>
          <li>
            The <code>&lt;Tooltip&gt;</code> and <code>&lt;Popover&gt;</code> components do not position themselves.
            Instead the
            <code>&lt;Overlay&gt;</code> (or <code>&lt;OverlayTrigger&gt;</code>) components, inject <code>ref</code>{' '}
            and <code>style</code> props.
          </li>
          <li>
            Tooltip expects specific props injected by the <code>&lt;Overlay&gt;</code> component.
          </li>
          <li>
            Tooltips for <code>disabled</code> elements must be triggered on a wrapper element.
          </li>
        </ul>

        <hr />

        <h4 id="default">Creating an Overlay</h4>
        <p className="mb-3">
          <code>Overlay</code> is the fundamental component for positioning and controlling tooltip visibility. It's a
          wrapper around Popper.js, that adds support for transitions, and visibility toggling.
        </p>
        <p className="mb-3">
          Overlays consist of at least two elements, the "overlay", the element to be positioned, as well as a "target",
          the element the overlay is positioned in relation to. You can also have an "arrow" element, like the tooltips
          and popovers, but that is optional. Be sure to check out the{' '}
          <a href="https://popper.js.org/docs/v2" target="_blank" rel="noopener noreferrer">
            Popper{' '}
          </a>
          documentation for more details about the injected props.
        </p>
        <div className="example">
          <OverlayExample />
        </div>
        <CodePreview code={overlayExampleCode} language="javascript" />

        <hr />

        <h4 id="trigger">OverlayTrigger</h4>
        <p className="mb-3">
          Since the above pattern is pretty common, but verbose, we've included
          <code> &lt;OverlayTrigger&gt;</code> component to help with common use-cases. It even has functionality to
          delayed show or hides, and a few different "trigger" events you can mix and match.
        </p>
        <div className="example">
          <TriggerExample />
        </div>
        <CodePreview code={triggerExampleCode} language="javascript" />

        <hr />

        <h4 id="tooltips">Tooltips</h4>
        <p className="mb-3">
          A tooltip component for a more stylish alternative to that anchor tag <code>title</code> attribute. Hover over
          the links below to see tooltips.
        </p>
        <div className="example">
          <TooltipExample />
        </div>
        <CodePreview code={tooltipExampleCode} language="javascript" />

        <p className="mb-3">
          You can pass the <code>Overlay</code> injected props directly to the Tooltip component.
        </p>
        <div className="example">
          <TooltipOverlayExample />
        </div>
        <CodePreview code={tooltipOverlayExampleCode} language="javascript" />

        <p className="mb-3">
          Or pass a Tooltip element to <code>OverlayTrigger</code> instead.
        </p>
        <div className="example">
          <TooltipPositionedExample />
        </div>
        <CodePreview code={tooltipPositionedExampleCode} language="javascript" />

        <hr />

        <h4 id="popovers">Popovers</h4>
        <p className="mb-3">A popover component, like those found in iOS.</p>
        <div className="example">
          <PopoverExample />
        </div>
        <CodePreview code={popoverExampleCode} language="javascript" />

        <p className="mb-3">
          As with <code>&lt;Tooltip&gt;</code>s, you can control the placement of the Popover.
        </p>
        <div className="example">
          <PopoverPositionedExample />
        </div>
        <CodePreview code={popoverPositionedExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Creating an Overlay
            </a>
          </li>
          <li className="nav-item">
            <a href="#trigger" className="nav-link">
              OverlayTrigger
            </a>
          </li>
          <li className="nav-item">
            <a href="#tooltips" className="nav-link">
              Tooltips
            </a>
          </li>
          <li className="nav-item">
            <a href="#popovers" className="nav-link">
              Popovers
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default OverlayPage;
