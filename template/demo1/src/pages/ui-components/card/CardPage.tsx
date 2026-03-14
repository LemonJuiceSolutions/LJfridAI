import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import BodyOnlyExample, { bodyOnlyExampleCode } from './components/BodyOnly';
import BodyShorthandExample, { bodyShorthandExampleCode } from './components/BodyShorthand';
import TextExample, { textExampleCode } from './components/Text';
import ListGroupExample, { listGroupExampleCode } from './components/ListGroups';
import ListGroupWithHeaderExample, { listGroupWithHeaderExampleCode } from './components/ListGroupWithHeader';
import KitchenSinkExample, { kitchenSinkExampleCode } from './components/KitchenSink';
import WithHeaderExample, { withHeaderExampleCode } from './components/WithHeader';
import WithHeaderStyledExample, { withHeaderStyledExampleCode } from './components/WithHeaderStyled';
import WithHeaderAndQuoteExample, { withHeaderAndQuoteExampleCode } from './components/WithHeaderAndQuote';
import HeaderAndFooterExample, { headerAndFooterExampleCode } from './components/HeaderAndFooter';
import ImageAndTextExample, { imageAndTextExampleCode } from './components/ImageAndText';
import ImgOverlayExample, { imgOverlayExampleCode } from './components/ImgOverlay';
import BgColorExample, { BgColorExampleCode } from './components/BgColor';
import BorderExample, { borderExampleCode } from './components/Border';
import GroupExample, { groupExampleCode } from './components/Group';
import GridExample, { gridExampleCode } from './components/Grid';

const CardPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Cards</h1>
        <p className="lead">
          Bootstrap’s cards provide a flexible and extensible content container with multiple variants and options. Read
          the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/cards" target="_blank" rel="noopener noreferrer">
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

        <h4 id="content">Content Types</h4>

        <h4 id="body">Body</h4>
        <p className="mb-3">
          Use <code>&lt;Card.Body&gt;</code> to pad content inside a <code>&lt;Card&gt;</code>.
        </p>
        <div className="example">
          <BodyOnlyExample />
        </div>
        <CodePreview code={bodyOnlyExampleCode} language="javascript" />

        <p className="mb-3">
          Alternatively, you can use this shorthand version for Cards with body only, and no other children.
        </p>
        <div className="example">
          <BodyShorthandExample />
        </div>
        <CodePreview code={bodyShorthandExampleCode} language="javascript" />

        <hr />

        <h4 id="text">Title, text, and links</h4>
        <p className="mb-3">
          Using <code>&lt;Card.Title&gt;</code>, <code>&lt;Card.Subtitle&gt;</code>, and <code>&lt;Card.Text&gt;</code>{' '}
          inside the <code>&lt;Card.Body&gt;</code> will line them up nicely. <code>&lt;Card.Link&gt;</code>s are used
          to line up links next to each other.
        </p>
        <p className="mb-3">
          <code>&lt;Card.Text&gt;</code> outputs <code>&lt;p&gt;</code> tags around the content, so you can use multiple{' '}
          <code>&lt;Card.Text&gt;</code>s to create separate paragraphs.
        </p>
        <div className="example">
          <TextExample />
        </div>
        <CodePreview code={textExampleCode} language="javascript" />

        <hr />

        <h4 id="listGroup">List Groups</h4>
        <p className="mb-3">Create lists of content in a card with a flush list group.</p>
        <div className="example">
          <ListGroupExample />
        </div>
        <CodePreview code={listGroupExampleCode} language="javascript" />

        <div className="example">
          <ListGroupWithHeaderExample />
        </div>
        <CodePreview code={listGroupWithHeaderExampleCode} language="javascript" />

        <hr />

        <h4 id="kitchenSink">Kitchen Sink</h4>
        <div className="example">
          <KitchenSinkExample />
        </div>
        <CodePreview code={kitchenSinkExampleCode} language="javascript" />

        <hr />

        <h4 id="header">Header and Footer</h4>
        <p className="mb-3">
          You may add a header by adding a <code>&lt;Card.Header&gt;</code> component.
        </p>
        <div className="example">
          <WithHeaderExample />
        </div>
        <CodePreview code={withHeaderExampleCode} language="javascript" />

        <p className="mb-3">
          A <code>&lt;CardHeader&gt;</code> can be styled by passing a heading element through the{' '}
          <code>&lt;as&gt;</code> prop
        </p>
        <div className="example">
          <WithHeaderStyledExample />
        </div>
        <CodePreview code={withHeaderStyledExampleCode} language="javascript" />

        <div className="example">
          <WithHeaderAndQuoteExample />
        </div>
        <CodePreview code={withHeaderAndQuoteExampleCode} language="javascript" />

        <div className="example">
          <HeaderAndFooterExample />
        </div>
        <CodePreview code={headerAndFooterExampleCode} language="javascript" />

        <hr />

        <h4 id="images">Image caps</h4>
        <p className="mb-3">
          Similar to headers and footers, cards can include top and bottom “image caps”—images at the top or bottom of a
          card.
        </p>
        <div className="example">
          <ImageAndTextExample />
        </div>
        <CodePreview code={imageAndTextExampleCode} language="javascript" />

        <hr />

        <h4 id="imageOverlay">Image Overlays</h4>
        <p className="mb-3">
          Turn an image into a card background and overlay your card’s text. Depending on the image, you may or may not
          need additional styles or utilities.
        </p>
        <div className="example">
          <ImgOverlayExample />
        </div>
        <CodePreview code={imgOverlayExampleCode} language="javascript" />

        <hr />

        <h4 id="background">Background Color</h4>
        <p className="mb-3">
          You can change a card's appearance by changing their <code>&lt;bg&gt;</code>, and <code>&lt;text&gt;</code>{' '}
          props.
        </p>
        <div className="example">
          <BgColorExample />
        </div>
        <CodePreview code={BgColorExampleCode} language="javascript" />

        <hr />

        <h4 id="border">Border Color</h4>
        <p className="mb-3">
          You can change a card's appearance by changing their <code>&lt;bg&gt;</code>, and <code>&lt;text&gt;</code>{' '}
          props.
        </p>
        <div className="example">
          <BorderExample />
        </div>
        <CodePreview code={borderExampleCode} language="javascript" />

        <hr />

        <h4 id="group">Card Groups</h4>
        <div className="example">
          <GroupExample />
        </div>
        <CodePreview code={groupExampleCode} language="javascript" />

        <hr />

        <h4 id="grid">Grid cards</h4>
        <p className="mb-3">
          Use <code>Row</code>'s{' '}
          <a href="https://react-bootstrap.netlify.app/docs/layout/grid/#setting-column-widths-in-row" target="_blank" rel="noopener noreferrer">
            grid column
          </a>{' '}
          props to control how many cards to show per row.
        </p>
        <div className="example">
          <GridExample />
        </div>
        <CodePreview code={gridExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#content" className="nav-link">
              Content Types
            </a>
          </li>
          <li className="nav-item">
            <a href="#body" className="nav-link">
              Body
            </a>
          </li>
          <li className="nav-item">
            <a href="#text" className="nav-link">
              Title, text, and links
            </a>
          </li>
          <li className="nav-item">
            <a href="#listGroup" className="nav-link">
              List Groups
            </a>
          </li>
          <li className="nav-item">
            <a href="#kitchenSink" className="nav-link">
              Kitchen Sink
            </a>
          </li>
          <li className="nav-item">
            <a href="#header" className="nav-link">
              Header and Footer
            </a>
          </li>
          <li className="nav-item">
            <a href="#images" className="nav-link">
              Image caps
            </a>
          </li>
          <li className="nav-item">
            <a href="#imageOverlay" className="nav-link">
              Image Overlays
            </a>
          </li>
          <li className="nav-item">
            <a href="#background" className="nav-link">
              Background color
            </a>
          </li>
          <li className="nav-item">
            <a href="#border" className="nav-link">
              Border color
            </a>
          </li>
          <li className="nav-item">
            <a href="#group" className="nav-link">
              Card Groups
            </a>
          </li>
          <li className="nav-item">
            <a href="#grid" className="nav-link">
              Grid cards
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default CardPage;
