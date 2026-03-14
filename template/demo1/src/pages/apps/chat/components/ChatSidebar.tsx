import { Aperture, Edit2, Eye, MessageSquare, PhoneCall, Search, Settings, Users } from 'lucide-react';
import { Dropdown, Form, InputGroup, Tab, Tabs } from 'react-bootstrap';
import { getUrl } from '@/utils/getUrl';
import ChatTabContent from './ChatTabContent';

const ChatSidebar = () => {
  return (
    <div className="aside-content">
      <div className="aside-header">
        <div className="d-flex justify-content-between align-items-center pb-2 mb-2">
          <div className="d-flex align-items-center">
            <figure className="me-2 mb-0">
              <img src={getUrl('/images/faces/face.webp')} className="img-sm rounded-circle" alt="profile" />
              <div className="status online"></div>
            </figure>
            <div>
              <h6>Amiah Burton</h6>
              <p className="text-secondary fs-13px">Software Developer</p>
            </div>
          </div>
          <Dropdown>
            <Dropdown.Toggle as="a" id="dropdownMenuButton" className="no-toggle-icon">
              <Settings className="icon-lg text-secondary pb-3px" />
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item href="#/">
                <Eye className="icon-sm me-2" /> <span className="">View Profile</span>
              </Dropdown.Item>
              <Dropdown.Item href="#/">
                <Edit2 className="icon-sm me-2" /> <span className="">Edit Profile</span>
              </Dropdown.Item>
              <Dropdown.Item href="#/">
                <Aperture className="icon-sm me-2" /> <span className="">Add status</span>
              </Dropdown.Item>
              <Dropdown.Item href="#/">
                <Settings className="icon-sm me-2" /> <span className="">Settings</span>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
        <Form>
          <InputGroup className="mb-3">
            <Form.Control placeholder="Search here..." aria-label="Search text" aria-describedby="chat-search" />
            <InputGroup.Text className="bg-transparent" id="chat-search">
              <Search className="cursor-pointer" />
            </InputGroup.Text>
          </InputGroup>
        </Form>
      </div>
      <div className="aside-body">
        <Tabs defaultActiveKey="chats" id="uncontrolled-tab-example" className="mt-3 mb-3" justify>
          <Tab
            eventKey="chats"
            title={
              <div className="d-flex flex-row flex-lg-column flex-xl-row align-items-center justify-content-center">
                <MessageSquare className="icon-sm me-sm-2 me-lg-0 me-xl-2 mb-md-1 mb-xl-0" />
                <p className="d-none d-sm-block d-lg-none d-xxl-block">Chats</p>
              </div>
            }
          >
            <ChatTabContent type="chats" />
          </Tab>

          <Tab
            eventKey="calls"
            title={
              <div className="d-flex flex-row flex-lg-column flex-xl-row align-items-center justify-content-center">
                <PhoneCall className="icon-sm me-sm-2 me-lg-0 me-xl-2 mb-md-1 mb-xl-0" />
                <p className="d-none d-sm-block d-lg-none d-xxl-block">Calls</p>
              </div>
            }
          >
            <ChatTabContent type="calls" />
          </Tab>

          <Tab
            eventKey="contacts"
            title={
              <div className="d-flex flex-row flex-lg-column flex-xl-row align-items-center justify-content-center">
                <Users className="icon-sm me-sm-2 me-lg-0 me-xl-2 mb-md-1 mb-xl-0" />
                <p className="d-none d-sm-block d-lg-none d-xxl-block">Contacts</p>
              </div>
            }
          >
            <ChatTabContent type="contacts" />
          </Tab>
        </Tabs>
      </div>
    </div>
  );
};

export default ChatSidebar;
