import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (total: number) => {
    const hrs = Math.floor(total / 3600)
      .toString()
      .padStart(2, "0");
    const mins = Math.floor((total % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (total % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  };

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  const closeDrawer = () => setIsDrawerOpen(false);

  const getIdentLabel = () => {
    if (!user) return "Guest Investigator";
    if (user.callsign) return `[${user.callsign}] ${user.displayName || user.username}`;
    return user.displayName || user.username;
  };

  return (
    <div style={layoutStyles.container}>
      {/* PERSISTENT TOP BAR */}
      <header style={layoutStyles.topBar}>
        <div style={layoutStyles.navLeft}>
          <button
            onClick={() => setIsDrawerOpen(true)}
            style={layoutStyles.menuButton}
            aria-label="Open Navigation"
          >
            <span style={{ fontSize: "1.1rem", lineHeight: "1" }}>☰</span>
            <span style={layoutStyles.menuLabel}>Menu</span>
          </button>

          <div style={layoutStyles.brandWrapper}>
            <span style={layoutStyles.brandName}>AetherStream</span>
            <span style={layoutStyles.brandTag}>Research Unit</span>
          </div>
        </div>

        <div style={layoutStyles.navRight}>
          <div style={layoutStyles.sessionIndicator}>
            <span style={layoutStyles.statusDot}>●</span>
            <span style={layoutStyles.sessionTime}>{formatTimer(sessionSeconds)}</span>
          </div>

          <button onClick={toggleTheme} style={layoutStyles.themeToggle} aria-label="Toggle Theme">
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      {/* CONDITIONAL DRAWER */}
      {isDrawerOpen && (
        <>
          <div onClick={closeDrawer} style={layoutStyles.backdrop} />
          <aside style={layoutStyles.drawer}>
            <div style={layoutStyles.drawerHeader}>
              <div>
                <div style={layoutStyles.drawerTitle}>Navigation</div>
                <div style={layoutStyles.drawerSubtitle}>Field Research Suite</div>
              </div>
              <button
                onClick={closeDrawer}
                style={layoutStyles.closeButton}
                aria-label="Close Navigation"
              >
                ✕
              </button>
            </div>

            {/* OPERATOR CARD: SHOWS CALLSIGN & USERNAME ONLY */}
            <div style={layoutStyles.operatorInfo}>
              <div style={layoutStyles.operatorLabel}>Active Investigator</div>
              <div style={layoutStyles.operatorIdentity}>{getIdentLabel()}</div>
              <div style={layoutStyles.operatorRole}>{user?.role || "Field Researcher"}</div>
              <div style={layoutStyles.operatorMeta}>Port 8081 Ingestion Active</div>
            </div>

            {/* NAVIGATION LINKS */}
            <nav style={layoutStyles.navList}>
              <NavLink
                to="/"
                onClick={closeDrawer}
                style={({ isActive }) => ({
                  ...layoutStyles.navLink,
                  ...(isActive ? layoutStyles.navLinkActive : {}),
                })}
              >
                <span style={layoutStyles.navIcon}>⚡</span>
                <span>Live Telemetry</span>
              </NavLink>

              <NavLink
                to="/feed"
                onClick={closeDrawer}
                style={({ isActive }) => ({
                  ...layoutStyles.navLink,
                  ...(isActive ? layoutStyles.navLinkActive : {}),
                })}
              >
                <span style={layoutStyles.navIcon}>📋</span>
                <span>Investigation Feed</span>
              </NavLink>

              <NavLink
                to="/profile"
                onClick={closeDrawer}
                style={({ isActive }) => ({
                  ...layoutStyles.navLink,
                  ...(isActive ? layoutStyles.navLinkActive : {}),
                })}
              >
                <span style={layoutStyles.navIcon}>👤</span>
                <span>Investigator Dossier</span>
              </NavLink>
            </nav>

            <div style={layoutStyles.drawerFooter}>
              <button onClick={handleLogout} style={layoutStyles.logoutButton}>
                Sign Out
              </button>
            </div>
          </aside>
        </>
      )}

      {/* MAIN VIEWPORT */}
      <main style={layoutStyles.contentArea}>
        <Outlet />
      </main>
    </div>
  );
}

const layoutStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--bg-page)",
    color: "var(--text-primary)",
    width: "100%",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 1.25rem",
    backgroundColor: "var(--bg-surface)",
    borderBottom: "1px solid var(--border-default)",
    position: "sticky",
    top: 0,
    zIndex: 40,
    width: "100%",
  },
  navLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  menuButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "0.85rem",
    minHeight: "40px",
    fontWeight: 500,
  },
  menuLabel: {
    fontSize: "0.85rem",
  },
  brandWrapper: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
  },
  brandName: {
    fontSize: "1.05rem",
    fontWeight: 700,
    letterSpacing: "-0.3px",
    color: "var(--text-primary)",
  },
  brandTag: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    fontWeight: 500,
    display: "none",
  },
  sessionIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "6px 10px",
    minHeight: "40px",
  },
  statusDot: {
    color: "var(--accent-emerald)",
    fontSize: "0.75rem",
    lineHeight: 1,
  },
  sessionTime: {
    fontFamily: "monospace",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  themeToggle: {
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "0.8rem",
    minHeight: "40px",
    fontWeight: 500,
  },
  backdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 90,
  },
  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: "min(300px, 80vw)",
    backgroundColor: "var(--bg-surface)",
    borderRight: "1px solid var(--border-default)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
  },
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1.25rem 1rem",
    borderBottom: "1px solid var(--border-default)",
  },
  drawerTitle: {
    fontSize: "0.95rem",
    fontWeight: 600,
  },
  drawerSubtitle: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  closeButton: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "none",
    fontSize: "1.1rem",
    cursor: "pointer",
    padding: "6px",
    minHeight: "40px",
    minWidth: "40px",
  },
  operatorInfo: {
    margin: "1rem",
    padding: "0.85rem",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
  },
  operatorLabel: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  operatorIdentity: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    wordBreak: "break-all",
    marginTop: "2px",
  },
  operatorRole: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    fontWeight: 500,
    marginTop: "2px",
  },
  operatorMeta: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    marginTop: "6px",
  },
  navList: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "0.5rem 0.5rem",
    flexGrow: 1,
  },
  navLink: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: "0.9rem",
    borderRadius: "6px",
    fontWeight: 500,
    minHeight: "44px",
  },
  navLinkActive: {
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    fontWeight: 600,
  },
  navIcon: {
    fontSize: "1rem",
  },
  drawerFooter: {
    padding: "1rem",
    borderTop: "1px solid var(--border-default)",
  },
  logoutButton: {
    width: "100%",
    padding: "10px",
    background: "var(--bg-surface-elevated)",
    color: "var(--accent-rose)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    minHeight: "44px",
  },
  contentArea: {
    flexGrow: 1,
    padding: "1.25rem",
    maxWidth: "1200px",
    width: "100%",
    margin: "0 auto",
  },
};
