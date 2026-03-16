import React from 'react';
import { Button, Card } from 'react-bootstrap';
import { UserPlus } from 'lucide-react';
import { getUrl } from '@/utils/getUrl';

const suggestions = [
  {
    name: 'Sarah Johnson',
    title: 'UI/UX Designer',
    friends: '8 Mutual Friends',
    avatar: '/images/faces/face.webp',
  },
  {
    name: 'David Chen',
    title: 'Full Stack Developer',
    friends: '15 Mutual Friends',
    avatar: '/images/faces/face.webp',
  },
  {
    name: 'Emily Parker',
    title: 'Product Manager',
    friends: '23 Mutual Friends',
    avatar: '/images/faces/face.webp',
  },
  {
    name: 'Michael Rodriguez',
    title: 'Frontend Developer',
    friends: '11 Mutual Friends',
    avatar: '/images/faces/face.webp',
  },
  {
    name: 'Jessica Lee',
    title: 'UX Researcher',
    friends: '19 Mutual Friends',
    avatar: '/images/faces/face.webp',
  },
  {
    name: 'Mike Popescu',
    title: 'Frontend Developer',
    friends: '23 Mutual Friends',
    avatar: '/images/faces/face.webp',
  },
];

const ProfileSuggestions = () => (
  <Card>
    <Card.Body>
      <Card.Title>suggestions for you</Card.Title>
      {suggestions.map((s, idx) => (
        <div
          className={`d-flex justify-content-between mb-2 pb-2${idx < suggestions.length - 1 ? ' border-bottom' : ''}`}
          key={idx}
        >
          <div className="d-flex align-items-center hover-pointer">
            <img className="img-xs rounded-circle" src={getUrl(s.avatar)} alt="" />
            <div className="ms-2">
              <p>{s.name}</p>
              <p className="fs-11px text-secondary">
                {s.title} <br /> {s.friends}
              </p>
            </div>
          </div>
          <Button variant="link" className="btn-icon">
            <UserPlus />
          </Button>
        </div>
      ))}
    </Card.Body>
  </Card>
);

export default React.memo(ProfileSuggestions);
