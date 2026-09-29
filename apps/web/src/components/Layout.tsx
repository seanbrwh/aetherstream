import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();

  const navStyle = (path: string) => ({
    padding: "10px 15px",
    color: location.pathname === path ? "#000" : "#00ffcc",
    background: location.pathname === path ? "#00ffcc" : "transparent",
    textDecoration: "none",
    fontWeight: "bold",
    border: "1px solid #00ffcc",
  });

  return (
    <div
      style={{
        background: "#1a1a1a",
        minHeight: "100vh",
        color: "#00ffcc",
        fontFamily: "monospace",
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 2rem",
          borderBottom: "1px solid #333",
          backgroundColor: "#0f0f0f",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>AetherStream</h1>

        <nav style={{ display: "flex", gap: "10px" }}>
          <Link to="/dashboard" style={navStyle("/dashboard")}>
            TELEMETRY
          </Link>
          <Link to="/feed" style={navStyle("/feed")}>
            FEED
          </Link>
          <Link to="/profile" style={navStyle("/profile")}>
            PROFILE
          </Link>
        </nav>

        <button
          onClick={logout}
          style={{
            padding: "8px 16px",
            background: "#ff4444",
            color: "#000",
            cursor: "pointer",
            border: "none",
            fontWeight: "bold",
          }}
        >
          LOGOUT
        </button>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
