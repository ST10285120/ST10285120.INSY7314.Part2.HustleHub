import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Gigs from './pages/Gigs';
import MyGigs from './pages/MyGigs';
import MyBookings from './pages/MyBookings';
import Income from './pages/Income';

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/gigs" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/gigs" element={<Gigs />} />
          <Route
            path="/my-gigs"
            element={
              <ProtectedRoute role="freelancer">
                <MyGigs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/income"
            element={
              <ProtectedRoute role="freelancer">
                <Income />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <ProtectedRoute role="client">
                <MyBookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <div className="page">
                <h1>Page not found</h1>
                <p className="empty-state">
                  That page doesn't exist. <Link to="/gigs">Back to browsing gigs</Link>
                </p>
              </div>
            }
          />
        </Routes>
      </main>
    </>
  );
}
