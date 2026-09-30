import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getSocket } from "../lib/socket";
import MessengerConsole from "./MessengerConsole";

export default function Layout() {
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isMessengerOpenRef = useRef(isMessengerOpen);
  const navigate = useNavigate();

  useEffect(() => {
    isMessengerOpenRef.current = isMessengerOpen;
  }, [isMessengerOpen]);

  // Persistent Socket Room Assignment
  useEffect(() => {
    if (!user?.id || !token) return;

    const socket = getSocket();

    const joinRoom = () => {
      console.log("[Layout] Registering investigator room:", user.id);
      socket.emit("join_user", user.id);
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on("connect", joinRoom);

    const handleIncomingMessage = (msg: any) => {
      if (msg.receiverId === user.id && !isMessengerOpenRef.current) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    socket.on("new_direct_message", handleIncomingMessage);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("new_direct_message", handleIncomingMessage);
    };
  }, [user?.id, token]);

  useEffect(() => {
    if (!token) return;

    const fetchInitialUnread = async () => {
      try {
        const res = await fetch("/api/social/conversations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const conversations = await res.json();
          const total = conversations.reduce((acc: number, c: any) => acc + c.unreadCount, 0);
          setUnreadCount(total);
        }
      } catch (err) {
        console.error("Initial unread check error:", err);
      }
    };

    fetchInitialUnread();
  }, [token]);

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
            {unreadCount > 0 && <span style={layoutStyles.topBarUnreadDot}>●</span>}
          </button>

          <div style={layoutStyles.brandWrapper}>
            <span style={layoutStyles.brandName}>AetherStream</span>
            <span style={layoutStyles.brandTag}>Research Unit</span>
          </div>
        </div>

        <div style={layoutStyles.navRight}>
          <button
            onClick={() => setIsMessengerOpen(true)}
            style={layoutStyles.quickCommsButton}
            aria-label="Open Field Messenger"
          >
            <span>✉ Field Comms</span>
            {unreadCount > 0 && <span style={layoutStyles.unreadBadgePill}>{unreadCount}</span>}
          </button>

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

            {/* OPERATOR CARD */}
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

              <button
                onClick={() => {
                  closeDrawer();
                  setIsMessengerOpen(true);
                }}
                style={layoutStyles.sidebarMessengerBtn}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={layoutStyles.navIcon}>✉</span>
                  <span>Field Messenger</span>
                </div>
                {unreadCount > 0 && <span style={layoutStyles.unreadBadgePill}>{unreadCount}</span>}
              </button>
            </nav>

            <div style={layoutStyles.drawerFooter}>
              <button onClick={handleLogout} style={layoutStyles.logoutButton}>
                Sign Out
              </button>
            </div>
          </aside>
        </>
      )}

      {/* MESSENGER FIELD CONSOLE MODAL */}
      <MessengerConsole
        isOpen={isMessengerOpen}
        onClose={() => setIsMessengerOpen(false)}
        onUnreadChange={(count) => setUnreadCount(count)}
      />

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
    position: "relative",
  },
  topBarUnreadDot: {
    color: "var(--accent-rose)",
    fontSize: "0.8rem",
    lineHeight: 1,
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
  quickCommsButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "var(--bg-surface-elevated)",
    color: "var(--accent-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "0.8rem",
    minHeight: "40px",
    fontWeight: 600,
  },
  unreadBadgePill: {
    backgroundColor: "var(--accent-rose)",
    color: "#ffffff",
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: "10px",
    lineHeight: 1,
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
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
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
  sidebarMessengerBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    color: "var(--accent-primary)",
    background: "transparent",
    border: "none",
    fontSize: "0.9rem",
    borderRadius: "6px",
    fontWeight: 600,
    minHeight: "44px",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
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
