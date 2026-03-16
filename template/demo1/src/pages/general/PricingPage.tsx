import { useState } from 'react';
import { Building, Building2, Check, Package, X } from 'lucide-react';
import { Badge, Breadcrumb, Button, Card, Col, Container, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router';

const features = {
  basic: [
    { text: 'Up to 5 team members', included: true },
    { text: '5GB storage', included: true },
    { text: 'Basic reporting', included: true },
    { text: 'Email support', included: true },
    { text: 'Advanced analytics', included: false },
    { text: 'Custom integrations', included: false },
  ],
  business: [
    { text: 'Up to 25 team members', included: true },
    { text: '50GB storage', included: true },
    { text: 'Advanced reporting', included: true },
    { text: 'Priority support', included: true },
    { text: 'Basic integrations', included: true },
    { text: 'Custom solutions', included: false },
  ],
  professional: [
    { text: 'Unlimited team members', included: true },
    { text: 'Unlimited storage', included: true },
    { text: 'Custom reporting', included: true },
    { text: '24/7 phone support', included: true },
    { text: 'Advanced integrations', included: true },
    { text: 'Custom solutions', included: true },
  ],
};

const PricingPage = () => {
  const [isAnnual, setIsAnnual] = useState(false);

  // Pricing data
  const prices = {
    basic: {
      monthly: 29,
      annual: 24,
    },
    business: {
      monthly: 99,
      annual: 79,
    },
    professional: {
      monthly: 299,
      annual: 249,
    },
  };

  const planData = [
    {
      name: 'Starter',
      icon: <Package size={40} className="text-primary bg-secondary bg-opacity-10 rounded-circle p-2 my-3" />,
      price: isAnnual ? prices.basic.annual : prices.basic.monthly,
      color: 'primary',
      subtitle: 'For small teams',
      features: features.basic,
      button: (
        <Button variant="outline-primary" className="w-100">
          Start 14-day trial
        </Button>
      ),
      highlight: false,
    },
    {
      name: 'Business',
      icon: <Building size={40} className="text-success bg-secondary bg-opacity-10 rounded-circle p-2 my-3" />,
      price: isAnnual ? prices.business.annual : prices.business.monthly,
      color: 'success',
      subtitle: 'For growing businesses',
      features: features.business,
      button: (
        <Button variant="success" className="w-100 fw-bold">
          Start 14-day trial
        </Button>
      ),
      highlight: true,
    },
    {
      name: 'Enterprise',
      icon: <Building2 size={40} className="text-primary bg-secondary bg-opacity-10 rounded-circle p-2 my-3" />,
      price: isAnnual ? prices.professional.annual : prices.professional.monthly,
      color: 'primary',
      subtitle: 'For large organizations',
      features: features.professional,
      button: (
        <Button variant="outline-primary" className="w-100">
          Contact sales
        </Button>
      ),
      highlight: false,
    },
  ];

  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          General pages
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Pricing</Breadcrumb.Item>
      </Breadcrumb>

      <div className="text-center mb-5 mt-5">
        <h2 className="mb-2">Simple, transparent pricing</h2>
        <p className="text-secondary fs-5 fw-normal">Choose the plan that fits your team. No hidden fees.</p>
      </div>

      {/* Billing toggle */}
      <div className="text-center mb-5">
        <div className="d-inline-flex align-items-center bg-secondary bg-opacity-10 rounded-pill px-3 py-2">
          <span className={`me-2 fw-semibold ${!isAnnual ? 'text-primary' : 'text-secondary'}`}>Monthly</span>
          <Form.Check type="switch" checked={isAnnual} onChange={() => setIsAnnual(!isAnnual)} className="mx-2" />
          <span className={`ms-2 fw-semibold ${isAnnual ? 'text-primary' : 'text-secondary'}`}>
            Annual{' '}
            <Badge bg="success" className="ms-1 fs-12px">
              Save 20%
            </Badge>
          </span>
        </div>
      </div>

      <Container>
        <Row className="justify-content-center g-4">
          {planData.map((plan) => (
            <Col key={plan.name} md={6} lg={4} xxl={3} className="stretch-card">
              <Card className={`position-relative ${plan.highlight ? 'border-secondary border-2' : ''}`}>
                {plan.highlight && (
                  <Badge
                    bg="success"
                    className="position-absolute start-50 translate-middle-x mt-3 fs-13px"
                    style={{ top: -27 }}
                  >
                    Most Popular
                  </Badge>
                )}
                <Card.Body className="d-flex flex-column align-items-center">
                  {plan.icon}
                  <h4 className="mt-2 mb-1 text-center">{plan.name}</h4>
                  <h1 className="mb-1 text-center display-5 fw-bold">
                    ${plan.price}
                    <span className="fs-5 fw-normal text-secondary">/mo</span>
                  </h1>
                  <div className="mb-4 text-secondary text-center fw-semibold">{plan.subtitle}</div>
                  <ul className="list-unstyled">
                    {plan.features.map((f, i) => (
                      <li key={i} className="d-flex align-items-center mb-2">
                        <span
                          className={`w-20px h-20px d-inline-flex align-items-center justify-content-center rounded-circle me-2 ${f.included ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                        >
                          {f.included ? <Check size={14} /> : <X size={14} />}
                        </span>
                        <span className={f.included ? '' : 'text-secondary'}>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="w-100">{plan.button}</div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      </Container>
    </>
  );
};

export default PricingPage;
