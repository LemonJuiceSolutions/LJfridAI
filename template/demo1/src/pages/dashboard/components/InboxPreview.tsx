import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { getUrl } from '@/utils/getUrl';
const InboxPreview = () => {
  return (
    <>
      <div className="d-flex flex-column">
        <Link to="/apps/email/read" className="d-flex align-items-center border-bottom pb-3">
          <div className="me-3">
            <img src={getUrl('/images/faces/face.webp')} className="rounded-circle w-35px" alt="user" />
          </div>
          <div className="w-100">
            <div className="d-flex justify-content-between">
              <h6 className="text-body">Leonardo Payne</h6>
              <p className="text-secondary fs-12px">12.30 PM</p>
            </div>
            <p className="text-secondary fs-13px">Hey! there I'm available...</p>
          </div>
        </Link>
        <Link to="/apps/email/read" className="d-flex align-items-center border-bottom py-3">
          <div className="me-3">
            <img src={getUrl('/images/faces/face.webp')} className="rounded-circle w-35px" alt="user" />
          </div>
          <div className="w-100">
            <div className="d-flex justify-content-between">
              <h6 className="text-body">Carl Henson</h6>
              <p className="text-secondary fs-12px">02.14 AM</p>
            </div>
            <p className="text-secondary fs-13px">I've finished it! See you so..</p>
          </div>
        </Link>
        <Link to="/apps/email/read" className="d-flex align-items-center border-bottom py-3">
          <div className="me-3">
            <img src={getUrl('/images/faces/face.webp')} className="rounded-circle w-35px" alt="user" />
          </div>
          <div className="w-100">
            <div className="d-flex justify-content-between">
              <h6 className="text-body">Jensen Combs</h6>
              <p className="text-secondary fs-12px">08.22 PM</p>
            </div>
            <p className="text-secondary fs-13px">This template is awesome!</p>
          </div>
        </Link>
        <Link to="/apps/email/read" className="d-flex align-items-center border-bottom py-3">
          <div className="me-3">
            <img src={getUrl('/images/faces/face.webp')} className="rounded-circle w-35px" alt="user" />
          </div>
          <div className="w-100">
            <div className="d-flex justify-content-between">
              <h6 className="text-body">Amiah Burton</h6>
              <p className="text-secondary fs-12px">05.49 AM</p>
            </div>
            <p className="text-secondary fs-13px">Nice to meet you</p>
          </div>
        </Link>
        <Link to="/apps/email/read" className="d-flex align-items-center border-bottom py-3">
          <div className="me-3">
            <img src={getUrl('/images/faces/face.webp')} className="rounded-circle w-35px" alt="user" />
          </div>
          <div className="w-100">
            <div className="d-flex justify-content-between">
              <h6 className="text-body">Yaretzi Mayo</h6>
              <p className="text-secondary fs-12px">01.19 AM</p>
            </div>
            <p className="text-secondary fs-13px">Hey! there I'm available...</p>
          </div>
        </Link>
        <Link to="/apps/email/read" className="d-flex align-items-center border-bottom py-3">
          <div className="me-3">
            <img src={getUrl('/images/faces/face.webp')} className="rounded-circle w-35px" alt="user" />
          </div>
          <div className="w-100">
            <div className="d-flex justify-content-between">
              <h6 className="text-body">Ava Smith</h6>
              <p className="text-secondary fs-12px">01.19 AM</p>
            </div>
            <p className="text-secondary fs-13px">I've attached the quarter...</p>
          </div>
        </Link>
      </div>
      <Link to="/apps/email/inbox" className="d-block text-center mt-2 mb-n1">
        View all <ArrowRight size={14} />
      </Link>
    </>
  );
};

export default React.memo(InboxPreview);
