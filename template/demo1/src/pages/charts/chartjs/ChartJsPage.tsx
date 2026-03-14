import { Breadcrumb, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router';
import LineChart from './components/LineChart';
import BarChart from './components/BarChart';
import AreaChart from './components/AreaChart';
import DoughnutChart from './components/DoughnutChart';
import PieChart from './components/PieChart';
import BubbleChart from './components/BubbleChart';
import RadarChart from './components/RadarChart';
import PolarAreaChart from './components/PolarAreaChart';
import GroupedBarChart from './components/GroupedBarChart';
import MixedChart from './components/MixedChart';

const ChartJsPage = () => {
  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: '.' }}>
          Charts
        </Breadcrumb.Item>
        <Breadcrumb.Item active>React-ChartJs</Breadcrumb.Item>
      </Breadcrumb>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>React-ChartJs</Card.Title>
              <p className="text-secondary">
                Read the{' '}
                <a href="https://github.com/reactchartjs/react-chartjs-2" target="_blank" rel="noopener noreferrer">
                  Official React-ChartJs Documentation{' '}
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
              <Card.Title>Doughnut chart</Card.Title>
              <DoughnutChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Pie chart</Card.Title>
              <PieChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Bubble chart</Card.Title>
              <BubbleChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Radar chart</Card.Title>
              <RadarChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="grid-margin stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Polar Area chart</Card.Title>
              <PolarAreaChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xl={6} className="grid-margin grid-margin-xl-0 stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Grouped bar chart</Card.Title>
              <GroupedBarChart />
            </Card.Body>
          </Card>
        </Col>
        <Col xl={6} className="stretch-card">
          <Card>
            <Card.Body>
              <Card.Title>Mixed chart</Card.Title>
              <MixedChart />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default ChartJsPage;
