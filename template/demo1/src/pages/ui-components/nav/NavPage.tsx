import { Row, Col } from 'react-bootstrap';
import { Link } from 'react-router';
import BasicExample, { basicExampleCode } from './components/Basic';
import CodePreview from '@/components/code-preview/CodePreview';
import ListExample, { listExampleCode } from './components/List';
import AlignmentExample, { alignmentExampleCode } from './components/Alignment';
import VerticalExample, { verticalExampleCode } from './components/Vertical';
import TabsExample, { tabsExampleCode } from './components/Tabs';
import PillsExample, { PillsExampleCode } from './components/Pills';
import UnderlineExample, { underlineExampleCode } from './components/Underline';
import FillExample, { fillExampleCode } from './components/Fill';
import JustifiedExample, { justifiedExampleCode } from './components/Justified';
import NavDropdownExample, { navDropdownExampleCode } from './components/Dropdown';

const NavPage = () => {
  return (
    <Row>
      <Col xl={10} className="main-content ps-xl-4 pe-xl-5">
        <h1 className="page-title">Navs and tabs</h1>
        <p className="lead">
          Documentation and examples for how to use Bootstrap’s included navigation components. Read the{' '}
          <a href="https://react-bootstrap.netlify.app/docs/components/navs" target="_blank" rel="noopener noreferrer">
            Official React-Bootstrap Documentation
          </a>{' '}
          for a full list of instructions and other options.
        </p>

        <hr />

        <h4 id="default">Basic Example</h4>
        <p className="mb-3">
          Navigation bits in Bootstrap all share a general <code>Nav</code> component and styles. Swap{' '}
          <code>variant</code>s to switch between each style. The base <code>Nav</code> component is built with flexbox
          and provide a strong foundation for building all types of navigation components.
        </p>
        <div className="example">
          <BasicExample />
        </div>
        <CodePreview code={basicExampleCode} language="javascript" />

        <p className="mb-3">
          <code>&lt;Nav&gt;</code> markup is very flexible and styling is controlled via classes so you can use whatever
          elements you like to build your navs. By default <code>&lt;Nav&gt;</code> and <code>&lt;Nav.Item&gt;</code>{' '}
          both render <code>&lt;div&gt;</code>s instead of <code>&lt;ul&gt;</code> and <code>&lt;li&gt;</code> elements
          respectively. This because it's possible (and common) to leave off the <code>&lt;Nav.Item&gt;</code>'s and
          render a <code>&lt;Nav.Link&gt;</code> directly, which would create invalid markup by default (
          <code>ul &gt; a</code>).
        </p>
        <p className="mb-3">
          When a <code>&lt;ul&gt;</code> is appropriate you can render one via the <code>as</code> prop; be sure to also
          set your items to <code>&lt;li&gt;</code> as well!
        </p>
        <div className="example">
          <ListExample />
        </div>
        <CodePreview code={listExampleCode} language="javascript" />

        <hr />

        <h4 id="alignment">Horizontal alignment</h4>
        <p className="mb-3">
          You can control the the direction and orientation of the
          <code>Nav</code> by making use of the{' '}
          <a
            href="https://getbootstrap.com/docs/5.3/utilities/flex#justify-content"
            target="_blank"
            rel="noopener noreferrer"
          >
            flexbox utility
          </a>
          classes. By default, navs are left-aligned, but that is easily changed to center or right-aligned.
        </p>
        <div className="example">
          <AlignmentExample />
        </div>
        <CodePreview code={alignmentExampleCode} language="javascript" />

        <hr />

        <h4 id="vertical">Vertical</h4>
        <p className="mb-3">
          Create stacked navs by changing the flex item direction with the <code>.flex-column</code> class, or your own
          css. You can even use the responsive versions to stack in some viewports but not others (e.g.{' '}
          <code>.flex-sm-column</code>).
        </p>
        <div className="example">
          <VerticalExample />
        </div>
        <CodePreview code={verticalExampleCode} language="javascript" />

        <hr />

        <h4 id="vertical">Vertical</h4>
        <p className="mb-3">
          Create stacked navs by changing the flex item direction with the <code>.flex-column</code> class, or your own
          css. You can even use the responsive versions to stack in some viewports but not others (e.g.{' '}
          <code>.flex-sm-column</code>).
        </p>
        <div className="example">
          <VerticalExample />
        </div>
        <CodePreview code={verticalExampleCode} language="javascript" />

        <hr />

        <h4 id="tabs">Tabs</h4>
        <p className="mb-3">
          Visually represent nav items as "tabs". This style pairs nicely with tabbable regions created by our{' '}
          <Link to="/ui-components/tabs">Tab components</Link>.
        </p>
        <div className="example">
          <TabsExample />
        </div>
        <CodePreview code={tabsExampleCode} language="javascript" />

        <hr />

        <h4 id="pills">Pills</h4>
        <div className="example">
          <PillsExample />
        </div>
        <CodePreview code={PillsExampleCode} language="javascript" />

        <hr />

        <h4 id="underline">Underline</h4>
        <div className="example">
          <UnderlineExample />
        </div>
        <CodePreview code={underlineExampleCode} language="javascript" />

        <hr />

        <h4 id="fill">Fill and justify</h4>
        <p className="mb-3">
          Force the contents of your nav to extend the full available width. To proportionately fill the space use{' '}
          <code>fill</code>. Notice that the nav is the entire width but each nav item is a different size.
        </p>
        <div className="example">
          <FillExample />
        </div>
        <CodePreview code={fillExampleCode} language="javascript" />

        <p className="mb-3">
          If you want each NavItem to be the same size use <code>justify</code>.
        </p>
        <div className="example">
          <JustifiedExample />
        </div>
        <CodePreview code={justifiedExampleCode} language="javascript" />

        <hr />

        <h4 id="dropdown">With dropdown</h4>
        <p className="mb-3">
          Use <code>&lt;NavDropdown&gt;</code>.
        </p>
        <div className="example">
          <NavDropdownExample />
        </div>
        <CodePreview code={navDropdownExampleCode} language="javascript" />
      </Col>

      <Col xl={2} className="content-nav-wrapper">
        <ul className="nav content-nav d-flex flex-column">
          <li className="nav-item">
            <a href="#default" className="nav-link">
              Basic example
            </a>
          </li>
          <li className="nav-item">
            <a href="#alignment" className="nav-link">
              Horizontal alignment
            </a>
          </li>
          <li className="nav-item">
            <a href="#vertical" className="nav-link">
              Vertical
            </a>
          </li>
          <li className="nav-item">
            <a href="#tabs" className="nav-link">
              Tabs
            </a>
          </li>
          <li className="nav-item">
            <a href="#pills" className="nav-link">
              Pills
            </a>
          </li>
          <li className="nav-item">
            <a href="#underline" className="nav-link">
              Underline
            </a>
          </li>
          <li className="nav-item">
            <a href="#fill" className="nav-link">
              Fill and justify
            </a>
          </li>
          <li className="nav-item">
            <a href="#dropdown" className="nav-link">
              With dropdown
            </a>
          </li>
        </ul>
      </Col>
    </Row>
  );
};

export default NavPage;
