import { Printer, Send } from 'lucide-react';
import { Breadcrumb, Button, Card, Col, Container, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router';

const InvoicePage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          General pages
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Invoice</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12}>
          <Card>
            <Card.Body>
              <Container>
                <Row>
                  <Col>
                    <Link to="." className="nobleui-logo d-block mt-3">
                      Noble<span>UI</span>
                    </Link>
                    <p className="mt-3 mb-1">
                      <b>NobleUI Solutions Inc.</b>
                    </p>
                    <p>
                      350 California Street,
                      <br /> Suite 1400,
                      <br />
                      San Francisco, CA 94104.
                    </p>
                    <h5 className="mt-5 mb-2 text-secondary">Invoice to :</h5>
                    <p>
                      <strong>Tech Innovations Ltd.</strong>
                      <br />
                      25 Enterprise Drive,
                      <br />
                      New York, NY 10017.
                      <br />
                    </p>
                  </Col>
                  <Col>
                    <h4 className="fw-bold text-uppercase text-end mt-4 mb-2">invoice</h4>
                    <h6 className="text-end mb-5 pb-4"># INV-2026-0472</h6>
                    <p className="text-end mb-1">Balance Due</p>
                    <h4 className="text-end fw-normal">$ 2,988.00</h4>
                    <h6 className="text-end fw-normal mb-2 mt-3">
                      <span className="text-secondary">Invoice Date :</span> 1st May 2026
                    </h6>
                    <h6 className="text-end fw-normal mb-2">
                      <span className="text-secondary">Due Date :</span> 31st May 2026
                    </h6>
                    <h6 className="text-end fw-normal">
                      <span className="text-secondary">PO Number :</span> PO-2026-1234
                    </h6>
                  </Col>
                </Row>
              </Container>
              <Container className="mt-5 d-flex justify-content-center w-100">
                <div className="table-responsive w-100">
                  <Table bordered>
                    <thead className="bg-light">
                      <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th className="text-end">Quantity</th>
                        <th className="text-end">Unit cost</th>
                        <th className="text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-end">
                        <td className="text-start">1</td>
                        <td className="text-start">
                          Enterprise Plan Subscription - Annual
                          <br />
                          <small className="text-secondary">Period: May 2026 - April 2027</small>
                        </td>
                        <td>1</td>
                        <td>$1,999.00</td>
                        <td>$1,999.00</td>
                      </tr>
                      <tr className="text-end">
                        <td className="text-start">2</td>
                        <td className="text-start">
                          Additional User Licenses
                          <br />
                          <small className="text-secondary">$49/user/year × 10 users</small>
                        </td>
                        <td>10</td>
                        <td>$49.00</td>
                        <td>$490.00</td>
                      </tr>
                      <tr className="text-end">
                        <td className="text-start">3</td>
                        <td className="text-start">
                          API Integration Package - Premium
                          <br />
                          <small className="text-secondary">Includes 100,000 API calls/month</small>
                        </td>
                        <td>1</td>
                        <td>$299.00</td>
                        <td>$299.00</td>
                      </tr>
                      <tr className="text-end">
                        <td className="text-start">4</td>
                        <td className="text-start">
                          24/7 Premium Support Plan
                          <br />
                          <small className="text-secondary">Priority response & dedicated account manager</small>
                        </td>
                        <td>1</td>
                        <td>$200.00</td>
                        <td>$200.00</td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              </Container>
              <Container fluid className="mt-5 w-100">
                <Row>
                  <Col md={6} className="ms-auto">
                    <div className="table-responsive">
                      <Table>
                        <tbody>
                          <tr>
                            <td>Sub Total</td>
                            <td className="text-end">$ 2,988.00</td>
                          </tr>
                          <tr>
                            <td>TAX (0%)</td>
                            <td className="text-end">$ 0.00</td>
                          </tr>
                          <tr>
                            <td className="text-bold-800">Total</td>
                            <td className="text-bold-800 text-end"> $ 2,988.00</td>
                          </tr>
                          <tr>
                            <td>Payment Made</td>
                            <td className="text-danger text-end">(-) $ 0.00</td>
                          </tr>
                          <tr className="bg-light">
                            <td className="text-bold-800">Balance Due</td>
                            <td className="text-bold-800 text-end">$ 2,988.00</td>
                          </tr>
                        </tbody>
                      </Table>
                    </div>
                  </Col>
                </Row>
              </Container>
              <Container fluid className="mt-5 w-100">
                <Row>
                  <Col md={12}>
                    <p className="text-center text-secondary small">
                      Thank you for your business! For any questions, please contact billing@nobleui.com
                      <br />
                      This invoice was generated electronically and is valid without a signature.
                    </p>
                  </Col>
                </Row>
              </Container>
              <Container fluid className="w-100">
                <div className="d-flex justify-content-center mt-4">
                  <Link to=".">
                    <Button variant="primary">
                      <Send className="me-2 icon-md" />
                      Send Invoice
                    </Button>
                  </Link>
                  <Link to=".">
                    <Button variant="outline-primary" className="ms-2">
                      <Printer className="me-2 icon-md" />
                      Print
                    </Button>
                  </Link>
                </div>
              </Container>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default InvoicePage;
