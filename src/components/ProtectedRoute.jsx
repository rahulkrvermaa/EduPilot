import { Navigate } from "react-router-dom";
import Layout from "./Layout";

const TOKEN_KEY = "edupilotToken";

export function isAuthenticated() {
  try {
    return Boolean(localStorage.getItem(TOKEN_KEY));
  } catch {
    return false;
  }
}

// Used as a layout route: <Route element={<ProtectedRoute />}>
// Renders the app shell (Sidebar + Navbar) for authenticated users.
// Redirects unauthenticated visitors to /login.
function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}

export default ProtectedRoute;
