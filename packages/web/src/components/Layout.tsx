import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { env } from "../env";
import { useAuth } from "./AuthContext";

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const authReturnTo = new URLSearchParams(location.search).get("returnTo");
  const returnTo =
    (location.pathname === "/login" || location.pathname === "/register") &&
    authReturnTo
      ? authReturnTo
      : `${location.pathname}${location.search}`;

  return (
    <div className="appRoot">
      <header className="topNav">
        <NavLink to="/" className="brand" end>
          {env.appName}
        </NavLink>
        <nav aria-label="Main">
          <ul className="navLinks">
            <li>
              <NavLink
                to="/"
                className={({ isActive }) => (isActive ? "active" : undefined)}
                end
              >
                Home
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/lobbies"
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                Lobbies
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/games"
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                Games
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/dev"
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                Developer
              </NavLink>
            </li>
            {!loading && (
              <li>
                {user ? (
                  <button
                    type="button"
                    className="navAuthButton"
                    onClick={() => {
                      void logout().then(() => navigate("/"));
                    }}
                  >
                    Sign out ({user.username})
                  </button>
                ) : (
                  <NavLink
                    to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                    className={({ isActive }) =>
                      isActive ? "active" : undefined
                    }
                  >
                    Sign in
                  </NavLink>
                )}
              </li>
            )}
          </ul>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
