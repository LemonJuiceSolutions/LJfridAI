import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface FormData {
  firstName: string;
  lastName: string;
  username: string;
  city: string;
  state: string;
  zip: string;
  file?: FileList;
  terms: boolean;
}

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  username: z.string().min(1, 'Username is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(1, 'Zip is required'),
  file: z
    .instanceof(FileList)
    .refine((file) => file && file.length > 0, { message: 'File is required' })
    .optional(),
  terms: z.boolean().refine((val) => val === true, { message: 'Terms must be accepted' }),
});

const TooltipExample = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: 'Mark',
      lastName: 'Otto',
      username: '',
      city: '',
      state: '',
      zip: '',
      file: undefined,
      terms: true,
    },
  });

  const onSubmit: SubmitHandler<FormData> = (data: FormData): void => {
    console.log(data);
  };

  return (
    <Form noValidate onSubmit={handleSubmit(onSubmit)}>
      <Row className="mb-3">
        <Form.Group as={Col} md="4" controlId="validationReactHookForm101" className="position-relative">
          <Form.Label>First name</Form.Label>
          <Form.Control
            type="text"
            {...register('firstName')}
            isValid={touchedFields.firstName && !errors.firstName}
            isInvalid={!!errors.firstName}
          />
          <Form.Control.Feedback type="invalid" tooltip>
            {errors.firstName?.message}
          </Form.Control.Feedback>
          <Form.Control.Feedback tooltip>Looks good!</Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="4" controlId="validationReactHookForm102" className="position-relative">
          <Form.Label>Last name</Form.Label>
          <Form.Control
            type="text"
            {...register('lastName')}
            isValid={touchedFields.lastName && !errors.lastName}
            isInvalid={!!errors.lastName}
          />
          <Form.Control.Feedback type="invalid" tooltip>
            {errors.lastName?.message}
          </Form.Control.Feedback>
          <Form.Control.Feedback tooltip>Looks good!</Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="4" controlId="validationReactHookFormUsername2">
          <Form.Label>Username</Form.Label>
          <InputGroup hasValidation>
            <InputGroup.Text id="inputGroupPrepend">@</InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="Username"
              aria-describedby="inputGroupPrepend"
              {...register('username')}
              isInvalid={!!errors.username}
            />
            <Form.Control.Feedback type="invalid" tooltip>
              {errors.username?.message}
            </Form.Control.Feedback>
          </InputGroup>
        </Form.Group>
      </Row>
      <Row className="mb-3">
        <Form.Group as={Col} md="6" controlId="validationReactHookForm103" className="position-relative">
          <Form.Label>City</Form.Label>
          <Form.Control type="text" placeholder="City" {...register('city')} isInvalid={!!errors.city} />
          <Form.Control.Feedback type="invalid" tooltip>
            {errors.city?.message}
          </Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="3" controlId="validationReactHookForm104" className="position-relative">
          <Form.Label>State</Form.Label>
          <Form.Control type="text" placeholder="State" {...register('state')} isInvalid={!!errors.state} />
          <Form.Control.Feedback type="invalid" tooltip>
            {errors.state?.message}
          </Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="3" controlId="validationReactHookForm105" className="position-relative">
          <Form.Label>Zip</Form.Label>
          <Form.Control type="text" placeholder="Zip" {...register('zip')} isInvalid={!!errors.zip} />
          <Form.Control.Feedback type="invalid" tooltip>
            {errors.zip?.message}
          </Form.Control.Feedback>
        </Form.Group>
      </Row>
      <Form.Group className="position-relative mb-3">
        <Form.Label>File</Form.Label>
        <Form.Control type="file" required {...register('file')} isInvalid={!!errors.file} />
        <Form.Control.Feedback type="invalid" tooltip>
          {errors.file?.message}
        </Form.Control.Feedback>
      </Form.Group>
      <Form.Group className="position-relative mb-3">
        <Form.Check
          required
          {...register('terms')}
          label="Agree to terms and conditions"
          isInvalid={!!errors.terms}
          feedback={errors.terms?.message}
          feedbackType="invalid"
          id="validationReactHookForm106"
          feedbackTooltip
        />
      </Form.Group>
      <Button type="submit">Submit form</Button>
    </Form>
  );
};

export default TooltipExample;
