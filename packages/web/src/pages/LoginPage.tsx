import { startAuthentication } from "@simplewebauthn/browser";
import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchDevLogin,
  fetchLoginOptions,
  fetchLoginVerify,
} from "../api/auth";
import { useAuth } from "../components/AuthContext";
import { env } from "../env";

const getSafeReturnTo = (value: string | null) =>
  value?.startsWith("/") && !value.startsWith("//") ? value : "/";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));

  const handleLogin = useCallback(
    async (withUsername: boolean) => {
      setError(null);
      setLoading(true);
      try {
        const options = await fetchLoginOptions(
          withUsername && username ? username : undefined,
        );
        const credential = await startAuthentication({ optionsJSON: options });
        const session = await fetchLoginVerify(credential);
        login(
          session.token,
          session.userId,
          session.username,
          session.expiresAt,
        );
        navigate(returnTo);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Login failed");
      } finally {
        setLoading(false);
      }
    },
    [username, login, navigate, returnTo],
  );

  const handleDevLogin = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const session = await fetchDevLogin(username.trim());
      login(session.token, session.userId, session.username, session.expiresAt);
      navigate(returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dev login failed");
    } finally {
      setLoading(false);
    }
  }, [username, login, navigate, returnTo]);

  const devLoginEnabled = env.appEnv === "development";

  return (
    <div>
      <h1 className="pageTitle">Sign In</h1>
      <p className="tagline">Authenticate with your passkey</p>

      <div className="card">
        <div className="formGrid">
          <label>
            Username (optional)
            <input
              className="textInput"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username to filter credentials"
              autoComplete="username webauthn"
              disabled={loading}
            />
          </label>
        </div>

        {error && (
          <p className="errorText" style={{ marginTop: "1rem" }}>
            {error}
          </p>
        )}

        <div className="buttonRow" style={{ marginTop: "1.25rem" }}>
          <button
            type="button"
            className="button"
            onClick={() => void handleLogin(true)}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in with Passkey"}
          </button>
          <button
            type="button"
            className="button buttonSecondary"
            onClick={() =>
              navigate(`/register?returnTo=${encodeURIComponent(returnTo)}`)
            }
            disabled={loading}
          >
            Create an account
          </button>
        </div>
      </div>

      {devLoginEnabled && (
        <div className="card">
          <h2>Developer quick login</h2>
          <p className="muted">
            Local-only passwordless sign-in for testing multiplayer. Enter a
            username above and continue — the account is created on demand. Not
            available in deployed environments.
          </p>
          <div className="buttonRow" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="button buttonSecondary"
              onClick={() => void handleDevLogin()}
              disabled={loading || username.trim().length === 0}
            >
              {loading ? "Signing in…" : "Dev login (no passkey)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
