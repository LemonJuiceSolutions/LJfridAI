import {
  Activity,
  BadgeCheck,
  Camera,
  CloudRain,
  Download,
  FileText,
  Gift,
  Globe,
  Headphones,
  Mail,
  Sun,
  Tag,
  Zap,
} from 'lucide-react';
import { Breadcrumb, Card, Col, Container, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router';

const IconsPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Icons
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Lucide Icons</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Lucide Icons</Card.Title>
              <p className="text-secondary mb-2">
                Experience a clean and consistent icon set with{' '}
                <a href="https://lucide.dev/" target="_blank" rel="noopener noreferrer">
                  Lucide Icons
                </a>
                .
              </p>
              <p className="text-secondary mb-3">
                Explore{' '}
                <a href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer">
                  full list of Icons
                </a>
                .
              </p>
              <Table bordered responsive className="mb-4">
                <tbody>
                  <tr>
                    <td>Example</td>
                    <td>Code</td>
                  </tr>
                  <tr>
                    <td>
                      <Gift size={30} />
                    </td>
                    <td>
                      <code>&lt;Gift size=&#123;30&#125; /&gt;</code>
                      <hr />
                      <code>
                        import &#123; Gift &#125; from 'lucide-react'; <br />
                        <br />
                        export const App = () =&gt; &#123; <br />
                        &nbsp;&nbsp;return (&lt;Gift size=&#123;30&#125; /&gt;); <br />
                        &#125;;
                      </code>
                    </td>
                  </tr>
                </tbody>
              </Table>

              <Container>
                <Row className="icons-list">
                  <Col sm={6} md={4} lg={3}>
                    <Activity /> activity
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <BadgeCheck /> badge-check
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Camera /> camera
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <CloudRain /> cloud-rain
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Download /> download
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <FileText /> file-text
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Globe /> globe
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Headphones /> headphones
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Mail /> mail
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Sun /> sun
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Tag /> tag
                  </Col>
                  <Col sm={6} md={4} lg={3}>
                    <Zap /> zap
                  </Col>
                </Row>
                <div className="mt-4 text-center">
                  <a
                    className="btn btn-primary"
                    href="https://lucide.dev/icons/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View all icons
                  </a>
                </div>
              </Container>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default IconsPage;
