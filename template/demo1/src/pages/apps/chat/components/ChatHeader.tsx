import { CornerUpLeft, PhoneCall, UserPlus, Video } from 'lucide-react';
import { getUrl } from '@/utils/getUrl';

const ChatHeader = () => {
  return (
    <div className="chat-header border-bottom pb-2">
      <div className="d-flex justify-content-between">
        <div className="d-flex align-items-center">
          <CornerUpLeft id="backToChatList" className="icon-lg me-2 ms-n2 text-secondary d-lg-none" />
          <figure className="mb-0 me-2">
            <img src={getUrl('/images/faces/face.webp')} className="img-sm rounded-circle" alt="avatar" />
            <div className="status online"></div>
          </figure>
          <div>
            <p>Mariana Zenha</p>
            <p className="text-secondary fs-13px">Front-end Developer</p>
          </div>
        </div>
        <div className="d-flex align-items-center me-n1">
          <a className="me-3" type="button">
            <Video className="icon-lg text-secondary" />
          </a>
          <a className="me-0 me-sm-3" type="button">
            <PhoneCall className="icon-lg text-secondary" />
          </a>
          <a className="d-none d-sm-block" type="button">
            <UserPlus className="icon-lg text-secondary" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
