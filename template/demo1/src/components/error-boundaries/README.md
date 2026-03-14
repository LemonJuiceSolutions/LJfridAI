# Error Boundaries

This directory contains a comprehensive error boundary system for the React template. Error boundaries are React components that catch JavaScript errors anywhere in their child component tree and display a fallback UI instead of the component tree that crashed.

## Components

### 1. GlobalErrorBoundary
Catches errors at the application level. Wraps the entire app in `App.tsx`.

```tsx
import { GlobalErrorBoundary } from '@/components';

const App = () => {
  return (
    <GlobalErrorBoundary>
      {/* Your app content */}
    </GlobalErrorBoundary>
  );
};
```

### 2. RouteErrorBoundary
Catches errors within specific routes. Automatically resets when the route changes.

```tsx
import { RouteErrorBoundary } from '@/components';

<Route 
  path="/dashboard" 
  element={
    <RouteErrorBoundary routeName="Dashboard">
      <DashboardPage />
    </RouteErrorBoundary>
  } 
/>
```

### 3. ComponentErrorBoundary
Catches errors within individual components. Provides a retry mechanism.

```tsx
import { ComponentErrorBoundary } from '@/components';

<ComponentErrorBoundary componentName="MyComponent">
  <MyComponent />
</ComponentErrorBoundary>
```

### 4. ErrorBoundary
Generic error boundary component with customizable fallback UI.

```tsx
import { ErrorBoundary } from '@/components';

<ErrorBoundary 
  fallback={<CustomErrorUI />}
  onError={(error, errorInfo) => {
    // Custom error handling
  }}
>
  <MyComponent />
</ErrorBoundary>
```

## Error Handling Hook

### useErrorHandler
A custom hook for consistent error handling patterns throughout the application.

```tsx
import { useErrorHandler } from '@/utils/useErrorHandler';

const MyComponent = () => {
  const { handleError, handleAsyncError, wrapWithErrorHandler } = useErrorHandler({
    onError: (error) => {
      // Custom error handling
    },
    logToConsole: true,
    logToService: false
  });

  // Handle synchronous errors
  const handleSyncError = () => {
    try {
      // Some operation that might fail
    } catch (error) {
      handleError(error as Error, 'MyComponent');
    }
  };

  // Handle asynchronous errors
  const handleAsyncOperation = async () => {
    const result = await handleAsyncError(
      async () => {
        // Async operation that might fail
        return await fetchData();
      },
      'AsyncOperation'
    );
    
    if (result) {
      // Handle success
    }
  };

  // Wrap functions with error handling
  const safeFunction = wrapWithErrorHandler(
    (param: string) => {
      // Function that might throw
      return processData(param);
    },
    'SafeFunction'
  );

  return (
    // Your component JSX
  );
};
```

## Usage Examples

### 1. Wrapping Critical Components

```tsx
import { ComponentErrorBoundary } from '@/components';

const DashboardPage = () => {
  return (
    <div>
      <ComponentErrorBoundary componentName="ChartComponent">
        <ChartComponent />
      </ComponentErrorBoundary>
      
      <ComponentErrorBoundary componentName="DataTable">
        <DataTable />
      </ComponentErrorBoundary>
    </div>
  );
};
```

### 2. Custom Fallback UI

```tsx
import { ErrorBoundary } from '@/components';

const CustomErrorUI = () => (
  <div className="alert alert-danger">
    <h5>Something went wrong</h5>
    <p>Please try refreshing the page.</p>
  </div>
);

<ErrorBoundary fallback={<CustomErrorUI />}>
  <MyComponent />
</ErrorBoundary>
```

### 3. Error Logging Integration

```tsx
import { ErrorBoundary } from '@/components';

const logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
  // Send to Sentry, LogRocket, etc.
  console.log('Error logged to service:', error, errorInfo);
};

<ErrorBoundary onError={logErrorToService}>
  <MyComponent />
</ErrorBoundary>
```

## Best Practices

1. **Use GlobalErrorBoundary** at the app level to catch any unhandled errors
2. **Use RouteErrorBoundary** for critical routes that might fail
3. **Use ComponentErrorBoundary** for individual components that might have issues
4. **Use useErrorHandler** for consistent error handling patterns
5. **Provide meaningful error messages** in development mode
6. **Log errors to external services** in production
7. **Reset error boundaries** when appropriate (route changes, user actions)

## Error Boundary Hierarchy

```
GlobalErrorBoundary (App level)
├── RouteErrorBoundary (Route level)
│   └── ComponentErrorBoundary (Component level)
│       └── Your Components
```

This hierarchy ensures that errors are caught at the most appropriate level and don't bubble up unnecessarily.

## Development vs Production

- **Development**: Error boundaries show detailed error information and stack traces
- **Production**: Error boundaries show user-friendly messages and log errors to external services

## Demo Component

Use the `ErrorBoundaryDemo` component to test and understand how error boundaries work:

```tsx
import { ErrorBoundaryDemo } from '@/components';

// Add to any page to test error boundaries
<ErrorBoundaryDemo />
```

This demo component shows:
- Component-level error boundaries
- Async error handling
- Manual error handling
- Error recovery mechanisms 