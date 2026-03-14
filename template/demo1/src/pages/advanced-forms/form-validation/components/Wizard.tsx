import React, { useState } from 'react';
import { useForm, FormProvider, SubmitHandler, FieldErrors, UseFormRegister, UseFormGetValues } from 'react-hook-form';
import { Button, Form, Row, Col, ProgressBar, Alert } from 'react-bootstrap';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { Edit2 } from 'lucide-react';

const SuccessSwal = withReactContent(Swal);

// Zod schema for the wizard form
const wizardSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').min(1, 'Email is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
});

type WizardFormData = z.infer<typeof wizardSchema>;

type StepProps = {
  register: UseFormRegister<WizardFormData>;
  errors: FieldErrors<WizardFormData>;
  getValues: UseFormGetValues<WizardFormData>;
};

// Step 1: Personal Info
const Step1 = ({ register, errors }: StepProps): React.JSX.Element => (
  <>
    <Form.Group className="mb-3" controlId="firstName">
      <Form.Label>First Name</Form.Label>
      <Form.Control type="text" {...register('firstName')} isInvalid={!!errors.firstName} />
      <Form.Control.Feedback type="invalid">{errors.firstName?.message}</Form.Control.Feedback>
    </Form.Group>
    <Form.Group className="mb-3" controlId="lastName">
      <Form.Label>Last Name</Form.Label>
      <Form.Control type="text" {...register('lastName')} isInvalid={!!errors.lastName} />
      <Form.Control.Feedback type="invalid">{errors.lastName?.message}</Form.Control.Feedback>
    </Form.Group>
  </>
);

// Step 2: Address
const Step2 = ({ register, errors }: StepProps): React.JSX.Element => (
  <>
    <Form.Group className="mb-3" controlId="email">
      <Form.Label>Email</Form.Label>
      <Form.Control type="email" {...register('email')} isInvalid={!!errors.email} />
      <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
    </Form.Group>
    <Form.Group className="mb-3" controlId="address">
      <Form.Label>Address</Form.Label>
      <Form.Control type="text" {...register('address')} isInvalid={!!errors.address} />
      <Form.Control.Feedback type="invalid">{errors.address?.message}</Form.Control.Feedback>
    </Form.Group>
    <Form.Group className="mb-3" controlId="city">
      <Form.Label>City</Form.Label>
      <Form.Control type="text" {...register('city')} isInvalid={!!errors.city} />
      <Form.Control.Feedback type="invalid">{errors.city?.message}</Form.Control.Feedback>
    </Form.Group>
  </>
);

// Step 3: Review
type Step3Props = StepProps & { onEdit: (step: number) => void };
const Step3 = ({ getValues, onEdit }: Step3Props): React.JSX.Element => {
  const values: Partial<WizardFormData> = getValues();
  return (
    <>
      <Alert variant="info" className="mb-4">
        <strong>Review your information</strong> before submitting. If you need to make changes, click the{' '}
        <Edit2 size={14} className="mx-1 align-text-bottom text-primary" /> icon next to the relevant section.
      </Alert>
      <Row className="g-2">
        <Col md={6}>
          <div className="d-flex align-items-center mb-2">
            <span className="fw-bold me-2">First Name</span>
            <Button variant="link" size="sm" className="p-0" onClick={() => onEdit(0)}>
              <Edit2 size={12} className="me-1" />
              Edit
            </Button>
          </div>
          <div className="text-secondary mb-3">{values.firstName ?? ''}</div>
        </Col>
        <Col md={6}>
          <div className="d-flex align-items-center mb-2">
            <span className="fw-bold me-2">Last Name</span>
            <Button variant="link" size="sm" className="p-0" onClick={() => onEdit(0)}>
              <Edit2 size={12} className="me-1" />
              Edit
            </Button>
          </div>
          <div className="text-secondary mb-3">{values.lastName ?? ''}</div>
        </Col>
        <Col md={6}>
          <div className="d-flex align-items-center mb-2">
            <span className="fw-bold me-2">Email</span>
            <Button variant="link" size="sm" className="p-0" onClick={() => onEdit(1)}>
              <Edit2 size={12} className="me-1" />
              Edit
            </Button>
          </div>
          <div className="text-secondary mb-3">{values.email ?? ''}</div>
        </Col>
        <Col md={6}>
          <div className="d-flex align-items-center mb-2">
            <span className="fw-bold me-2">Address</span>
            <Button variant="link" size="sm" className="p-0" onClick={() => onEdit(1)}>
              <Edit2 size={12} className="me-1" />
              Edit
            </Button>
          </div>
          <div className="text-secondary mb-3">{values.address ?? ''}</div>
        </Col>
        <Col md={6}>
          <div className="d-flex align-items-center mb-2">
            <span className="fw-bold me-2">City</span>
            <Button variant="link" size="sm" className="p-0" onClick={() => onEdit(1)}>
              <Edit2 size={12} className="me-1" />
              Edit
            </Button>
          </div>
          <div className="text-secondary mb-3">{values.city ?? ''}</div>
        </Col>
      </Row>
    </>
  );
};

