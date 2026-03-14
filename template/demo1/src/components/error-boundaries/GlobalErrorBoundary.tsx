import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Col, Row } from 'react-bootstrap';
import { RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GlobalErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Log error to external service (e.g., Sentry, LogRocket, etc.)
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    // Reload the entire application
    window.location.reload();
  };

  handleGoHome = () => {
    console.log('GlobalErrorBoundary handleGoHome called');
    // Navigate to home page
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center">
          <Row className="w-100 mx-0">
            <Col md={8} xl={6} className="mx-auto">
              <div className="text-center mb-4">
                <div className="display-1 text-danger mb-3">⚠️</div>
                <h2 className="fw-bold mb-3">Application Error</h2>
                <p className="text-secondary mb-4">
                  We're sorry, but something went wrong with the application. Our team has been notified and is working
                  to fix the issue.
                </p>
              </div>

              <Alert variant="danger" className="mb-4">
                <Alert.Heading className="mb-2">Technical Details</Alert.Heading>
                <p className="mb-2">
                  <strong>Error:</strong> {this.state.error?.message || 'Unknown error'}
                </p>
                {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                  <details>
                    <summary>Component Stack</summary>
                    <pre className="mt-2 small bg-dark text-light p-2 rounded">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </Alert>

              <div className="d-flex flex-column flex-sm-row gap-2 justify-content-center">
                <Button variant="primary" className="btn-icon-text" onClick={this.handleReset} size="lg">
                  <RefreshCw className="w-16px me-2" />
                  Reload Application
                </Button>
                <Button variant="outline-secondary" className="btn-icon-text" onClick={this.handleGoHome} size="lg">
                  <Home className="w-16px me-2" />
                  Go to Home
                </Button>
              </div>

              <div className="text-center mt-4">
                <small className="text-secondary">
                  If the problem persists, please contact support with the error details above.
                </small>
              </div>
            </Col>
          </Row>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
