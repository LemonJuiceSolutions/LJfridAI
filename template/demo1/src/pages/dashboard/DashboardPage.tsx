import { Printer, DownloadCloud, ArrowUp, ArrowDown } from 'lucide-react';
import { useState } from 'react';
import { Button, Row, Card, Col, ButtonGroup } from 'react-bootstrap';
import DatePicker from './components/DatePicker';
import CustomersChart from './components/CustomersChart';
import OrdersChart from './components/OrdersChart';
import GrowthChart from './components/GrowthChart';
import CardActionsDropdown from './components/CardActionsDropdown';
import RevenueChart from './components/RevenueChart';
import SalesChart from './components/SalesChart';
import StorageChart from './components/StorageChart';
import InboxPreview from './components/InboxPreview';
import ProjectsTable from './components/ProjectsTable';

const DashboardPage = () => {
  const [selected, setSelected] = useState<Date>(new Date());

  const handleDateSelect = (date: Date) => {
    setSelected(date);
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center flex-wrap grid-margin">
        <h4 className="mb-3 mb-md-0">Welcome to Dashboard</h4>
        <div className="d-flex align-items-center flex-wrap text-nowrap">
          <DatePicker selected={selected} onDateSelect={handleDateSelect} className="w-200px me-2 mb-2 mb-md-0" />
          <Button variant="outline-primary" className="btn-icon-text me-2 mb-2 mb-md-0">
            <Printer size={16} className="me-2" />
            Print
          </Button>
          <Button variant="primary" className="btn-icon-text mb-2 mb-md-0">
            <DownloadCloud size={16} className="me-2" />
            Download Report
          </Button>
        </div>
      </div>

      <Row>
        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-2">
                <Card.Title className="mb-0">New Customers</Card.Title>
                <CardActionsDropdown />
              </div>

              <Row>
                <Col xs={6} md={12} xl={5}>
                  <h3 className="mb-2">3,897</h3>
                  <div className="d-flex align-items-baseline">
                    <p className="text-success">
                      <span>+3.3%</span>
                      <ArrowUp className="icon-sm mb-1" />
                    </p>
                  </div>
                </Col>
                <Col xs={6} md={12} xl={7}>
                  <div className="mt-md-3 mt-xl-0">
                    <CustomersChart />
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-2">
                <Card.Title className="mb-0">New Orders</Card.Title>
                <CardActionsDropdown />
              </div>

              <Row>
                <Col xs={6} md={12} xl={5}>
                  <h3 className="mb-2">35,084</h3>
                  <div className="d-flex align-items-baseline">
                    <p className="text-danger">
                      <span>-2.8%</span>
                      <ArrowDown className="icon-sm mb-1" />
                    </p>
                  </div>
                </Col>
                <Col xs={6} md={12} xl={7}>
                  <div className="mt-md-3 mt-xl-0">
                    <OrdersChart />
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-2">
                <Card.Title className="mb-0">Growth</Card.Title>
                <CardActionsDropdown />
              </div>

              <Row>
                <Col xs={6} md={12} xl={5}>
                  <h3 className="mb-2">89.87%</h3>
                  <div className="d-flex align-items-baseline">
                    <p className="text-success">
                      <span>+2.8%</span>
                      <ArrowUp className="icon-sm mb-1" />
                    </p>
                  </div>
                </Col>
                <Col xs={6} md={12} xl={7}>
                  <div className="mt-md-3 mt-xl-0">
                    <GrowthChart />
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-3">
                <Card.Title className="mb-0">Revenue</Card.Title>
                <CardActionsDropdown />
              </div>
              <Row className="align-items-start">
                <Col md={7}>
                  <p className="text-secondary fs-13px mb-3 mb-md-0">
                    Revenue is the income that a business has from its normal business activities, usually from the sale
                    of goods and services to customers.
                  </p>
                </Col>
                <Col md={5} className="d-flex justify-content-md-end">
                  <ButtonGroup aria-label="">
                    <Button variant="outline-primary">Today</Button>
                    <Button variant="outline-primary">Week</Button>
                    <Button variant="primary">Month</Button>
                    <Button variant="outline-primary">Year</Button>
                  </ButtonGroup>
                </Col>
              </Row>
              <RevenueChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col lg={7} xl={8} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-3">
                <Card.Title className="mb-0">Monthly sales</Card.Title>
                <CardActionsDropdown />
              </div>
              <p className="text-secondary">
                Sales are activities related to selling or the number of goods or services sold in a given time period.
              </p>
              <SalesChart />
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5} xl={4} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-3">
                <Card.Title className="mb-0">Cloud storage</Card.Title>
                <CardActionsDropdown />
              </div>
              <StorageChart />
              <Row className="mb-3">
                <Col xs={6}>
                  <label className="d-flex align-items-center justify-content-end fs-10px text-uppercase fw-bold">
                    Total storage <span className="p-1 ms-1 rounded-circle bg-secondary"></span>
                  </label>
                  <h5 className="fw-bolder mb-0 text-end">8TB</h5>
                </Col>
                <Col xs={6}>
                  <label className="d-flex align-items-center fs-10px text-uppercase fw-bold">
                    <span className="p-1 me-1 rounded-circle bg-primary"></span> Used storage
                  </label>
                  <h5 className="fw-bolder mb-0">~5TB</h5>
                </Col>
              </Row>
              <div className="d-grid">
                <Button variant="primary">Upgrade storage</Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col lg={5} xl={4} className="grid-margin grid-margin-lg-0 stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-3">
                <Card.Title className="mb-0">Inbox</Card.Title>
                <CardActionsDropdown />
              </div>
              <InboxPreview />
            </Card.Body>
          </Card>
        </Col>

        <Col lg={7} xl={8} className="stretch-card">
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-baseline mb-3">
                <Card.Title className="mb-0">Projects</Card.Title>
                <CardActionsDropdown />
              </div>
              <ProjectsTable />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default DashboardPage;
