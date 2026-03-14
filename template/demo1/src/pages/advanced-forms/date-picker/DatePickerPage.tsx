import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import BasicExample from './components/Basic';
import RangeExample from './components/Range';
import InlineExample from './components/Inline';
import InlineRangeExample from './components/InlineRange';

const DatePickerPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced Forms
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Datepicker</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React Day Picker</Card.Title>
              <p className="text-secondary">
                A customizable date picker component for React. Add date pickers, calendars, and date inputs to your web
                applications. Read the Official{' '}
                <a href="https://github.com/gpbl/react-day-picker" target="_blank" rel="noopener noreferrer">
                  React Day Picker{' '}
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
              <BasicExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Date Range Picker</Card.Title>
              <RangeExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin grid-margin-md-0 stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Inline</Card.Title>
              <div className="d-flex justify-content-center">
                <InlineExample />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Inline Range Picker</Card.Title>
              <div className="d-flex justify-content-center">
                <InlineRangeExample />
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default DatePickerPage;
