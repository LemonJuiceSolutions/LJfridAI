import { Row, Col, InputGroup, Button, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  username: z.string().trim().min(1, 'Username is required'),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  zip: z.string().trim().min(1, 'Zip is required'),
  terms: z.literal(true, { message: 'Terms must be accepted' }),
});

type FormData = z.infer<typeof schema>;

const BasicExample = () => {
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
      terms: true,
    },
  });

  const onSubmit = (data: FormData): void => {
    console.log(data);
  };

  return (
    <Form noValidate onSubmit={handleSubmit(onSubmit)}>
      <Row className="mb-3">
        <Form.Group as={Col} md="4" controlId="validationReactHookForm01">
          <Form.Label>First name</Form.Label>
          <Form.Control
            type="text"
            {...register('firstName')}
            isValid={Boolean(touchedFields.firstName && !errors.firstName)}
            isInvalid={Boolean(errors.firstName)}
          />
          <Form.Control.Feedback type="invalid">
            {errors.firstName?.message || 'First name is required'}
          </Form.Control.Feedback>
          <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="4" controlId="validationReactHookForm02">
          <Form.Label>Last name</Form.Label>
          <Form.Control
            type="text"
            {...register('lastName')}
            isValid={Boolean(touchedFields.lastName && !errors.lastName)}
            isInvalid={Boolean(errors.lastName)}
          />
          <Form.Control.Feedback type="invalid">
            {errors.lastName?.message || 'Last name is required'}
          </Form.Control.Feedback>
          <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="4" controlId="validationReactHookFormUsername">
          <Form.Label>Username</Form.Label>
          <InputGroup hasValidation>
            <InputGroup.Text id="inputGroupPrepend">@</InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="Username"
              aria-describedby="inputGroupPrepend"
              {...register('username')}
              isValid={Boolean(touchedFields.username && !errors.username)}
              isInvalid={Boolean(errors.username)}
            />
            <Form.Control.Feedback type="invalid">
              {errors.username?.message || 'Username is required'}
            </Form.Control.Feedback>
          </InputGroup>
        </Form.Group>
      </Row>
      <Row className="mb-3">
        <Form.Group as={Col} md="6" controlId="validationReactHookForm03">
          <Form.Label>City</Form.Label>
          <Form.Control
            type="text"
            placeholder="City"
            {...register('city')}
            isValid={Boolean(touchedFields.city && !errors.city)}
            isInvalid={Boolean(errors.city)}
          />
          <Form.Control.Feedback type="invalid">{errors.city?.message || 'City is required'}</Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="3" controlId="validationReactHookForm04">
          <Form.Label>State</Form.Label>
          <Form.Control
            type="text"
            placeholder="State"
            {...register('state')}
            isValid={Boolean(touchedFields.state && !errors.state)}
            isInvalid={Boolean(errors.state)}
          />
          <Form.Control.Feedback type="invalid">{errors.state?.message || 'State is required'}</Form.Control.Feedback>
        </Form.Group>
        <Form.Group as={Col} md="3" controlId="validationReactHookForm05">
          <Form.Label>Zip</Form.Label>
          <Form.Control
            type="text"
            placeholder="Zip"
            {...register('zip')}
            isValid={Boolean(touchedFields.zip && !errors.zip)}
            isInvalid={Boolean(errors.zip)}
          />
          <Form.Control.Feedback type="invalid">{errors.zip?.message || 'Zip is required'}</Form.Control.Feedback>
        </Form.Group>
      </Row>
      <Form.Group className="mb-3">
        <Form.Check
          required
          {...register('terms')}
          label="Agree to terms and conditions"
          isInvalid={Boolean(errors.terms)}
          feedback={errors.terms?.message || 'Terms must be accepted'}
          feedbackType="invalid"
          id="validationReactHookForm0"
        />
      </Form.Group>
      <Button type="submit">Submit form</Button>
    </Form>
  );
};

export default BasicExample;
