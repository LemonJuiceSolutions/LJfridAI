import React from 'react';
import { Card, Dropdown } from 'react-bootstrap';
import { MoreHorizontal, Meh, CornerRightUp, Share2, Copy, Heart, MessageSquare, Share } from 'lucide-react';

type ProfilePostProps = {
  author: string;
  time: string;
  content: string;
  image: string;
  avatar: string;
};

const ProfilePost = ({ author, time, content, image, avatar }: ProfilePostProps) => (
  <Card>
    <Card.Header>
      <div className="d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center">
          <img className="img-xs rounded-circle" src={avatar} alt="" />
          <div className="ms-2">
            <p>{author}</p>
            <p className="fs-11px text-secondary">{time}</p>
          </div>
        </div>
        <Dropdown>
          <Dropdown.Toggle as="a" id="custom-toggler" className="no-toggle-icon">
            <MoreHorizontal className="text-secondary icon-md" />
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item href="#/">
              <Meh className="icon-sm me-2" /> Unfollow
            </Dropdown.Item>
            <Dropdown.Item href="#/">
              <CornerRightUp className="icon-sm me-2" /> Go to post
            </Dropdown.Item>
            <Dropdown.Item href="#/">
              <Share2 className="icon-sm me-2" /> Share
            </Dropdown.Item>
            <Dropdown.Item href="#/">
              <Copy className="icon-sm me-2" /> Copy link
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </Card.Header>
    <Card.Body>
      <p className="mb-3">{content}</p>
      {image && <img className="img-fluid" src={image} alt="" />}
    </Card.Body>
    <Card.Footer>
      <div className="d-flex post-actions">
        <a href="#/" className="d-flex align-items-center text-secondary me-4">
          <Heart className="icon-md" />
          <p className="d-none d-md-block ms-2">Like</p>
        </a>
        <a href="#/" className="d-flex align-items-center text-secondary me-4">
          <MessageSquare className="icon-md" />
          <p className="d-none d-md-block ms-2">Comment</p>
        </a>
        <a href="#/" className="d-flex align-items-center text-secondary">
          <Share className="icon-md" />
          <p className="d-none d-md-block ms-2">Share</p>
        </a>
      </div>
    </Card.Footer>
  </Card>
);

export default React.memo(ProfilePost);
