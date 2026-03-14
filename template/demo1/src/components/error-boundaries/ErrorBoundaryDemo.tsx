import React, { useState } from 'react';
import { Button, Card, CardBody, CardHeader, Col, Container, Row } from 'react-bootstrap';
import { ComponentErrorBoundary } from '@/components/error-boundaries';
import { useErrorHandler as useErrorHandlerHook } from '@/hooks/useErrorHandler';

// Component that throws an error for demonstration
const BuggyComponent: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('This is a simulated error for demonstration purposes');
  }

  return (
    <div className="p-3 bg-success text-white rounded">
      <h6>✅ Component working normally</h6>
      <p className="mb-0">This component is functioning correctly.</p>
    </div>
  );
};

// Component that demonstrates async error handling
const AsyncErrorDemo: React.FC = () => {
  const { handleAsyncError } = useErrorHandlerHook();
  const [result, setResult] = useState<string>('');

  const simulateAsyncError = async () => {
    const data = await handleAsyncError(async () => {
      // Simulate an async operation that might fail
      if (Math.random() > 0.5) {
        throw new Error('Async operation failed');
      }
      return 'Async operation successful';
    }, 'AsyncErrorDemo');

    setResult(data || 'Operation failed');
  };

  return (
    <div className="p-3">
      <Button onClick={simulateAsyncError} variant="info" className="mb-3">
        Test Async Error Handling
      </Button>
      {result && (
        <div className={`p-2 rounded ${result.includes('failed') ? 'bg-danger text-white' : 'bg-success text-white'}`}>
          {result}
        </div>
      )}
    </div>
  );
};

const ErrorBoundaryDemo: React.FC = () => {
  const [shouldThrow, setShouldThrow] = useState(false);
  const { handleError } = useErrorHandlerHook({
    onError: (error) => {
      console.log('Custom error handler called:', error.message);
    },
  });

  const triggerError = () => {
    setShouldThrow(true);
  };

  const resetError = () => {
    setShouldThrow(false);
  };

  const handleManualError = () => {
    try {
      throw new Error('Manual error triggered');
    } catch (error) {
      handleError(error as Error, 'Manual Error Demo');
    }
  };

  return (
    <Container fluid className="p-0">
      <Row>
        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <CardHeader>
              <h5 className="mb-0">Component Error Boundary Demo</h5>
            </CardHeader>
            <CardBody>
              <p className="text-secondary mb-3">
                This demonstrates how a component-level error boundary catches errors and provides a fallback UI without
                crashing the entire application.
              </p>

              <div className="mb-3">
                <Button onClick={triggerError} variant="danger" className="me-2">
                  Trigger Error
                </Button>
                <Button onClick={resetError} variant="secondary">
                  Reset
                </Button>
              </div>

              <ComponentErrorBoundary componentName="BuggyComponent">
                <BuggyComponent shouldThrow={shouldThrow} />
              </ComponentErrorBoundary>
            </CardBody>
          </Card>
        </Col>

        <Col md={6} className="grid-margin stretch-card">
          <Card>
            <CardHeader>
              <h5 className="mb-0">Async Error Handling Demo</h5>
            </CardHeader>
            <CardBody>
              <p className="text-secondary mb-3">
                This demonstrates how to handle async errors using the useErrorHandler hook.
              </p>
              <AsyncErrorDemo />
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={12} className="grid-margin stretch-card">
          <Card>
            <CardHeader>
              <h5 className="mb-0">Manual Error Handling Demo</h5>
            </CardHeader>
            <CardBody>
              <p className="text-secondary mb-3">
                This demonstrates how to manually handle errors using the useErrorHandler hook.
              </p>
              <Button onClick={handleManualError} variant="warning">
                Trigger Manual Error
              </Button>
              <small className="d-block text-secondary mt-2">
                Check the browser console to see the error being logged.
              </small>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ErrorBoundaryDemo;