// Type for step components
type StepComponent = (props: StepProps) => React.JSX.Element;

// Type for step configuration
type StepConfig = {
  label: string;
  component: StepComponent;
};

// Type for step validation fields
type StepValidationFields = {
  [key: number]: (keyof WizardFormData)[];
};

const steps: StepConfig[] = [
  { label: 'Personal Info', component: Step1 },
  { label: 'Address', component: Step2 },
];

// Define validation fields for each step
const stepValidationFields: StepValidationFields = {
  0: ['firstName', 'lastName'],
  1: ['email', 'address', 'city'],
};

const WizardExample = () => {
  const methods = useForm<WizardFormData>({
    mode: 'onTouched',
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      address: '',
      city: '',
    },
  });
  const {
    handleSubmit,
    trigger,
    formState: { errors },
    getValues,
    register,
  } = methods;
  const [step, setStep] = useState<number>(0);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const totalSteps = steps.length + 1;
  const onEdit = (stepIndex: number): void => setStep(stepIndex);
  const StepComponent: StepComponent | undefined = steps[step]?.component;

  const onNext = async (): Promise<void> => {
    // Validate current step fields only
    const fieldsToValidate: (keyof WizardFormData)[] = stepValidationFields[step] || [];
    const valid = await trigger(fieldsToValidate);
    if (valid) setStep((s) => s + 1);
  };

  const onBack = (): void => setStep((s) => s - 1);

  const onSubmit: SubmitHandler<WizardFormData> = (data): void => {
    setSubmitted(true);
    const swalConfig = {
      position: 'center' as const,
      title: 'Form submitted successfully!',
      text: `Thank you ${data.firstName} ${data.lastName}.`,
      showConfirmButton: false,
      timer: 2000,
      icon: 'success' as const,
    };
    SuccessSwal.fire(swalConfig);
  };

  return (
    <FormProvider {...methods}>
      <ProgressBar
        now={((step + 1) / totalSteps) * 100}
        variant={submitted ? 'success' : 'primary'}
        animated
        className="my-4 h-6px"
      />
      <Form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Row>
          <Col md={8} className="mx-auto">
            {step === 2 ? (
              <Step3 register={register} errors={errors} getValues={getValues} onEdit={onEdit} />
            ) : (
              StepComponent && <StepComponent register={register} errors={errors} getValues={getValues} />
            )}
          </Col>
        </Row>
        <div className="d-flex justify-content-between mt-4">
          {step > 0 && (
            <Button variant="secondary" onClick={onBack} type="button">
              Back
            </Button>
          )}
          {step < totalSteps - 1 && (
            <Button variant="primary" onClick={onNext} type="button">
              Next
            </Button>
          )}
          {step === totalSteps - 1 && (
            <Button variant="success" type="submit">
              Submit
            </Button>
          )}
        </div>
      </Form>
    </FormProvider>
  );
};

export default WizardExample;
