import { startRegistration } from "@simplewebauthn/browser";
import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchRegisterOptions, fetchRegisterVerify } from "../api/auth";
import { useAuth } from "../components/AuthContext";

const getSafeReturnTo = (value: string | null) =>
  value?.startsWith("/") && !value.startsWith("//") ? value : "/";

export function RegisterPage() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));

  const handleRegister = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const options = await fetchRegisterOptions(username);
      const credential = await startRegistration({ optionsJSON: options });
      const session = await fetchRegisterVerify(username, credential);
      login(session.token, session.userId, session.username, session.expiresAt);
      navigate(returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }, [username, login, navigate, returnTo]);

  return (
    <div className="authPage">
      <header className="pageHeader">
        <h1 className="pageTitle">Create Account</h1>
        <p className="tagline">Register with a passkey - no password needed.</p>
      </header>

      <div className="card">
        <div className="formGrid">
          <label>
            Username
            <input
              className="textInput"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              minLength={3}
              maxLength={32}
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
            onClick={() => void handleRegister()}
            disabled={loading || username.length < 3}
          >
            {loading ? "Registering…" : "Register with Passkey"}
          </button>
          <button
            type="button"
            className="button buttonSecondary"
            onClick={() =>
              navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
            }
            disabled={loading}
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
