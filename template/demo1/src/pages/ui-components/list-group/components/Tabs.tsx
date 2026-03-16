import { Col, ListGroup, Row, Tab } from 'react-bootstrap';

function TabsExample() {
  return (
    <Tab.Container id="list-group-tabs-example" defaultActiveKey="#link1">
      <Row>
        <Col sm={4}>
          <ListGroup>
            <ListGroup.Item action href="#link1">
              Link 1
            </ListGroup.Item>
            <ListGroup.Item action href="#link2">
              Link 2
            </ListGroup.Item>
            <ListGroup.Item action href="#link3">
              Link 3
            </ListGroup.Item>
          </ListGroup>
        </Col>
        <Col sm={8}>
          <Tab.Content>
            <Tab.Pane eventKey="#link1">Tab pane content 1</Tab.Pane>
            <Tab.Pane eventKey="#link2">Tab pane content 2</Tab.Pane>
            <Tab.Pane eventKey="#link3">Tab pane content 3</Tab.Pane>
          </Tab.Content>
        </Col>
      </Row>
    </Tab.Container>
  );
}

export default TabsExample;

export const tabsExampleCode = `import { Col, ListGroup, Row, Tab } from "react-bootstrap";

function TabsExample() {
  return (
    <Tab.Container id="list-group-tabs-example" defaultActiveKey="#link1">
      <Row>
        <Col sm={4}>
          <ListGroup>
            <ListGroup.Item action href="#link1">
              Link 1
            </ListGroup.Item>
            <ListGroup.Item action href="#link2">
              Link 2
            </ListGroup.Item>
            <ListGroup.Item action href="#link3">
              Link 3
            </ListGroup.Item>
          </ListGroup>
        </Col>
        <Col sm={8}>
          <Tab.Content>
            <Tab.Pane eventKey="#link1">Tab pane content 1</Tab.Pane>
            <Tab.Pane eventKey="#link2">Tab pane content 2</Tab.Pane>
            <Tab.Pane eventKey="#link3">Tab pane content 3</Tab.Pane>
          </Tab.Content>
        </Col>
      </Row>
    </Tab.Container>
  );
}

export default TabsExample;`;
