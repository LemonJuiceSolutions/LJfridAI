import React from 'react';
import ProfilePost from './ProfilePost';
import { getUrl } from '@/utils/getUrl';
import { Col, Row } from 'react-bootstrap';

const posts = [
  {
    author: 'Mike Popescu',
    time: '1 min ago',
    content:
      'Life is full of challenges, experiences, and lessons to learn. Embrace each moment, stay curious, and grow through every opportunity.',
    image: getUrl('/images/photos/img.webp'),
    avatar: getUrl('/images/faces/face.webp'),
  },
  {
    author: 'Mike Popescu',
    time: '5 min ago',
    content:
      'The world around us is constantly changing, full of wonders and surprises. Take time to explore, appreciate the little things, and stay open to new ideas.',
    image: getUrl('/images/photos/img.webp'),
    avatar: getUrl('/images/faces/face.webp'),
  },
];

const ProfilePostsList = () => (
  <Row>
    {posts.map((post, idx) => (
      <Col md={12} className="grid-margin" key={idx}>
        <ProfilePost {...post} />
      </Col>
    ))}
  </Row>
);

export default React.memo(ProfilePostsList);
