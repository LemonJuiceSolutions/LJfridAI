import { Briefcase, ChevronDown, File, Inbox, Mail, Star, Tag, Trash } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Col, Collapse, Nav, Row } from 'react-bootstrap';
import { Link, Outlet, useLocation } from 'react-router';
import { getUnreadCount, getStarredEmails } from '@/mock/emailsData';

const EmailLayout = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Get dynamic counts
  const unreadCount = getUnreadCount();
  const starredCount = getStarredEmails().length;

  return (
    <Row className="inbox-wrapper">
      <Col lg={12}>
        <Card>
          <Card.Body>
            <Row>
              <Col lg={3} xxl={2} className="border-end-lg">
                <div className="d-flex align-items-center justify-content-between">
                  <Button
                    variant="outline-secondary"
                    className="navbar-toggle btn-icon d-block d-lg-none"
                    aria-controls="email-aside-nav"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                  >
                    <span className="icon">
                      <ChevronDown />
                    </span>
                  </Button>
                  <div className="order-first">
                    <h4>Mail Service</h4>
                    <p className="text-secondary">amiahburton@gmail.com</p>
                  </div>
                </div>
                <Link to="/apps/email/compose" className="d-grid my-3">
                  <Button variant="primary">Compose Email</Button>
                </Link>
                <Collapse in={open}>
                  <div className="email-aside-nav" id="email-aside-nav">
                    <Nav className="flex-column">
                      <Nav.Item className={`${location.pathname === '/apps/email/inbox' ? 'active' : ''}`}>
                        <Nav.Link as={Link} to="/apps/email/inbox" className="d-flex align-items-center">
                          <Inbox className="icon-lg me-2" />
                          Inbox
                          <Badge bg="danger" pill className="fw-bolder ms-auto">
                            {unreadCount}
                          </Badge>
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item className={`${location.pathname === '/apps/email/sent' ? 'active' : ''}`}>
                        <Nav.Link className="d-flex align-items-center">
                          <Mail className="icon-lg me-2" />
                          Sent
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item className={`${location.pathname === '/apps/email/important' ? 'active' : ''}`}>
                        <Nav.Link className="d-flex align-items-center">
                          <Briefcase className="icon-lg me-2" />
                          Important
                          <Badge bg="secondary" pill className="fw-bolder ms-auto">
                            {starredCount}
                          </Badge>
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item className={`${location.pathname === '/apps/email/drafts' ? 'active' : ''}`}>
                        <Nav.Link className="d-flex align-items-center">
                          <File className="icon-lg me-2" />
                          Drafts
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item className={`${location.pathname === '/apps/email/tags' ? 'active' : ''}`}>
                        <Nav.Link className="d-flex align-items-center">
                          <Star className="icon-lg me-2" />
                          Tags
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item className={`${location.pathname === '/apps/email/spam' ? 'active' : ''}`}>
                        <Nav.Link className="d-flex align-items-center">
                          <Tag className="icon-lg me-2" />
                          Spam
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item className={`${location.pathname === '/apps/email/trash' ? 'active' : ''}`}>
                        <Nav.Link className="d-flex align-items-center">
                          <Trash className="icon-lg me-2" />
                          Trash
                        </Nav.Link>
                      </Nav.Item>
                    </Nav>
                    <p className="text-secondary fs-12px fw-bolder text-uppercase mb-2 mt-4">Labels</p>
                    <Nav className="nav flex-column">
                      <Nav.Item>
                        <Nav.Link className="d-flex align-items-center">
                          <Tag className="text-warning icon-lg me-2" />
                          Important
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link className="d-flex align-items-center">
                          <Tag className="text-primary icon-lg me-2" />
                          Business
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link className="d-flex align-items-center">
                          <Tag className="text-info icon-lg me-2" />
                          Inspiration
                        </Nav.Link>
                      </Nav.Item>
                    </Nav>
                  </div>
                </Collapse>
              </Col>
              <Col lg={9} xxl={10}>
                <Outlet />
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default EmailLayout;
