import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import ColorfulExample from './components/Colorful';
import SliderExample from './components/Slider';
import SketchExample from './components/Sketch';
import BlockExample from './components/Block';
import CircleExample from './components/Circle';
import CompactExample from './components/Compact';
import WheelExample from './components/Wheel';
import GithubExample from './components/Github';
import ChromeExample from './components/Chrome';
import PopoverExample from './components/Popover';

const ColorPickerPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced Forms
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Color Picker</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React Color</Card.Title>
              <p className="text-secondary">
                A tiny color picker widget component for React apps. Read the Official{' '}
                <a href="https://github.com/uiwjs/react-color" target="_blank" rel="noopener noreferrer">
                  React Color{' '}
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
              <Card.Title>Slider</Card.Title>
              <SliderExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Color Picker in a Popover</Card.Title>
              <PopoverExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Colorful</Card.Title>
              <ColorfulExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Sketch</Card.Title>
              <SketchExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Circle</Card.Title>
              <CircleExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Compact</Card.Title>
              <CompactExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Block</Card.Title>
              <BlockExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Wheel</Card.Title>
              <WheelExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin grid-margin-md-0 stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Github</Card.Title>
              <GithubExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Chrome</Card.Title>
              <ChromeExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default ColorPickerPage;
