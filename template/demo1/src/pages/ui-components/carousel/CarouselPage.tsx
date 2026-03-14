import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import ControlledCarousel, { controlledCarouselCode } from './components/Controlled';
import FadeExample, { fadeExampleCode } from './components/Fade';

const CarouselPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Carousels</h1>
        <p className="lead">
          A slideshow component for cycling through elements—images or slides of text—like a carousel. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/carousel" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Carousels support previous/next controls and indicators, they’re not explicitly required. Add and customize as
          you see fit.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="controlled">Controlled</h4>
        <p className="mb-3">
          You can also <em>control</em> the Carousel state, via the <code>activeIndex</code> prop and{' '}
          <code>onSelect</code> handler.
        </p>
        <div className="example">
          <ControlledCarousel />
        </div>
        <CodePreview code={controlledCarouselCode} language="javascript" />

        <hr />

        <h4 id="crossfade">Crossfade</h4>
        <p className="mb-3">
          Add the <code>fade</code> prop to your carousel to animate slides with a fade transition instead of a slide.
        </p>
        <div className="example">
          <FadeExample />
        </div>
        <CodePreview code={fadeExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#controlled" className="nav-link">
              Controlled
            </a>
          </li>
          <li className="nav-item">
            <a href="#crossfade" className="nav-link">
              Crossfade
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default CarouselPage;
