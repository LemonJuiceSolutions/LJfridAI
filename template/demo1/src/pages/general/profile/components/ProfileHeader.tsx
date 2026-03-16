import React from 'react';
import { getUrl } from '@/utils/getUrl';
import { Edit } from 'lucide-react';
import { Button } from 'react-bootstrap';

const ProfileHeader = () => (
  <div className="position-relative">
    <figure className="overflow-hidden mb-0 d-flex justify-content-center">
      <img src={getUrl('/images/others/placeholder-wide.webp')} className="rounded-top" alt="profile cover" />
    </figure>
    <div className="d-flex justify-content-between align-items-center position-absolute top-90 w-100 px-2 px-md-4 mt-n4">
      <div>
        <img className="w-70px rounded-circle" src={getUrl('/images/faces/face.webp')} alt="profile" />
        <span className="h4 ms-3 text-dark">Amiah Burton</span>
      </div>
      <div className="d-none d-md-block">
        <Button variant="primary" className="btn-icon-text">
          <Edit className="me-2" /> Edit profile
        </Button>
      </div>
    </div>
  </div>
);

export default React.memo(ProfileHeader);
