import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import BasicExample from './components/Basic';
import TitleAndIconExample from './components/TitleAndIcon';
import DraggableExample from './components/Draggable';
import ToastExample from './components/Toast';
import CustomHtmlExample from './components/CustomHtml';
import ConfirmDialogExample from './components/ConfirmDialog';
import CustomPositionExample from './components/CustomPosition';
import AjaxRequestExample from './components/AjaxRequest';
import TimerMessageExample from './components/TimerMessage';

const SweetAlertPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced UI
        </Breadcrumb.Item>
        <Breadcrumb.Item active>SweetAlert</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>sweetalert2-react-content</Card.Title>
              <p className="text-secondary">
                A beautiful, responsive, and highly customizable popup library for beautiful alert messages. Read the
                Official{' '}
                <a href="https://sweetalert2.github.io/" target="_blank" rel="noopener noreferrer">
                  Sweetalert2{' '}
                </a>
                and{' '}
                <a href="https://github.com/sweetalert2/sweetalert2-react-content" target="_blank" rel="noopener noreferrer">
                  Sweetalert2-react-content{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Basic Alert</Card.Title>
              <BasicExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Title and Icon</Card.Title>
              <TitleAndIconExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Toast</Card.Title>
              <ToastExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Draggable</Card.Title>
              <DraggableExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Custom HTML</Card.Title>
              <CustomHtmlExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Confirm Dialog</Card.Title>
              <ConfirmDialogExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Custom Position</Card.Title>
              <CustomPositionExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Ajax Request</Card.Title>
              <AjaxRequestExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body className="d-flex flex-column align-items-center">
              <Card.Title>Timer Message</Card.Title>
              <TimerMessageExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default SweetAlertPage;
