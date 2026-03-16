import { Row, Col, Card } from 'react-bootstrap';
import ProfileHeader from './components/ProfileHeader';
import ProfileNav from './components/ProfileNav';
import ProfileAbout from './components/ProfileAbout';
import ProfilePostsList from './components/ProfilePostsList';
import ProfilePhotos from './components/ProfilePhotos';
import ProfileSuggestions from './components/ProfileSuggestions';

const ProfilePage = () => {
  return (
    <>
      <Row>
        <Col xs={12} className="grid-margin">
          <Card>
            <ProfileHeader />
            <ProfileNav />
          </Card>
        </Col>
      </Row>
      <Row className="profile-body">
        {/* left wrapper start */}
        <Col md={4} xl={3} className="d-none d-md-block left-wrapper">
          <ProfileAbout />
        </Col>
        {/* left wrapper end */}
        {/* middle wrapper start */}
        <Col md={8} xl={6} className="middle-wrapper">
          <ProfilePostsList />
        </Col>
        {/* middle wrapper end */}
        {/* right wrapper start */}
        <Col xl={3} className="d-none d-xl-block">
          <Row>
            <Col md={12} className="grid-margin">
              <ProfilePhotos />
            </Col>
            <Col md={12} className="grid-margin">
              <ProfileSuggestions />
            </Col>
          </Row>
        </Col>
        {/* right wrapper end */}
      </Row>
    </>
  );
};

export default ProfilePage;
