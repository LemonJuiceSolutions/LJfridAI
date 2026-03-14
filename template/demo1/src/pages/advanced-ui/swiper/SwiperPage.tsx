import { Breadcrumb, Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import DefaultExample from './components/DefaultExample';
import NavigationExample from './components/NavigationExample';
import PaginationExample from './components/PaginationExample';
import EffectCoverflowExample from './components/EffectCoverflowExample';
import AutoPlayExample from './components/AutoPlayExample';
import ThumbsGalleryExample from './components/ThumbsGalleryExample';
import ParallaxExample from './components/ParallaxExample';
import EffectCardsExample from './components/EffectCards';

const SwiperPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Advanced UI
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Swiper</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Swiper</Card.Title>
              <p className="text-secondary">
                Read the{' '}
                <a href="https://github.com/nolimits4web/swiper" target="_blank" rel="noopener noreferrer">
                  Official Swiper Documentation{' '}
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
              <Card.Title>Default</Card.Title>
              <DefaultExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Navigation</Card.Title>
              <NavigationExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Pagination</Card.Title>
              <PaginationExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Autoplay</Card.Title>
              <AutoPlayExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Parallax</Card.Title>
              <ParallaxExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Effect coverflow</Card.Title>
              <EffectCoverflowExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={5} xl={6} className="grid-margin grid-margin-md-0 stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Effect cards</Card.Title>
              <EffectCardsExample />
            </Card.Body>
          </Card>
        </Col>

        <Col md={7} xl={6} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Thumbs Gallery</Card.Title>
              <ThumbsGalleryExample />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default SwiperPage;
