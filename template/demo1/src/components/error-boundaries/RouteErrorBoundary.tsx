import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Col, Row } from 'react-bootstrap';
import { RefreshCw, Home } from 'lucide-react';
import { Link, useLocation, Location } from 'react-router';

interface Props {
  children: ReactNode;
  routeName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class RouteErrorBoundary extends Component<Props & { location: Location }, State> {
  constructor(props: Props & { location: Location }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RouteErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Log route-specific errors
    console.error(`Error in route: ${this.props.routeName || this.props.location.pathname}`);
  }

  componentDidUpdate(prevProps: Props & { location: Location }) {
    // Reset error state when route changes
    if (prevProps.location.pathname !== this.props.location.pathname) {
      this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center">
          <Row className="w-100 mx-0">
            <Col md={8} xl={6} className="mx-auto">
              <div className="text-center mb-4">
                <div className="display-1 text-warning mb-3">⚠️</div>
                <h2 className="fw-bold mb-3">Page Error</h2>
                <p className="text-secondary mb-4">
                  Something went wrong while loading this page. You can try refreshing or navigating to a different
                  page.
                </p>
              </div>

              <Alert variant="warning" className="mb-4">
                <Alert.Heading className="mb-2">Page Details</Alert.Heading>
                <p className="mb-2">
                  <strong>Route:</strong> {this.props.routeName || this.props.location.pathname}
                </p>
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
                  Try Again
                </Button>
                <Link to="/">
                  <Button variant="outline-secondary" className="btn-icon-text" size="lg">
                    <Home className="w-16px me-2" />
                    Go to Home
                  </Button>
                </Link>
              </div>
            </Col>
          </Row>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrapper component to provide location context
const RouteErrorBoundaryWrapper: React.FC<Props> = ({ children, routeName }) => {
  const location = useLocation();
  return (
    <RouteErrorBoundary location={location} routeName={routeName}>
      {children}
    </RouteErrorBoundary>
  );
};

export default RouteErrorBoundaryWrapper;
