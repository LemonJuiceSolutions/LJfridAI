import { Link } from 'react-router';
import { Col, Dropdown, Form, Row } from 'react-bootstrap';
import {
  AlertCircle,
  Bell,
  Calendar,
  Download,
  Edit,
  Gift,
  Layers,
  LayoutGrid,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat,
  Search,
  User,
  UserRound,
} from 'lucide-react';
import { getUrl } from '@/utils/getUrl';
import ThemeSwitcher from './ThemeSwitcher';
import { useSettings } from '@/contexts/SettingsContext';
import { useThemeMode } from '@/contexts/ThemeModeContext';
import { useNavigate } from 'react-router';

const Header = () => {
  const navigate = useNavigate();

  const onLogout = () => {
    localStorage.removeItem('token');
    navigate('/auth/login');
  };

  const { themeMode } = useThemeMode();
  const { isSidebarFolded, toggleSidebar, toggleMobileSidebar } = useSettings();

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <a className="sidebar-toggler" onClick={toggleSidebar}>
          {isSidebarFolded ? <PanelLeftOpen /> : <PanelLeftClose />}
        </a>

        <div className="logo-mini-wrapper">
          <img
            src={themeMode === 'light' ? getUrl('/images/logo-mini-light.png') : getUrl('/images/logo-mini-dark.png')}
            className="h-25px"
            alt="logo"
          />
        </div>

        <form className="search-form">
          <div className="input-group">
            <div className="input-group-text">
              <Search />
            </div>
            <Form.Control type="text" className="ps-2" id="navbarForm" placeholder="Search here..." />
          </div>
        </form>

        <ul className="navbar-nav">
          <li className="nav-item">
            <ThemeSwitcher />
          </li>
          <li className="nav-item">
            <Dropdown>
              <Dropdown.Toggle className="nav-link">
                <img src={getUrl('/images/flags/us.svg')} className="w-20px" title="us" alt="us" />
                <span className="ms-2 d-none d-md-inline-block">English</span>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item className="py-2 d-flex">
                  <img src={getUrl('/images/flags/us.svg')} className="w-20px me-1" title="us" alt="us" />
                  <span className="ms-2"> English </span>
                </Dropdown.Item>
                <Dropdown.Item>
                  <img src={getUrl('/images/flags/fr.svg')} className="w-20px me-1" title="fr" alt="fr" />
                  <span className="ms-2"> French </span>
                </Dropdown.Item>
                <Dropdown.Item>
                  <img src={getUrl('/images/flags/de.svg')} className="w-20px me-1" title="de" alt="de" />
                  <span className="ms-2"> German </span>
                </Dropdown.Item>
                <Dropdown.Item>
                  <img src={getUrl('/images/flags/pt.svg')} className="w-20px me-1" title="pt" alt="pt" />
                  <span className="ms-2"> Portuguese </span>
                </Dropdown.Item>
                <Dropdown.Item>
                  <img src={getUrl('/images/flags/es.svg')} className="w-20px me-1" title="es" alt="es" />
                  <span className="ms-2"> Spanish </span>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </li>
          <li className="nav-item">
            <Dropdown>
              <Dropdown.Toggle className="nav-link">
                <LayoutGrid className="link-icon" />
              </Dropdown.Toggle>
              <Dropdown.Menu className="px-0">
                <div className="px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                  <p className="mb-0 fw-bold">Web Apps</p>
                  <a href="#/" className="text-secondary">
                    Edit
                  </a>
                </div>
                <Row className="g-0 p-1">
                  <Col xs={3} className="text-center">
                    <Dropdown.Item
                      as={Link}
                      to="/apps/chat"
                      className="d-flex flex-column align-items-center justify-content-center w-70px h-70px"
                    >
                      <MessageSquare className="icon-lg mb-1" />
                      <p className="fs-12px">Chat</p>
                    </Dropdown.Item>
                  </Col>
                  <Col xs={3} className="text-center">
                    <Dropdown.Item
                      as={Link}
                      to="/apps/calendar"
                      className="d-flex flex-column align-items-center justify-content-center w-70px h-70px"
                    >
                      <Calendar className="icon-lg mb-1" />
                      <p className="fs-12px">Calendar</p>
                    </Dropdown.Item>
                  </Col>
                  <Col xs={3} className="text-center">
                    <Dropdown.Item
                      as={Link}
                      to="/apps/email/inbox"
                      className="d-flex flex-column align-items-center justify-content-center w-70px h-70px"
                    >
                      <Mail className="icon-lg mb-1" />
                      <p className="fs-12px">Email</p>
                    </Dropdown.Item>
                  </Col>
                  <Col xs={3} className="text-center">
                    <Dropdown.Item
                      as={Link}
                      to="/general/profile"
                      className="d-flex flex-column align-items-center justify-content-center w-70px h-70px"
                    >
                      <UserRound className="icon-lg mb-1" />
                      <p className="fs-12px">Profile</p>
                    </Dropdown.Item>
                  </Col>
                </Row>
                <div className="px-3 py-2 d-flex align-items-center justify-content-center border-top">
                  <a href="#/">View all</a>
                </div>
              </Dropdown.Menu>
            </Dropdown>
          </li>
          <li className="nav-item">
            <Dropdown>
              <Dropdown.Toggle className="nav-link">
                <Mail className="link-icon" />
              </Dropdown.Toggle>
              <Dropdown.Menu className="px-0">
                <div className="px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                  <p>9 New Messages</p>
                  <a href="#/" className="text-secondary">
                    Clear all
                  </a>
                </div>
                <div className="p-1">
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="me-3">
                      <img
                        className="w-30px h-30px rounded-circle"
                        src={getUrl('/images/faces/face.webp')}
                        alt="user"
                      />
                    </div>
                    <div className="d-flex justify-content-between flex-grow-1">
                      <div className="me-4">
                        <p>Leonardo Payne</p>
                        <p className="fs-12px text-secondary">Project status</p>
                      </div>
                      <p className="fs-12px text-secondary">2 min ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="me-3">
                      <img
                        className="w-30px h-30px rounded-circle"
                        src={getUrl('/images/faces/face.webp')}
                        alt="user"
                      />
                    </div>
                    <div className="d-flex justify-content-between flex-grow-1">
                      <div className="me-4">
                        <p>Carl Henson</p>
                        <p className="fs-12px text-secondary">Client meeting</p>
                      </div>
                      <p className="fs-12px text-secondary">30 min ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="me-3">
                      <img
                        className="w-30px h-30px rounded-circle"
                        src={getUrl('/images/faces/face.webp')}
                        alt="user"
                      />
                    </div>
                    <div className="d-flex justify-content-between flex-grow-1">
                      <div className="me-4">
                        <p>Jensen Combs</p>
                        <p className="fs-12px text-secondary">Project updates</p>
                      </div>
                      <p className="fs-12px text-secondary">1 hrs ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="me-3">
                      <img
                        className="w-30px h-30px rounded-circle"
                        src={getUrl('/images/faces/face.webp')}
                        alt="user"
                      />
                    </div>
                    <div className="d-flex justify-content-between flex-grow-1">
                      <div className="me-4">
                        <p>Amiah Burton</p>
                        <p className="fs-12px text-secondary">Project deatline</p>
                      </div>
                      <p className="fs-12px text-secondary">2 hrs ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="me-3">
                      <img
                        className="w-30px h-30px rounded-circle"
                        src={getUrl('/images/faces/face.webp')}
                        alt="user"
                      />
                    </div>
                    <div className="d-flex justify-content-between flex-grow-1">
                      <div className="me-4">
                        <p>Yaretzi Mayo</p>
                        <p className="fs-12px text-secondary">New record</p>
                      </div>
                      <p className="fs-12px text-secondary">5 hrs ago</p>
                    </div>
                  </Dropdown.Item>
                </div>
                <div className="px-3 py-2 d-flex align-items-center justify-content-center border-top">
                  <Link to="/apps/email/inbox">View all</Link>
                </div>
              </Dropdown.Menu>
            </Dropdown>
          </li>
          <li className="nav-item">
            <Dropdown>
              <Dropdown.Toggle className="nav-link">
                <Bell className="link-icon" />
                <div className="indicator">
                  <div className="circle"></div>
                </div>
              </Dropdown.Toggle>
              <Dropdown.Menu className="px-0">
                <div className="px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                  <p>6 New Notifications</p>
                  <a href="#/" className="text-secondary">
                    Clear all
                  </a>
                </div>
                <div className="p-1">
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="w-30px h-30px d-flex align-items-center justify-content-center bg-primary rounded-circle me-3">
                      <Gift className="icon-sm text-white" />
                    </div>
                    <div className="flex-grow-1 me-2">
                      <p>New Order Recieved</p>
                      <p className="fs-12px text-secondary">30 min ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="w-30px h-30px d-flex align-items-center justify-content-center bg-primary rounded-circle me-3">
                      <AlertCircle className="icon-sm text-white" />
                    </div>
                    <div className="flex-grow-1 me-2">
                      <p>Server Limit Reached!</p>
                      <p className="fs-12px text-secondary">1 hrs ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="w-30px h-30px d-flex align-items-center justify-content-center bg-primary rounded-circle me-3">
                      <img
                        className="w-30px h-30px rounded-circle"
                        src={getUrl('/images/faces/face.webp')}
                        alt="userr"
                      />
                    </div>
                    <div className="flex-grow-1 me-2">
                      <p>New customer registered</p>
                      <p className="fs-12px text-secondary">2 sec ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="w-30px h-30px d-flex align-items-center justify-content-center bg-primary rounded-circle me-3">
                      <Layers className="icon-sm text-white" />
                    </div>
                    <div className="flex-grow-1 me-2">
                      <p>Apps are ready for update</p>
                      <p className="fs-12px text-secondary">5 hrs ago</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item className="d-flex align-items-center py-2">
                    <div className="w-30px h-30px d-flex align-items-center justify-content-center bg-primary rounded-circle me-3">
                      <Download className="icon-sm text-white" />
                    </div>
                    <div className="flex-grow-1 me-2">
                      <p>Download completed</p>
                      <p className="fs-12px text-secondary">6 hrs ago</p>
                    </div>
                  </Dropdown.Item>
                </div>
                <div className="px-3 py-2 d-flex align-items-center justify-content-center border-top">
                  <a href="#/">View all</a>
                </div>
              </Dropdown.Menu>
            </Dropdown>
          </li>
          <li className="nav-item">
            <Dropdown>
              <Dropdown.Toggle className="nav-link">
                <img
                  className="w-30px h-30px ms-1 rounded-circle"
                  src={getUrl('/images/faces/face.webp')}
                  alt="profile"
                />
              </Dropdown.Toggle>
              <Dropdown.Menu className="px-0">
                <div className="d-flex flex-column align-items-center border-bottom px-5 py-3">
                  <div className="mb-3">
                    <img className="w-80px h-80px rounded-circle" src={getUrl('/images/faces/face.webp')} alt="" />
                  </div>
                  <div className="text-center">
                    <p className="fs-16px fw-bolder">Amiah Burton</p>
                    <p className="fs-12px text-secondary">amiahburton&#64;gmail.com</p>
                  </div>
                </div>
                <ul className="list-unstyled p-1">
                  <li>
                    <Dropdown.Item as={Link} to="/general/profile" className="py-2 d-flex ms-0">
                      <User className="me-2 icon-md" />
                      <span>Profile</span>
                    </Dropdown.Item>
                  </li>
                  <li>
                    <a href="#/" className="dropdown-item py-2 d-flex ms-0">
                      <Edit className="me-2 icon-md" />
                      <span>Edit Profile</span>
                    </a>
                  </li>
                  <li>
                    <a href="#/" className="dropdown-item py-2 d-flex ms-0">
                      <Repeat className="me-2 icon-md" />
                      <span>Switch User</span>
                    </a>
                  </li>
                  <li>
                    <a href="#/" onClick={onLogout} className="dropdown-item py-2 d-flex ms-0">
                      <LogOut className="me-2 icon-md" />
                      <span>Log Out</span>
                    </a>
                  </li>
                </ul>
              </Dropdown.Menu>
            </Dropdown>
          </li>
        </ul>

        <a className="sidebar-toggler-mobile" onClick={toggleMobileSidebar}>
          <Menu />
        </a>
      </div>
    </nav>
  );
};

export default Header;
