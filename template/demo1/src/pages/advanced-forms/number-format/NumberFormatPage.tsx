import { Breadcrumb, Row, Col, Card, Form } from 'react-bootstrap';
import { Link } from 'react-router';
import DateExample from './components/Date';
import TimeExample from './components/Time';
import PrefixExample from './components/Prefix';
import SuffixExample from './components/Suffix';
import ThousandSeperatorExample from './components/ThousandSeperator';
import MaxLimitExample from './components/MaxLimit';
import PhoneNumberExample from './components/PhoneNumber';
import FixedDecimalScaleExample from './components/FixedDecimalScale';

const NumberFormatPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced Forms
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Number Format</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React Number Format</Card.Title>
              <p className="text-secondary">
                React component to format numbers in an input or as a text. Read the Official{' '}
                <a href="https://github.com/s-yadav/react-number-format" target="_blank" rel="noopener noreferrer">
                  React Number Format{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={12} className="stretch-card">
          <Card>
            <Card.Body>
              <Form as={Row}>
                <Form.Group as={Col} md={6} className="mb-3" controlId="date-input">
                  <Form.Label>Date</Form.Label>
                  <DateExample />
                </Form.Group>

                <Form.Group as={Col} md={6} className="mb-3" controlId="time-input">
                  <Form.Label>Time</Form.Label>
                  <TimeExample />
                </Form.Group>

                <Form.Group as={Col} md={6} className="mb-3" controlId="prefix-input">
                  <Form.Label>Prefix</Form.Label>
                  <PrefixExample />
                </Form.Group>

                <Form.Group as={Col} md={6} className="mb-3" controlId="suffix-input">
                  <Form.Label>Suffix</Form.Label>
                  <SuffixExample />
                </Form.Group>

                <Form.Group as={Col} md={6} className="mb-3" controlId="thousand-separator-input">
                  <Form.Label>Thousand Separator</Form.Label>
                  <ThousandSeperatorExample />
                </Form.Group>

                <Form.Group as={Col} md={6} className="mb-3" controlId="max-limit-input">
                  <Form.Label>Max Limit (0 - 1000)</Form.Label>
                  <MaxLimitExample />
                </Form.Group>

                <Form.Group as={Col} md={6} className="mb-3 mb-md-0" controlId="phone-number-input">
                  <Form.Label>Phone Number</Form.Label>
                  <PhoneNumberExample />
                </Form.Group>

                <Form.Group as={Col} md={6} controlId="positive-number-only-input">
                  <Form.Label>Fixed Decimal Scale</Form.Label>
                  <FixedDecimalScaleExample />
                </Form.Group>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default NumberFormatPage;
