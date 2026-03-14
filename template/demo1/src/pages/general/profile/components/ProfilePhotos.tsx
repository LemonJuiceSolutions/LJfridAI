import React from 'react';
import { Card, Col, Row } from 'react-bootstrap';
import { getUrl } from '@/utils/getUrl';

const photos = [
  '/images/faces/face.webp',
  '/images/faces/face.webp',
  '/images/faces/face.webp',
  '/images/faces/face.webp',
  '/images/faces/face.webp',
  '/images/faces/face.webp',
  '/images/faces/face.webp',
  '/images/faces/face.webp',
  '/images/faces/face.webp',
];

const ProfilePhotos = () => (
  <Card>
    <Card.Body>
      <Card.Title>latest photos</Card.Title>
      <Row className="ms-0 me-0">
        {photos.map((photo, idx) => (
          <Col md={4} className="ps-1 pe-1" key={idx}>
            <a href="#/">
              <figure className={idx < 6 ? 'mb-2' : 'mb-0'}>
                <img className="img-fluid rounded" src={getUrl(photo)} alt="" />
              </figure>
            </a>
          </Col>
        ))}
      </Row>
    </Card.Body>
  </Card>
);

export default React.memo(ProfilePhotos);
