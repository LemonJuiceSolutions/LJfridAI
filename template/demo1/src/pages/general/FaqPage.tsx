import { Accordion, Breadcrumb, Button, Card, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { useState } from 'react';

const faqData = [
  {
    question: 'What payment methods do you accept?',
    answer: `We accept all major credit cards (Visa, MasterCard, American Express), PayPal, and bank transfers. For enterprise customers, we also offer invoice-based payments with net-30 terms. All payments are processed securely through our PCI-compliant payment gateway. Subscriptions are automatically billed monthly or annually, depending on your chosen plan.`,
    category: 'Billing',
  },
  {
    question: 'How secure is my data on your platform?',
    answer: `We take security seriously. Our platform implements industry-standard security measures including:
- 256-bit SSL encryption for all data transfers
- Regular security audits and penetration testing
- SOC 2 Type II compliance
- GDPR and CCPA compliance
- Two-factor authentication (2FA)
- Daily automated backups with 30-day retention
All data is stored in ISO 27001 certified data centers.`,
    category: 'Security',
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer: `Yes, you can cancel your subscription at any time through your account dashboard. There are no long-term contracts or cancellation fees. If you cancel, you'll continue to have access to the service until the end of your current billing period. We don't offer refunds for partial months, but you're welcome to use the service until the period ends. Your data will be available for export for 30 days after cancellation.`,
    category: 'Account',
  },
  {
    question: 'What kind of customer support do you offer?',
    answer: `Our support varies by plan level:
- **Basic Plan**: Email support with 24-hour response time
- **Professional Plan**: Priority email support with 4-hour response time
- **Enterprise Plan**: 24/7 phone and email support with dedicated account manager
All customers have access to our extensive knowledge base, video tutorials, and community forums. We also offer free onboarding sessions for teams of 5 or more users.`,
    category: 'Enterprise',
  },
  {
    question: 'Do you offer a free trial?',
    answer: `Yes, we offer a 14-day free trial on all our plans. No credit card is required to start your trial. During the trial, you'll have access to all features of our Professional plan. You can upgrade, downgrade, or cancel at any time during the trial period. If you need more time to evaluate, our sales team can arrange for a trial extension on a case-by-case basis.`,
    category: 'Account',
  },
  {
    question: "What's included in the Enterprise plan?",
    answer: `Our Enterprise plan includes:
- Unlimited users and storage
- Custom integration development
- Service Level Agreement (SLA)
- Single Sign-On (SSO) support
- Custom security requirements
- Dedicated success manager
- Priority feature requests
- Custom reporting and analytics
Contact our sales team for custom pricing and implementation details.`,
    category: 'Enterprise',
  },
  {
    question: 'How do I reset my password?',
    answer: `To reset your password, go to the login page and click on 'Forgot Password'. Follow the instructions sent to your registered email address to set a new password. If you do not receive the email, please check your spam folder or contact support for assistance.`,
    category: 'Account',
  },
  {
    question: 'Can I upgrade or downgrade my plan?',
    answer: `Yes, you can upgrade or downgrade your subscription plan at any time from your account dashboard. Changes to your plan will take effect immediately, and any billing adjustments will be prorated accordingly.`,
    category: 'Billing',
  },
  {
    question: 'Is my information shared with third parties?',
    answer: `We do not sell or share your personal information with third parties except as required by law or as necessary to provide our services (e.g., payment processing). Please review our Privacy Policy for more details.`,
    category: 'Security',
  },
  {
    question: 'How do I invite team members?',
    answer: `To invite team members, navigate to the 'Team' section in your account dashboard and click 'Invite Member'. Enter their email address and assign the appropriate role. They will receive an invitation email to join your organization.`,
    category: 'Account',
  },
  {
    question: 'Do you offer custom integrations?',
    answer: `Yes, we offer custom integrations for Enterprise customers. Please contact our sales or support team to discuss your specific requirements and implementation timeline.`,
    category: 'Enterprise',
  },
];

const categories = ['All Categories', ...Array.from(new Set(faqData.map((faq) => faq.category)))];

const FaqPage = () => {
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFaqs = faqData.filter((faq) => {
    const matchesCategory = selectedCategory === 'All Categories' || faq.category === selectedCategory;
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="faq-page">
      <Breadcrumb className="mb-4">
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          General pages
        </Breadcrumb.Item>
        <Breadcrumb.Item active>FAQ</Breadcrumb.Item>
      </Breadcrumb>

      <Row className="justify-content-center mb-4">
        <Col md={6} className="text-center">
          <h2 className="mb-4">How can we help you?</h2>
          <InputGroup className="mb-3">
            <Form.Control
              type="text"
              size="lg"
              className="ps-3 border-end-0 rounded-pill rounded-end-0"
              placeholder="Search for answers..."
              aria-describedby="faq-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <InputGroup.Text id="faq-search" className="bg-body rounded-pill rounded-start-0 cursor-pointer pe-3">
              <Search size={16} strokeWidth={1.5} />
            </InputGroup.Text>
          </InputGroup>
        </Col>
      </Row>

      <Row className="justify-content-center">
        <Col md={10} xxl={8}>
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <Card.Title className="mb-0">Frequently Asked Questions</Card.Title>
                <div>
                  <Form.Select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Form.Select>
                </div>
              </div>

              <Accordion defaultActiveKey="0" className="custom-accordion">
                {filteredFaqs.length === 0 ? (
                  <div className="text-center text-secondary py-4">No FAQs found.</div>
                ) : (
                  filteredFaqs.map((faq, idx) => (
                    <Accordion.Item eventKey={String(idx)} key={faq.question}>
                      <Accordion.Header>{faq.question}</Accordion.Header>
                      <Accordion.Body>
                        {faq.answer.split('\n').map((line, i) => (
                          <span key={i}>
                            {line}
                            <br />
                          </span>
                        ))}
                      </Accordion.Body>
                    </Accordion.Item>
                  ))
                )}
              </Accordion>
            </Card.Body>
          </Card>

          <div className="text-center mt-5">
            <h4 className="mb-3">Still have questions?</h4>
            <p className="text-secondary mb-3">Can't find what you're looking for? Please chat to our friendly team.</p>
            <Button variant="primary rounded-pill" className="px-3">
              Contact Support
            </Button>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default FaqPage;
