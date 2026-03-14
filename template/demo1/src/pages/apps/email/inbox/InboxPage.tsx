import { ChevronLeft, ChevronRight, Inbox, Paperclip, Search, Star } from 'lucide-react';
import { Button, ButtonGroup, Col, Dropdown, Form, InputGroup, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import { emailsData, getUnreadCount } from '@/mock/emailsData';
import { ChangeEvent, useEffect, useState } from 'react';

const InboxPage = () => {
  // Calculate unread count using helper function
  const unreadCount = getUnreadCount();

  // State for search query
  const [search, setSearch] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const emailsPerPage = 12;

  // Filtered emails based on search
  const filteredEmails = emailsData.filter((email) => {
    const q = search.toLowerCase();
    return (
      email.from.toLowerCase().includes(q) ||
      email.subject.toLowerCase().includes(q) ||
      email.message.toLowerCase().includes(q)
    );
  });

  // Pagination logic
  const totalEmails = filteredEmails.length;
  const totalPages = Math.ceil(totalEmails / emailsPerPage);
  const startIdx = (page - 1) * emailsPerPage;
  const endIdx = startIdx + emailsPerPage;
  const paginatedEmails = filteredEmails.slice(startIdx, endIdx);

  // Handle page change
  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  // State to track selected emails
  const [selected, setSelected] = useState<number[]>([]);

  // Select all on current page
  const allSelected = paginatedEmails.length > 0 && paginatedEmails.every((email) => selected.includes(email.id));
  const handleSelectAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelected((prev) => Array.from(new Set([...prev, ...paginatedEmails.map((e) => e.id)])));
    } else {
      setSelected((prev) => prev.filter((id) => !paginatedEmails.some((e) => e.id === id)));
    }
  };
  const handleSelectOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // Actions
  const handleAction = (action: string) => {
    if (selected.length === 0) return;
    if (action === 'delete') {
      // Remove emails from emailsData (simulate by filtering, in real app would update backend)
      const idxs = new Set(selected);
      for (let i = emailsData.length - 1; i >= 0; i--) {
        if (idxs.has(emailsData[i].id)) emailsData.splice(i, 1);
      }
      setSelected([]);
    } else {
      for (const email of emailsData) {
        if (selected.includes(email.id)) {
          if (action === 'read') email.isUnread = false;
          if (action === 'unread') email.isUnread = true;
          if (action === 'starred') email.isStarred = true;
          if (action === 'unstarred') email.isStarred = false;
        }
      }
      setSelected([]);
    }
  };

  return (
    <>
      <div className="p-3 border-bottom">
        <Row className="align-items-center">
          <Col lg={6}>
            <div className="d-flex align-items-end mb-2 mb-lg-0">
              <Inbox className="text-secondary me-2" />
              <h4 className="me-1">Inbox</h4>
              <span className="text-secondary">({unreadCount} new messages)</span>
            </div>
          </Col>
          <Col lg={6}>
            <InputGroup>
              <Form.Control
                placeholder="Search mail..."
                aria-label="Search mail"
                aria-describedby="mail-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <InputGroup.Text className="bg-transparent" id="mail-search">
                <Search className="cursor-pointer" />
              </InputGroup.Text>
            </InputGroup>
          </Col>
        </Row>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-between p-3 border-bottom">
        <div className="d-flex align-items-center">
          <div className="form-check me-3">
            <input type="checkbox" className="form-check-input" checked={allSelected} onChange={handleSelectAll} />
          </div>
          <Dropdown>
            <Dropdown.Toggle as={Button} variant="outline-primary" size="sm" id="dropdownMenuButton">
              Actions
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => handleAction('read')}>Mark as read</Dropdown.Item>
              <Dropdown.Item onClick={() => handleAction('unread')}>Mark as unread</Dropdown.Item>
              <Dropdown.Item onClick={() => handleAction('starred')}>Mark as starred</Dropdown.Item>
              <Dropdown.Item onClick={() => handleAction('unstarred')}>Mark as unstarred</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item className="text-danger" onClick={() => handleAction('delete')}>
                Delete
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
        <div className="d-flex align-items-center justify-content-end flex-grow-1">
          <span className="me-2">
            {totalEmails === 0 ? 0 : startIdx + 1}-{Math.min(endIdx, totalEmails)} of {totalEmails}
          </span>
          <ButtonGroup size="sm">
            <Button
              variant="outline-primary"
              className="btn-icon"
              type="button"
              onClick={handlePrev}
              disabled={page === 1}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline-primary"
              className="btn-icon"
              type="button"
              onClick={handleNext}
              disabled={page === totalPages || totalEmails === 0}
            >
              <ChevronRight />
            </Button>
          </ButtonGroup>
        </div>
      </div>
      <div className="email-list">
        {paginatedEmails.map((email) => (
          <div key={email.id} className={`email-list-item ${email.isUnread ? 'email-list-item--unread' : ''}`}>
            <div className="email-list-actions">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={selected.includes(email.id)}
                  onChange={() => handleSelectOne(email.id)}
                />
              </div>
              <a className="favorite" href="#/">
                <span>
                  <Star className={email.isStarred ? 'text-warning' : ''} />
                </span>
              </a>
            </div>
            <Link to={`/apps/email/read/${email.id}`} className="email-list-detail">
              <div className="content">
                <span className="from">{email.from}</span>
                <p className="msg">
                  {email.subject} {` - `} <span className="text-secondary">{email.message}</span>
                </p>
              </div>
              <span className="date">
                {email.hasAttachment && (
                  <span className="icon">
                    <Paperclip />
                  </span>
                )}
                {email.date}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
};

export default InboxPage;
