import React from 'react';
import { Columns, UserIcon, Users, ImageIcon, Video } from 'lucide-react';
import { Link } from 'react-router';

const ProfileNav = () => (
  <div className="d-flex justify-content-center p-3 rounded-bottom">
    <ul className="d-flex align-items-center m-0 p-0">
      <li className="d-flex align-items-center active">
        <Columns className="me-1 icon-md text-primary"></Columns>
        <Link className="pt-1px d-none d-md-block text-primary" to=".">
          Timeline
        </Link>
      </li>
      <li className="ms-3 ps-3 border-start d-flex align-items-center">
        <UserIcon className="me-1 icon-md"></UserIcon>
        <Link className="pt-1px d-none d-md-block text-body" to=".">
          About
        </Link>
      </li>
      <li className="ms-3 ps-3 border-start d-flex align-items-center">
        <Users className="me-1 icon-md"></Users>
        <Link className="pt-1px d-none d-md-block text-body" to=".">
          Friends <span className="text-secondary fs-12px">3,765</span>
        </Link>
      </li>
      <li className="ms-3 ps-3 border-start d-flex align-items-center">
        <ImageIcon className="me-1 icon-md"></ImageIcon>
        <Link className="pt-1px d-none d-md-block text-body" to=".">
          Photos
        </Link>
      </li>
      <li className="ms-3 ps-3 border-start d-flex align-items-center">
        <Video className="me-1 icon-md"></Video>
        <Link className="pt-1px d-none d-md-block text-body" to=".">
          Videos
        </Link>
      </li>
    </ul>
  </div>
);

export default React.memo(ProfileNav);
