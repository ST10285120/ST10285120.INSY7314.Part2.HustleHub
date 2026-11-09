import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Client-side route guard. It only hides UI - the API enforces every rule
 * again on the server, which is the real security boundary.
 * `role` may be a single role or an array of allowed roles.
 */
export default function ProtectedRoute({ children, role }) {
  const { user, token } = useAuth();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const allowed = Array.isArray(role) ? role : role ? [role] : null;
  if (allowed && !allowed.includes(user.role)) {
    return <Navigate to="/gigs" replace />;
  }

  return children;
}
