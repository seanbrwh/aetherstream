import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Auth() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [callsign, setCallsign] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const bodyPayload = isRegister
        ? { email, password, username, callsign }
        : { identifier: email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed.");

      login(data.token, data.user);
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={authStyles.wrapper}>
      <div style={authStyles.card}>
        <div style={authStyles.header}>
          <div style={authStyles.brandTag}>AetherStream Research Suite</div>
          <h1 style={authStyles.title}>
            {isRegister ? "New Investigator Onboarding" : "Field Operator Access"}
          </h1>
          <div style={authStyles.subtitle}>
            {isRegister
              ? "Register credentials and claim your tactical callsign"
              : "Log in with your username or private email"}
          </div>
        </div>

        {error && (
          <div style={authStyles.errorAlert}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={authStyles.form}>
          <div>
            <label style={authStyles.label}>
              {isRegister ? "Private Account Email" : "Email or Username"}
            </label>
            <input
              type={isRegister ? "email" : "text"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isRegister ? "investigator@agency.org" : "Username or email"}
              style={authStyles.input}
            />
          </div>

          {isRegister && (
            <>
              <div>
                <label style={authStyles.label}>Public Username (Unique Handle)</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. ghosttracker99"
                  style={authStyles.input}
                />
              </div>

              <div>
                <label style={authStyles.label}>Tactical Callsign (Optional)</label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="e.g. SPECTER-1"
                  style={authStyles.input}
                />
              </div>
            </>
          )}

          <div>
            <label style={authStyles.label}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={authStyles.input}
            />
          </div>

          <button type="submit" disabled={loading} style={authStyles.submitBtn}>
            {loading
              ? "Authenticating..."
              : isRegister
                ? "Establish Credentials"
                : "Sign In to Station"}
          </button>
        </form>

        <div style={authStyles.switchSection}>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            style={authStyles.switchBtn}
          >
            {isRegister
              ? "Already credentialed? Sign in"
              : "Need investigator clearance? Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}

const authStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--bg-page)",
    padding: "1.5rem",
  },
  card: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "2rem",
    maxWidth: "440px",
    width: "100%",
    boxShadow: "var(--card-shadow)",
  },
  header: {
    marginBottom: "1.5rem",
  },
  brandTag: {
    fontSize: "0.75rem",
    color: "var(--accent-primary)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "4px",
  },
  title: {
    fontSize: "1.35rem",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.3px",
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    marginTop: "4px",
  },
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid var(--accent-rose)",
    color: "var(--accent-rose)",
    padding: "10px 12px",
    borderRadius: "6px",
    fontSize: "0.85rem",
    marginBottom: "1rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "4px",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    minHeight: "44px",
    boxSizing: "border-box",
  },
  submitBtn: {
    marginTop: "8px",
    padding: "12px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 600,
    minHeight: "44px",
  },
  switchSection: {
    marginTop: "1.25rem",
    textAlign: "center",
    borderTop: "1px solid var(--border-subtle)",
    paddingTop: "1rem",
  },
  switchBtn: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "none",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 500,
  },
};
