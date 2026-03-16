import { Row, Col } from 'react-bootstrap';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import ActiveExample, { activeExampleCode } from './components/Active';
import DisabledExample, { disabledExampleCode } from './components/Disabled';
import LinkedExample, { linkedExampleCode } from './components/Linked';
import FlushExample, { flushExampleCode } from './components/Flush';
import NumberedExample, { numberedExampleCode } from './components/Numbered';
import NumberedCustomExample, { numberedCustomExampleCode } from './components/NumberedCustom';
import HorizontalExample, { horizontalExampleCode } from './components/Horizontal';
import HorizontalResponsiveExample, { horizontalResponsiveExampleCode } from './components/HorizontalResponsive';
import StyleExample, { StyleExampleCode } from './components/Style';
import TabsExample, { tabsExampleCode } from './components/Tabs';

const ListGroupPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">List groups</h1>
        <p className="lead">
          List groups are a flexible and powerful component for displaying a series of content. Modify and extend them
          to support just about any content within. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/list-group" target="_blank" rel="noopener noreferrer">
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

        <h4 id="active">Active items</h4>
        <p className="mb-3">
          Set the <code>active</code> prop to indicate the list groups current active selection.
        </p>
        <div className="example">
          <ActiveExample />
        </div>
        <CodePreview code={activeExampleCode} language="javascript" />

        <hr />

        <h4 id="disabled">Disabled items</h4>
        <p className="mb-3">
          Set the <code>disabled</code> prop to prevent actions on a <code>&lt;ListGroup.Item&gt;</code>. For elements
          that aren't naturally disable-able (like anchors) <code>onClick</code> handlers are added that call{' '}
          <code>preventDefault</code> to mimick disabled behavior.
        </p>
        <div className="example">
          <DisabledExample />
        </div>
        <CodePreview code={disabledExampleCode} language="javascript" />

        <hr />

        <h4 id="action">Actionable items</h4>
        <p className="mb-3">
          Toggle the <code>action</code> prop to create <em>actionable</em> list group items, with disabled, hover and
          active styles. List item actions will render a <code>&lt;button&gt;</code> or <code>&lt;a&gt;</code>{' '}
          (depending on the presence of an <code>href</code>) by default but can be overridden by setting the{' '}
          <code>as</code> prop as usual.
        </p>
        <p className="mb-3">
          List items <code>actions</code> are distinct from plain items to ensure that click or tap affordances aren't
          applied to non-interactive items.
        </p>
        <div className="example">
          <LinkedExample />
        </div>
        <CodePreview code={linkedExampleCode} language="javascript" />

        <hr />

        <h4 id="flush">Flush</h4>
        <p className="mb-3">
          Add the <code>flush</code> variant to remove outer borders and rounded corners to render list group items
          edge-to-edge in a parent container{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/cards#list-groups" target="_blank" rel="noopener noreferrer">
            such as a <code>Card</code>
          </a>
          .
        </p>
        <div className="example">
          <FlushExample />
        </div>
        <CodePreview code={flushExampleCode} language="javascript" />

        <hr />

        <h4 id="numbered">Numbered</h4>
        <p className="mb-3">
          Add the <code>numbered</code> prop to opt into numbered list group items. Numbers are generated via CSS (as
          opposed to a <code>&lt;ol&gt;</code>s default browser styling) for better placement inside list group items
          and to allow for better customization.
        </p>
        <div className="example">
          <NumberedExample />
        </div>
        <CodePreview code={numberedExampleCode} language="javascript" />

        <p className="mb-3">These work great with custom content as well.</p>
        <div className="example">
          <NumberedCustomExample />
        </div>
        <CodePreview code={numberedCustomExampleCode} language="javascript" />

        <hr />

        <h4 id="horizontal">Horizontal</h4>
        <p className="mb-3">
          Use the <code>horizontal</code> prop to make the ListGroup render horizontally. Currently{' '}
          <strong>horizontal list groups cannot be combined with flush list groups.</strong>
        </p>
        <div className="example">
          <HorizontalExample />
        </div>
        <CodePreview code={horizontalExampleCode} language="javascript" />

        <p className="mb-3">
          There are responsive variants to <code>horizontal</code>: setting it to <code>{'{sm|md|lg|xl|xxl}'}</code>{' '}
          makes the list group horizontal starting at that breakpoint’s <code>min-width</code>.
        </p>
        <div className="example">
          <HorizontalResponsiveExample />
        </div>
        <CodePreview code={horizontalResponsiveExampleCode} language="javascript" />

        <hr />

        <h4 id="contextual">Contextual classes</h4>
        <p className="mb-3">
          Use contextual variants on <code>&lt;ListGroup.Item&gt;</code>s to style them with a stateful background and
          color.
        </p>
        <div className="example">
          <StyleExample />
        </div>
        <CodePreview code={StyleExampleCode} language="javascript" />

        <hr />

        <h4 id="tabs">Tabbed Interfaces</h4>
        <p className="mb-3">
          You can also use the [Tab][tabs] components to create ARIA compliant tabbable interfaces with the{' '}
          <code>&lt;ListGroup&gt;</code> component. Swap out the <code>&lt;Nav&gt;</code> component for the list group
          and you are good to go.
        </p>
        <div className="example">
          <TabsExample />
        </div>
        <CodePreview code={tabsExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#active" className="nav-link">
              Active items
            </a>
          </li>
          <li className="nav-item">
            <a href="#disabled" className="nav-link">
              Disabled items
            </a>
          </li>
          <li className="nav-item">
            <a href="#action" className="nav-link">
              Actionable items
            </a>
          </li>
          <li className="nav-item">
            <a href="#flush" className="nav-link">
              Flush
            </a>
          </li>
          <li className="nav-item">
            <a href="#numbered" className="nav-link">
              Numbered
            </a>
          </li>
          <li className="nav-item">
            <a href="#horizontal" className="nav-link">
              Horizontal
            </a>
          </li>
          <li className="nav-item">
            <a href="#contextual" className="nav-link">
              Contextual classes
            </a>
          </li>
          <li className="nav-item">
            <a href="#tabs" className="nav-link">
              Tabs
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default ListGroupPage;
