import React, { ReactNode } from 'react';
import { RouteErrorBoundary } from './index';

interface RouteErrorWrapperProps {
  children: ReactNode;
  routeName?: string;
}

const RouteErrorWrapper: React.FC<RouteErrorWrapperProps> = ({ children, routeName }) => {
  return <RouteErrorBoundary routeName={routeName}>{children}</RouteErrorBoundary>;
};

export default RouteErrorWrapper;
