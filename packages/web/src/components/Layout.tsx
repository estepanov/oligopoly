import { NavLink, Outlet } from "react-router-dom";
import { env } from "../env";

export function Layout() {
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
          </ul>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
