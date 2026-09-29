import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type AuthMode = "login" | "register" | "recover" | "reset";

export default function Auth() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      if (mode === "login" || mode === "register") {
        const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Authentication failed");

        if (mode === "login") {
          login(data.token);
          navigate("/dashboard");
        } else {
          setMessage("Registration successful! You may now log in.");
          setMode("login");
          setPassword("");
        }
      } else if (mode === "recover") {
        const response = await fetch("/api/auth/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Recovery failed");

        setMessage("If that email exists, a recovery token has been sent to your inbox.");
        setMode("reset");
      } else if (mode === "reset") {
        const response = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, resetToken, newPassword: password }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Reset failed");

        setMessage("Password reset successfully. You may now log in with your new password.");
        setMode("login");
        setPassword("");
        setResetToken("");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div
      style={{
        padding: "2rem",
        color: "#00ffcc",
        fontFamily: "monospace",
        maxWidth: "400px",
        margin: "0 auto",
        paddingTop: "10vh",
      }}
    >
      <h2>
        {mode === "login" && "AetherStream Login"}
        {mode === "register" && "Register Node Admin"}
        {mode === "recover" && "Account Recovery"}
        {mode === "reset" && "Reset Password"}
      </h2>

      {error && (
        <p style={{ color: "#ff4444", border: "1px solid #ff4444", padding: "10px" }}>{error}</p>
      )}
      {message && (
        <p style={{ color: "#00ffcc", border: "1px solid #00ffcc", padding: "10px" }}>{message}</p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "2rem" }}
      >
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            padding: "10px",
            background: "#0f0f0f",
            color: "#00ffcc",
            border: "1px solid #333",
          }}
        />

        {mode === "reset" && (
          <input
            type="text"
            placeholder="6-Character Token from Email"
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value.toUpperCase())}
            required
            maxLength={6}
            style={{
              padding: "10px",
              background: "#0f0f0f",
              color: "#00ffcc",
              border: "1px solid #333",
            }}
          />
        )}

        {mode !== "recover" && (
          <input
            type="password"
            placeholder={mode === "reset" ? "New Password" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: "10px",
              background: "#0f0f0f",
              color: "#00ffcc",
              border: "1px solid #333",
            }}
          />
        )}

        <button
          type="submit"
          style={{
            padding: "12px",
            background: "#00ffcc",
            color: "#000",
            cursor: "pointer",
            border: "none",
            fontWeight: "bold",
          }}
        >
          {mode === "login" && "AUTHENTICATE"}
          {mode === "register" && "REGISTER"}
          {mode === "recover" && "SEND RECOVERY LINK"}
          {mode === "reset" && "CONFIRM NEW PASSWORD"}
        </button>
      </form>

      <div
        style={{
          marginTop: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          textAlign: "center",
        }}
      >
        {mode === "login" ? (
          <>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
                setMessage("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "monospace",
              }}
            >
              Need an account? Register
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("recover");
                setError("");
                setMessage("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "monospace",
              }}
            >
              Forgot password?
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
              setMessage("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "monospace",
            }}
          >
            Back to Login
          </button>
        )}
      </div>
    </div>
  );
}
