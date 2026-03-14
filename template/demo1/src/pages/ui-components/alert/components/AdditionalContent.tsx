import { Alert } from 'react-bootstrap';

function AdditionalContentExample() {
  return (
    <Alert variant="success">
      <Alert.Heading className="mb-3">Hey, nice to see you</Alert.Heading>
      <p>
        Aww yeah, you successfully read this important alert message. This example text is going to run a bit longer so
        that you can see how spacing within an alert works with this kind of content.
      </p>
      <hr />
      <p>Whenever you need to, be sure to use margin utilities to keep things nice and tidy.</p>
    </Alert>
  );
}

export default AdditionalContentExample;

export const additionalContentExampleCode = `import { Alert } from "react-bootstrap";

function AdditionalContentExample() {
  return (
    <Alert variant="success">
      <Alert.Heading className="mb-3">Hey, nice to see you</Alert.Heading>
      <p>
        Aww yeah, you successfully read this important alert message. This
        example text is going to run a bit longer so that you can see how
        spacing within an alert works with this kind of content.
      </p>
      <hr />
      <p>
        Whenever you need to, be sure to use margin utilities to keep things
        nice and tidy.
      </p>
    </Alert>
  );
}

export default AdditionalContentExample;`;
