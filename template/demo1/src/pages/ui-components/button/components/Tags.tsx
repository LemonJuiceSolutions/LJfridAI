import { Button } from 'react-bootstrap';

function TagsExample() {
  return (
    <>
      <Button href="#">Link</Button>
      <Button type="submit">Button</Button>
      <Button as="input" type="button" value="Input" />
      <Button as="input" type="submit" value="Submit" />
      <Button as="input" type="reset" value="Reset" />
    </>
  );
}

export default TagsExample;

export const tagsExampleCode = `import { Button } from "react-bootstrap"

function TagsExample() {
  return (
    <>
      <Button href="#">Link</Button>
      <Button type="submit">Button</Button>
      <Button as="input" type="button" value="Input" />
      <Button as="input" type="submit" value="Submit" />
      <Button as="input" type="reset" value="Reset" />
    </>
  )
}

export default TagsExample`;
