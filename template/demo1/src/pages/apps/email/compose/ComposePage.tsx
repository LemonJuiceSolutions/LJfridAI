import { useState } from 'react';
import { Edit } from 'lucide-react';
import Select, { components, OptionProps } from 'react-select';
import { users } from '@/mock/usersData';
import { getUrl } from '@/utils/getUrl';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Button, Row, Col, Form } from 'react-bootstrap';
const ComposePage = () => {
  const [value, setValue] = useState('');

  interface UserOption {
    value: string;
    label: string;
    image: string;
  }

  const options: UserOption[] = users.map((user) => ({
    value: user.id,
    label: user.email,
    image: user.picture,
  }));

  const { Option } = components;

  const CustomOption = (props: OptionProps<UserOption>) => (
    <Option {...props}>
      <div className="flex items-center">
        <img src={getUrl(props.data.image)} alt={props.data.label} className="w-20px h-20px me-2" />
        {props.data.label}
      </div>
    </Option>
  );

  return (
    <>
      <div>
        <div className="d-flex align-items-center p-3 border-bottom fs-16px">
          <Edit className="icon-md me-2" />
          New message
        </div>
      </div>
      <div className="m-3 mb-0">
        <div className="to">
          <Row className="mb-3">
            <Form.Label column md={2}>
              To
            </Form.Label>
            <Col md={10}>
              <Select
                options={options}
                components={{ Option: CustomOption }}
                className="react-select-container"
                classNamePrefix="react-select"
                // isMulti
              />
            </Col>
          </Row>
        </div>
        <div className="to cc">
          <Row className="mb-3">
            <Form.Label column md={2}>
              Cc
            </Form.Label>
            <Col md={10}>
              <Select
                options={options}
                components={{ Option: CustomOption }}
                className="react-select-container"
                classNamePrefix="react-select"
                isMulti
              />
            </Col>
          </Row>
        </div>
        <div className="subject">
          <Row className="mb-3">
            <Form.Label column md={2}>
              Subject
            </Form.Label>
            <Col md={10}>
              <Form.Control type="text" />
            </Col>
          </Row>
        </div>
      </div>
      <Row className="mx-3">
        <Col md={12} className="px-0">
          <div className="mb-3">
            <Form.Label visuallyHidden>Descriptions </Form.Label>
            <ReactQuill
              theme="snow"
              value={value}
              onChange={setValue}
              placeholder="Enter Text"
              modules={{
                toolbar: [
                  ['bold', 'italic', 'underline', 'strike'], // toggled buttons
                  [{ header: [1, 2, 3, 4, 5, 6, false] }],
                  [{ list: 'ordered' }, { list: 'bullet' }],
                  [{ indent: '-1' }, { indent: '+1' }], // outdent/indent
                  // [{ 'direction': 'rtl' }],                         // text direction
                  [{ align: [] }],
                  // ['clean'],                                         // remove formatting
                  ['link', 'image', 'video'], // link and media
                ],
              }}
            />
          </div>
        </Col>
        <Col md={12} className="px-0">
          <Button variant="primary" className="me-1 mb-1" type="submit">
            Send
          </Button>
          <Button variant="secondary" className="me-1 mb-1" type="button">
            Cancel
          </Button>
        </Col>
      </Row>
    </>
  );
};

export default ComposePage;
