import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { env } from "../env";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "./ThemeContext";

const primaryLinks = [
  { to: "/", label: "Home", end: true },
  { to: "/lobbies", label: "Lobbies" },
  { to: "/games", label: "Games" },
  { to: "/leaderboard", label: "Leaders" },
  { to: "/profile", label: "Profile" },
  { to: "/dev", label: "Dev" },
];

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const routeKey = `${location.pathname}${location.search}`;
  const previousRouteKey = useRef(routeKey);
  const authReturnTo = new URLSearchParams(location.search).get("returnTo");
  const returnTo =
    (location.pathname === "/login" || location.pathname === "/register") &&
    authReturnTo
      ? authReturnTo
      : routeKey;

  useEffect(() => {
    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      setMenuOpen(false);
    }
  }, [routeKey]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="appRoot">
      <header className={menuOpen ? "topNav topNavMenuOpen" : "topNav"}>
        <div className="navBar">
          <div className="navIdentity">
            <NavLink to="/" className="brand" end>
              <span className="brandMark" aria-hidden="true">
                OO
              </span>
              <span>{env.appName}</span>
            </NavLink>
            <span className="navTagline">Markets, alliances, commitment</span>
          </div>
          <button
            type="button"
            className="navMenuButton"
            aria-controls="site-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="navMenuIcon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>{menuOpen ? "Close" : "Menu"}</span>
          </button>
        </div>

        <div id="site-navigation" className="navPanel">
          <nav className="primaryNav" aria-label="Main">
            <ul className="navLinks">
              {primaryLinks.map((link) => (
                <li key={link.to}>
                  <NavLink
                    className={({ isActive }) =>
                      isActive ? "active" : undefined
                    }
                    end={link.end}
                    to={link.to}
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
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
                      Sign out <span>{user.username}</span>
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
          <ThemeToggle />
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
