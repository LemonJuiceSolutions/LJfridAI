import { Navigate, Outlet, useLocation } from 'react-router';

const AuthGuard = () => {
  const location = useLocation();
  const isAuth = !!localStorage.getItem('token');

  return isAuth ? <Outlet /> : <Navigate to="/auth/login" state={{ from: location }} replace />;
};

export default AuthGuard;
