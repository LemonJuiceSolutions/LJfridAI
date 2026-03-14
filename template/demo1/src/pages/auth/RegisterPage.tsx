import { getUrl } from '@/utils/getUrl';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { ShieldAlert } from 'lucide-react';

const fakeRegisterApi = (username: string, email: string, password: string) => {
  return new Promise<{ token: string }>((resolve, reject) => {
    setTimeout(() => {
      if (username && email && password.length >= 6) {
        resolve({ token: 'fake-register-token' });
      } else {
        reject(new Error('Please fill all fields and use a password with at least 6 characters.'));
      }
    }, 1200);
  });
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await fakeRegisterApi(username, email, password);
      localStorage.setItem('token', result.token);
      if (remember) {
        localStorage.setItem('remember', 'true');
      } else {
        localStorage.removeItem('remember');
      }
      navigate('/', { replace: true });
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
            alt="Register illustration"
            className="w-100 h-100 object-fit-cover"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            style={{ objectPosition: 'center' }}
          />
        </div>
      </Col>
      <Col md={8} className="ps-md-0">
        <div className="auth-form-wrapper px-4 py-5">
          <Link to="/" className="nobleui-logo d-block mb-2">
            Noble<span>UI</span>
          </Link>
          <h5 className="text-secondary fw-normal mb-4">Create a free account.</h5>
          <Form onSubmit={handleSubmit} autoComplete="on">
            {error && (
              <Alert variant="danger">
                <ShieldAlert className="me-2" size={22} />
                {error}
              </Alert>
            )}
            <Form.Group className="mb-3" controlId="registerUsername">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                placeholder="Username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="registerEmail">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="registerPassword">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <div className="mb-3">
              <Form.Check
                type="checkbox"
                id="authCheck"
                label="Remember me"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={loading}
              />
            </div>
            <div>
              <Button type="submit" variant="primary" className="me-2 mb-2 mb-md-0" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner size="sm" animation="border" /> Signing up...
                  </>
                ) : (
                  'Sign up'
                )}
              </Button>
              <Button type="button" variant="outline-light" className="btn-icon-text mb-2 mb-md-0" disabled={loading}>
                <svg
                  className="me-2"
                  fill="currentColor"
                  viewBox="-3 0 262 262"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="xMidYMid"
                >
                  <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                  <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
                  <g id="SVGRepo_iconCarrier">
                    <path
                      d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
                      fill="#4285F4"
                    ></path>
                    <path
                      d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
                      fill="#34A853"
                    ></path>
                    <path
                      d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782"
                      fill="#FBBC05"
                    ></path>
                    <path
                      d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
                      fill="#EB4335"
                    ></path>
                  </g>
                </svg>
                Continue with Google
              </Button>
            </div>
            <p className="mt-3 text-secondary">
              Already have an account? <Link to="/auth/login">Sign in</Link>
            </p>
          </Form>
        </div>
      </Col>
    </Row>
  );
};

export default RegisterPage;
