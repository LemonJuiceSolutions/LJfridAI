import { getUrl } from '@/utils/getUrl';
import { ArrowLeft, ChevronDown, ChevronLeft, File, Printer, Share, Star, Trash } from 'lucide-react';
import { Button, Dropdown } from 'react-bootstrap';
import { useParams, Link } from 'react-router';
import { Email, getEmailById } from '@/mock/emailsData';

interface ReadPageProps {
  emailId?: number;
  email?: Email;
}

const ReadPage = ({ emailId, email }: ReadPageProps) => {
  const params = useParams();

  // Get email ID from URL params, props, or fallback
  const urlEmailId = params.emailId ? parseInt(params.emailId) : undefined;
  const finalEmailId = emailId || urlEmailId;

  // Get email data - either from props or by ID
  const emailData = email || (finalEmailId ? getEmailById(finalEmailId) : undefined);

  // Fallback to first email if no data provided
  const currentEmail = emailData || getEmailById(1);
  if (!currentEmail) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center h-100">
        <h5 className="mb-1">No email found.</h5>
        <p className="mb-3 text-secondary">Please check the email ID and try again.</p>
        <Link to="/apps/email/inbox">
          <Button variant="primary" size="sm">
            <ChevronLeft className="icon-lg me-2" /> Go to Inbox
          </Button>
        </Link>
      </div>
    );
  }

  const formatMessage = (message: string) => {
    return message.split('\n').map((line, index) => {
      if (line.trim() === '') {
        return <br key={index} />;
      }
      return <p key={index}>{line}</p>;
    });
  };

  const getTotalSize = () => {
    if (!currentEmail.attachments) return '0 KB';
    // Convert all sizes to KB
    const totalKB = currentEmail.attachments.reduce((acc, attachment) => {
      const [sizeStr, unit] = attachment.size.split(' ');
      const size = parseFloat(sizeStr);
      if (isNaN(size)) return acc;
      switch ((unit || '').toUpperCase()) {
        case 'GB':
          return acc + size * 1024 * 1024;
        case 'MB':
          return acc + size * 1024;
        case 'KB':
          return acc + size;
        case 'B':
          return acc + size / 1024;
        default:
          return acc;
      }
    }, 0);

    // Format the total size
    if (totalKB >= 1024 * 1024) {
      return `${(totalKB / (1024 * 1024)).toFixed(2)} GB`;
    } else if (totalKB >= 1024) {
      return `${(totalKB / 1024).toFixed(2)} MB`;
    } else {
      return `${totalKB.toFixed(2)} KB`;
    }
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between flex-wrap p-3 border-bottom fs-16px">
        <div className="d-flex align-items-center flex-wrap">
          <Link to="/apps/email/inbox" className="me-3 text-secondary">
            <ArrowLeft size={20} />
          </Link>
          <Star className={`icon-md me-2 ${currentEmail.isStarred ? 'text-warning' : 'text-secondary'}`} />
          <span>{currentEmail.subject}</span>
        </div>
        <div className="d-none d-sm-block">
          <a type="button" title="Forward">
            <Share className="text-secondary icon-lg" />
          </a>
          <a className="ms-3" type="button" title="Print">
            <Printer className="text-secondary icon-lg" />
          </a>
          <a className="ms-3" type="button" title="Delete">
            <Trash className="text-secondary icon-lg" />
          </a>
        </div>
      </div>
      <div className="d-flex align-items-center justify-content-between flex-wrap px-3 py-2 border-bottom">
        <div className="d-flex align-items-center">
          <div className="me-2">
            <img src={getUrl(currentEmail.senderAvatar || '')} alt="Avatar" className="rounded-circle img-xs" />
          </div>
          <div className="d-flex align-items-center">
            <a href="#" className="text-body">
              {currentEmail.from}
            </a>
            <span className="mx-2 text-secondary">to</span>
            <a href="#" className="text-body me-2">
              {currentEmail.to}
            </a>
            <Dropdown>
              <Dropdown.Toggle as="a" id="dropdownMenuButton" className="no-toggle-icon">
                <ChevronDown className="icon-lg text-secondary" />
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="#/">Mark as read</Dropdown.Item>
                <Dropdown.Item href="#/">Mark as unread</Dropdown.Item>
                <Dropdown.Item href="#/">Spam</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item className="text-danger" href="#/">
                  Delete
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
        <div className="fs-13px text-secondary mt-2 mt-sm-0">{currentEmail.date}</div>
      </div>
      <div className="p-4 border-bottom">{formatMessage(currentEmail.message)}</div>
      {currentEmail.hasAttachment && currentEmail.attachments && currentEmail.attachments.length > 0 && (
        <div className="p-3">
          <div className="mb-2">
            Attachments{' '}
            <span>
              ({currentEmail.attachments.length} files, {getTotalSize()})
            </span>
          </div>
          <ul className="list-unstyled">
            {currentEmail.attachments.map((attachment, index) => (
              <li key={index} className="py-1">
                <a href="#/" className="nav-link text-body">
                  <File className="icon-lg text-secondary me-1" />
                  {attachment.name}
                  <span className="text-secondary fs-11px ms-1">({attachment.size})</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

export default ReadPage;
