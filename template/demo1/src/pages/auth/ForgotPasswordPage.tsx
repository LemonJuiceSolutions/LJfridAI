import { getUrl } from '@/utils/getUrl';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { ShieldAlert } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const fakeForgotPasswordApi = (email: string) => {
  return new Promise<{ message: string }>((resolve, reject) => {
    setTimeout(() => {
      if (email === 'admin@demo.com') {
        resolve({ message: 'Password reset instructions sent to your email.' });
      } else {
        reject(new Error('Email not found.'));
      }
    }, 1200);
  });
};

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@demo.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await fakeForgotPasswordApi(email);
      await MySwal.fire({
        title: 'Success!',
        text: result.message,
        icon: 'success',
        confirmButtonText: 'Go to Login',
        willClose: () => {
          navigate('/auth/login', { replace: true });
        },
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
      setLoading(false);
    }
  };

  return (
    <Row>
      <Col md={4} className="pe-md-0">
        <div className="h-100">
          <img
            src={getUrl('/images/others/auth-hero.webp')}
            alt="Forgot password illustration"
            className="w-100 h-100 object-fit-cover"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            style={{ objectPosition: 'center' }}
          />
        </div>
      </Col>
      <Col md={8} className="ps-md-0">
        <div className="px-4 py-5">
          <Link to="/auth/login" className="nobleui-logo d-block mb-2">
            Noble<span>UI</span>
          </Link>
          <h4 className="mb-4">Forgot your password?</h4>
          <p className="mb-4 text-secondary">
            Enter your email address and we'll send you instructions for resetting your password.
          </p>
          <Form onSubmit={handleSubmit} autoComplete="on">
            {error && (
              <Alert variant="danger">
                <ShieldAlert className="me-2" size={22} />
                {error}
              </Alert>
            )}
            <Form.Group className="mb-3" controlId="forgotPasswordEmail">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                type="email"
                placeholder="Enter your email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <div>
              <Button type="submit" variant="primary" className="me-2 mb-2 mb-md-0" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner size="sm" animation="border" /> Sending...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
              <Link to="/auth/login">
                <Button variant="link">Back to Login</Button>
              </Link>
            </div>
          </Form>
        </div>
      </Col>
    </Row>
  );
};

export default ForgotPasswordPage;
