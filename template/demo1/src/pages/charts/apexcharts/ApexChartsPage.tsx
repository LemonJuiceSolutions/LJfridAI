import { Breadcrumb, Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import LineChart from './components/LineChart';
import BarChart from './components/BarChart';
import AreaChart from './components/AreaChart';
import MixedChart from './components/MixedChart';
import DonutChart from './components/DonutChart';
import PieChart from './components/PieChart';
import HeatMapChart from './components/HeatMapChart';
import RadarChart from './components/RadarChart';
import ScatterChart from './components/ScatterChart';
import RadialbarChart from './components/RadialbarChart';

const ApexChartsPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Charts
        </Breadcrumb.Item>
        <Breadcrumb.Item active>React-ApexCharts</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React-ApexCharts</Card.Title>
              <p className="text-secondary">
                Read the{' '}
                <a href="https://github.com/apexcharts/react-apexcharts" target="_blank" rel="noopener noreferrer">
                  Official React-ApexCharts Documentation{' '}
                </a>
                for a full list of instructions and other options.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Line chart</Card.Title>
              <LineChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Bar chart</Card.Title>
              <BarChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Area chart</Card.Title>
              <AreaChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Mixed chart</Card.Title>
              <MixedChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Donut chart</Card.Title>
              <DonutChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Pie chart</Card.Title>
              <PieChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>HeatMap chart</Card.Title>
              <HeatMapChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Radar chart</Card.Title>
              <RadarChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin grid-margin-xl-0 stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Scatter chart</Card.Title>
              <ScatterChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Radialbar chart</Card.Title>
              <RadialbarChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default ApexChartsPage;
