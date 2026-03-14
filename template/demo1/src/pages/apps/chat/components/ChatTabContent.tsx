import React from 'react';
import { ArrowDownLeft, ArrowUpRight, ImageIcon, MessageSquare, PhoneCall, Video } from 'lucide-react';
import SimpleBar from 'simplebar-react';
import { getUrl } from '@/utils/getUrl';
import { Badge } from 'react-bootstrap';

interface ChatTabContentProps {
  type: 'chats' | 'calls' | 'contacts';
}

const ChatTabContent = ({ type }: ChatTabContentProps) => {
  // Mock data arrays
  const chats = [
    {
      id: 1,
      name: 'John Doe',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'online',
      lastMessage: 'Hi, How are you?',
      time: '4:32 PM',
      unread: 5,
      type: 'text',
    },
    {
      id: 2,
      name: 'Carl Henson',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      lastMessage: 'Photo',
      time: '05:24 PM',
      unread: 3,
      type: 'photo',
    },
    {
      id: 3,
      name: 'John Doe',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      lastMessage: 'Hi, How are you?',
      time: 'Yesterday',
      unread: 0,
      type: 'text',
    },
    {
      id: 4,
      name: 'Jensen Combs',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'online',
      lastMessage: 'Video',
      time: '2 days ago',
      unread: 0,
      type: 'video',
    },
    {
      id: 5,
      name: 'Yaretzi Mayo',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      lastMessage: 'Hi, How are you?',
      time: '4 week ago',
      unread: 0,
      type: 'text',
    },
  ];

  const calls = [
    {
      id: 1,
      name: 'Jensen Combs',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'online',
      direction: 'outgoing',
      success: true,
      time: 'Today, 03:11 AM',
      type: 'phone',
    },
    {
      id: 2,
      name: 'Leonardo Payne',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      direction: 'incoming',
      success: true,
      time: 'Today, 11:41 AM',
      type: 'video',
    },
    {
      id: 3,
      name: 'Carl Henson',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      direction: 'incoming',
      success: false,
      time: 'Today, 04:24 PM',
      type: 'phone',
    },
    {
      id: 4,
      name: 'Jensen Combs',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'online',
      direction: 'incoming',
      success: false,
      time: 'Today, 12:53 AM',
      type: 'video',
    },
  ];

  const contacts = [
    {
      id: 1,
      name: 'Amiah Burton',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      role: 'Front-end Developer',
    },
    {
      id: 2,
      name: 'John Doe',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'online',
      role: 'Back-end Developer',
    },
    {
      id: 3,
      name: 'Yaretzi Mayo',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      role: 'Fullstack Developer',
    },
    {
      id: 4,
      name: 'John Doe',
      avatar: getUrl('/images/faces/face.webp'),
      status: 'offline',
      role: 'Front-end Developer',
    },
  ];

  const renderChats = () => (
    <>
      <p className="text-secondary mb-1">Recent chats</p>
      <ul className="list-unstyled chat-list px-1">
        {chats.map((chat) => (
          <li className="chat-item pe-1" key={chat.id}>
            <a href="#/" className="d-flex align-items-center">
              <figure className="mb-0 me-2">
                <img src={chat.avatar} className="img-xs rounded-circle" alt="user" />
                <div className={`status ${chat.status}`}></div>
              </figure>
              <div className="d-flex justify-content-between flex-grow-1 border-bottom">
                <div>
                  <p className={`text-body${chat.unread ? ' fw-bolder' : ''}`}>{chat.name}</p>
                  {chat.type === 'photo' ? (
                    <div className="d-flex align-items-center">
                      <ImageIcon className="text-secondary icon-md mb-2px" />
                      <p className="text-secondary ms-1">Photo</p>
                    </div>
                  ) : chat.type === 'video' ? (
                    <div className="d-flex align-items-center">
                      <Video className="text-secondary icon-md mb-2px" />
                      <p className="text-secondary ms-1">Video</p>
                    </div>
                  ) : (
                    <p className="text-secondary fs-13px">{chat.lastMessage}</p>
                  )}
                </div>
                <div className="d-flex flex-column align-items-end">
                  <p className="text-secondary fs-13px mb-1">{chat.time}</p>
                  {chat.unread ? (
                    <Badge bg="primary" pill className="ms-auto">
                      {chat.unread}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );

  const renderCalls = () => (
    <>
      <p className="text-secondary mb-1">Recent calls</p>
      <ul className="list-unstyled chat-list px-1">
        {calls.map((call) => (
          <li className="chat-item pe-1" key={call.id}>
            <a href="#/" className="d-flex align-items-center">
              <figure className="mb-0 me-2">
                <img src={call.avatar} className="img-xs rounded-circle" alt="user" />
                <div className={`status ${call.status}`}></div>
              </figure>
              <div className="d-flex align-items-center justify-content-between flex-grow-1 border-bottom">
                <div>
                  <p className="text-body">{call.name}</p>
                  <div className="d-flex align-items-center">
                    {call.direction === 'outgoing' ? (
                      <ArrowUpRight className={`icon-sm text-success me-1`} />
                    ) : (
                      <ArrowDownLeft className={`icon-sm ${call.success ? 'text-success' : 'text-danger'} me-1`} />
                    )}
                    <p className="text-secondary fs-13px">{call.time}</p>
                  </div>
                </div>
                <div className="d-flex flex-column align-items-end">
                  {call.type === 'phone' ? (
                    <PhoneCall className="text-secondary icon-md" />
                  ) : (
                    <Video className="text-secondary icon-md" />
                  )}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );

  const renderContacts = () => (
    <>
      <p className="text-secondary mb-1">Contacts</p>
      <ul className="list-unstyled chat-list px-1">
        {contacts.map((contact) => (
          <li className="chat-item pe-1" key={contact.id}>
            <a href="#/" className="d-flex align-items-center">
              <figure className="mb-0 me-2">
                <img src={contact.avatar} className="img-xs rounded-circle" alt="user" />
                <div className={`status ${contact.status}`}></div>
              </figure>
              <div className="d-flex align-items-center justify-content-between flex-grow-1 border-bottom">
                <div>
                  <p className="text-body">{contact.name}</p>
                  <div className="d-flex align-items-center">
                    <p className="text-secondary fs-13px">{contact.role}</p>
                  </div>
                </div>
                <div className="d-flex align-items-end text-body">
                  <MessageSquare className="icon-md text-secondary me-2" />
                  <PhoneCall className="icon-md text-secondary me-2" />
                  <Video className="icon-md text-secondary" />
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <SimpleBar className="h-100">
      {type === 'chats' && renderChats()}
      {type === 'calls' && renderCalls()}
      {type === 'contacts' && renderContacts()}
    </SimpleBar>
  );
};

export default React.memo(ChatTabContent);
