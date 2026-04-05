import { startAuthentication } from "@simplewebauthn/browser";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLoginOptions, fetchLoginVerify } from "../api/auth";
import { useAuth } from "../components/AuthContext";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
        navigate("/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Login failed");
      } finally {
        setLoading(false);
      }
    },
    [username, login, navigate],
  );

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
            onClick={() => navigate("/register")}
            disabled={loading}
          >
            Create an account
          </button>
        </div>
      </div>
    </div>
  );
}
