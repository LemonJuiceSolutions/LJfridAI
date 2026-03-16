import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Col, Row } from 'react-bootstrap';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Row className="w-100 mx-0 auth-page">
          <Col md={8} xl={6} className="mx-auto d-flex flex-column align-items-center">
            <div className="text-center mb-4">
              <h1 className="fw-bolder mt-2 fs-150px text-danger">⚠️</h1>
              <h4 className="mb-3">Something went wrong</h4>
              <p className="text-secondary mb-3 text-center">
                An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
              </p>
            </div>

            <Alert variant="danger" className="mb-3 w-100">
              <Alert.Heading>Error Details</Alert.Heading>
              <p className="mb-0">
                <strong>Error:</strong> {this.state.error?.message || 'Unknown error'}
              </p>
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="mt-2">
                  <summary>Stack trace</summary>
                  <pre className="mt-2 small">{this.state.errorInfo.componentStack}</pre>
                </details>
              )}
            </Alert>

            <div className="d-flex gap-2">
              <Button variant="primary" onClick={this.handleReset}>
                <RefreshCw className="w-15px me-1" />
                Try Again
              </Button>
              <Link to="/">
                <Button variant="outline-secondary">
                  <ArrowLeft className="w-15px me-1" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </Col>
        </Row>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
