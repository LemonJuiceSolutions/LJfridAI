import { Breadcrumb, Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import ImageCropperExample from './components/ImageCropper';

const ImageCropperPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced UI
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Image Cropper</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React-Easy-Crop</Card.Title>
              <p className="text-secondary">
                Read the{' '}
                <a href="https://github.com/ValentinH/react-easy-crop" target="_blank" rel="noopener noreferrer">
                  Official React-Easy-Crop Documentation{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={12} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Example</Card.Title>
              <ImageCropperExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default ImageCropperPage;
