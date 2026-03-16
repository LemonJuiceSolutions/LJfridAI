import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import BasicExample from './components/Basic';
import CustomComponentExample from './components/CustomComponent';
import GroupedExample from './components/Grouped';
import MultipleExample from './components/Multiple';
import AnimationExample from './components/Animation';
import FixedOptionsExample from './components/FixedOptions';
import AsyncExample from './components/Async';
import CreatableExample from './components/Creatable';

const SelectPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced Forms
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Search Select</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React Select</Card.Title>
              <p className="text-secondary">
                A flexible and beautiful Select Input control with multiselect, autocomplete, async and creatable
                support. Read the Official{' '}
                <a href="https://github.com/jedwatson/react-select" target="_blank" rel="noopener noreferrer">
                  React Select{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Basic</Card.Title>
              <p className="text-secondary mb-2">Basic example reat-select</p>
              <BasicExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Custom Component</Card.Title>
              <p className="text-secondary mb-2">
                Custom styled select component with enhanced UI and formatting options
              </p>
              <CustomComponentExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Grouped</Card.Title>
              <p className="text-secondary mb-2">
                Options organized in categories with group headers for better organization
              </p>
              <GroupedExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Multiple</Card.Title>
              <p className="text-secondary mb-2">
                Multi-select dropdown allowing users to choose multiple options simultaneously
              </p>
              <MultipleExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Animation</Card.Title>
              <p className="text-secondary mb-2">
                Smooth transitions and animated effects for enhanced user experience
              </p>
              <AnimationExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Fixed Options</Card.Title>
              <p className="text-secondary mb-2">Selected options that are locked and cannot be removed by users</p>
              <FixedOptionsExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Async</Card.Title>
              <p className="text-secondary mb-2">
                Use the Async component to load options from a remote source as the user types
              </p>
              <AsyncExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Creatable</Card.Title>
              <p className="text-secondary mb-2">
                Allow users to create new options by typing directly into the dropdown
              </p>
              <CreatableExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default SelectPage;
