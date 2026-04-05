import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { env } from "../env";
import { useAuth } from "./AuthContext";

export function Layout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

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
                    to="/login"
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
