import { Row, Col } from 'react-bootstrap';
import CodePreview from '@/components/code-preview/CodePreview';
import CardExample, { cardExampleCode } from './components/Card';
import BasicExample, { basicExampleCode } from './components/Basic';
import WidthExample, { widthExampleCode } from './components/Width';
import ColorExample, { colorExampleCode } from './components/Color';
import SizeExample, { sizeExampleCode } from './components/Size';
import AnimationExample, { animationExampleCode } from './components/Animation';

const PlaceholderPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Placeholders</h1>
        <p className="lead">
          Use loading placeholders for your components or pages to indicate something may still be loading. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/placeholder" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Example</h4>
        <p className="mb-3">
          In the example below, we take a typical card component and recreate it with placeholders applied to create a
          “loading card”. Size and proportions are the same between the two.
        </p>
        <div className="example">
          <CardExample />
        </div>
        <CodePreview code={cardExampleCode} language="javascript" />

        <hr />

        <h4 id="how">How it works</h4>
        <p className="mb-3">
          Create placeholders with the <code>Placeholder</code> component and a grid column prop (e.g.,{' '}
          <code>xs={6}</code>) to set the <code>width</code>. They can replace the text inside an element or be added to
          an existing component via the <code>as</code> prop.
        </p>
        <p className="mb-3">
          Additional styling is applied to <code>PlaceholderButton</code>s via <code>::before</code> to ensure the{' '}
          <code>height</code>
          is respected. You may extend this pattern for other situations as needed, or add a <code>&amp;nbsp;</code>
          within the element to reflect the height when actual text is rendered in its place.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <hr />

        <h4 id="width">Width</h4>
        <p className="mb-3">
          You can change the <code>width</code> through grid column classes, width utilities, or inline styles.
        </p>
        <div className="example">
          <WidthExample />
        </div>
        <CodePreview code={widthExampleCode} language="javascript" />

        <hr />

        <h4 id="color">Color</h4>
        <p className="mb-3">
          By default, the <code>Placeholder</code> uses <code>currentColor</code>. This can be overridden with a custom
          color or utility class.
        </p>
        <div className="example">
          <ColorExample />
        </div>
        <CodePreview code={colorExampleCode} language="javascript" />

        <hr />

        <h4 id="size">Sizing</h4>
        <p className="mb-3">
          The size of <code>Placeholder</code>s are based on the typographic style of the parent element. Customize them
          with sizing props: <code>lg</code>, <code>sm</code>, or <code>xs</code>.
        </p>
        <div className="example">
          <SizeExample />
        </div>
        <CodePreview code={sizeExampleCode} language="javascript" />

        <hr />

        <h4 id="animation">Animation</h4>
        <p className="mb-3">
          Animate placeholders by setting the prop <code>animation</code> to <code>glow</code> or <code>wave</code> to
          better convey the perception of something being <em>actively</em> loaded.
        </p>
        <div className="example">
          <AnimationExample />
        </div>
        <CodePreview code={animationExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Example
            </a>
          </li>
          <li className="nav-item">
            <a href="#how" className="nav-link">
              How it works
            </a>
          </li>
          <li className="nav-item">
            <a href="#width" className="nav-link">
              Width
            </a>
          </li>
          <li className="nav-item">
            <a href="#color" className="nav-link">
              Color
            </a>
          </li>
          <li className="nav-item">
            <a href="#size" className="nav-link">
              Size
            </a>
          </li>
          <li className="nav-item">
            <a href="#animation" className="nav-link">
              Animation
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default PlaceholderPage;
