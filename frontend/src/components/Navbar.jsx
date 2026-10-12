import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar" aria-label="Main">
      <Link to="/gigs" className="brand">
        HustleHub+
      </Link>
      <div className="nav-links">
        <NavLink to="/gigs">Browse gigs</NavLink>
        {user?.role === 'client' && <NavLink to="/my-bookings">My bookings</NavLink>}
        {user?.role === 'freelancer' && <NavLink to="/my-gigs">My gigs</NavLink>}
        {user?.role === 'freelancer' && <NavLink to="/income">Income</NavLink>}
        {user ? (
          <>
            <span className="nav-user">{user.name}</span>
            <button type="button" onClick={handleLogout} className="link-button">
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register" className="nav-cta">
              Register
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
