import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import BasicExample from './components/Basic';
import TooltipExample from './components/Tooltip';
import WizardExample from './components/Wizard';

const FormValidationPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced Forms
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Form Validation</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React Hook Form</Card.Title>
              <p className="text-secondary">
                Performant, flexible and extensible forms with easy-to-use validation. Read the Official{' '}
                <a href="https://github.com/react-hook-form/react-hook-form" target="_blank" rel="noopener noreferrer">
                  React Hook Form{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Basic Example</Card.Title>
              <BasicExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={12} className="stretch-card grid-margin">
          <Card>
            <Card.Body>
              <Card.Title>Tooltip Example</Card.Title>
              <TooltipExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={12} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Wizard Example</Card.Title>
              <WizardExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default FormValidationPage;
