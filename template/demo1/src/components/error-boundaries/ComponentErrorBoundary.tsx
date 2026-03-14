import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ComponentErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Log component-specific errors
    if (this.props.componentName) {
      console.error(`Error in component: ${this.props.componentName}`);
    }

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
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

      // Default component error UI
      return (
        <div className="border border-danger rounded p-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h6 className="text-danger mb-0">
              {this.props.componentName ? `${this.props.componentName} Error` : 'Component Error'}
            </h6>
            <Button variant="outline-danger" className="btn-icon-text" size="sm" onClick={this.handleReset}>
              <RefreshCw className="w-12px me-2" />
              Retry
            </Button>
          </div>

          <Alert variant="danger" className="mb-2">
            <small>
              <strong>Error:</strong> {this.state.error?.message || 'Unknown error'}
            </small>
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="mt-2">
                <summary>Stack trace</summary>
                <pre className="mt-1 small">{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
          </Alert>

          <small className="text-secondary">
            This component encountered an error. Click "Retry" to attempt to reload it.
          </small>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ComponentErrorBoundary;
