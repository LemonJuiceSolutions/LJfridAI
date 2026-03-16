import React from 'react';
import { Button, Card, Dropdown } from 'react-bootstrap';
import { MoreHorizontal, Edit2, GitBranch, Eye, Github, Twitter, Instagram } from 'lucide-react';

const ProfileAbout = () => (
  <Card>
    <Card.Body>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <Card.Title className="mb-0">About</Card.Title>
        <Dropdown>
          <Dropdown.Toggle as="a" id="custom-toggler" className="no-toggle-icon">
            <MoreHorizontal className="text-secondary icon-md" />
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item href="#/">
              <Edit2 className="icon-sm me-2" /> Edit
            </Dropdown.Item>
            <Dropdown.Item href="#/">
              <GitBranch className="icon-sm me-2" /> Update
            </Dropdown.Item>
            <Dropdown.Item href="#/">
              <Eye className="icon-sm me-2" /> View all
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
      <p>Hi! I'm Amiah the Senior UI Designer at NobleUI. We hope you enjoy the design and quality of Social.</p>
      <div className="mt-3">
        <label className="fs-11px fw-bolder mb-0 text-uppercase">Joined:</label>
        <p className="text-secondary">November 15, 2015</p>
      </div>
      <div className="mt-3">
        <label className="fs-11px fw-bolder mb-0 text-uppercase">Lives:</label>
        <p className="text-secondary">New York, USA</p>
      </div>
      <div className="mt-3">
        <label className="fs-11px fw-bolder mb-0 text-uppercase">Email:</label>
        <p className="text-secondary">admin&#64;nobleui.com</p>
      </div>
      <div className="mt-3">
        <label className="fs-11px fw-bolder mb-0 text-uppercase">Website:</label>
        <p className="text-secondary">https://nobleui.com</p>
      </div>
      <div className="mt-3 d-flex social-links">
        <Button variant="outline-secondary" className="btn-icon btn-xs me-2">
          <Github />
        </Button>
        <Button variant="outline-secondary" className="btn-icon btn-xs me-2">
          <Twitter />
        </Button>
        <Button variant="outline-secondary" className="btn-icon btn-xs me-2">
          <Instagram />
        </Button>
      </div>
    </Card.Body>
  </Card>
);

export default React.memo(ProfileAbout);
