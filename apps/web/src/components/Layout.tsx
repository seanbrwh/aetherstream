import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getSocket } from "../lib/socket";
import DockedMessenger from "./DockedMessenger";
import CreateSquadModal from "./CreateSquadModal";

interface OnlineOperator {
  userId: string;
  socketId: string;
  username: string;
  displayName: string | null;
  callsign: string | null;
  role: string | null;
  status: "active" | "idle";
  lastActivity: number;
}

interface AlertNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

interface SquadItem {
  id: string;
  name: string;
  callsign: string;
  mission: string | null;
  members: Array<{ id: string; role: string; user: any }>;
  _count?: { members: number; messages: number };
}

export default function Layout() {
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [targetPartner, setTargetPartner] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Field Squad State
  const [squadList, setSquadList] = useState<OnlineOperator[]>([]);
  const [mySquads, setMySquads] = useState<SquadItem[]>([]);
  const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);

  // Alert Notifications State
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [isAlertMenuOpen, setIsAlertMenuOpen] = useState(false);
  const alertMenuRef = useRef<HTMLDivElement>(null);

  // Fetch squad affiliations
  const fetchMySquads = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/social/squads/my", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: SquadItem[] = await res.json();
        setMySquads(data);

        // Bind socket to each active squad room
        const socket = getSocket();
        data.forEach((sq) => {
          socket.emit("join_squad", sq.id);
        });
      }
    } catch (err) {
      console.error("Failed to retrieve squad memberships:", err);
    }
  };

  // Initialize socket presence and live alerts
  useEffect(() => {
    if (!user?.id || !token) return;

    const socket = getSocket();

    const joinSession = () => {
      socket.emit("join_user", user.id);
    };

    if (socket.connected) {
      joinSession();
    }
    socket.on("connect", joinSession);

    // Track active operators
    socket.on("operators_online", (operators: OnlineOperator[]) => {
      setSquadList(operators.filter((op) => op.userId !== user.id));
    });

    // Inbound Direct Message alert
    socket.on("new_direct_message", (msg) => {
      if (msg.receiverId === user.id) {
        setUnreadCount((prev) => prev + 1);
      }
    });

    // Inbound Mention or Endorsement Notification
    socket.on("new_notification", (notif: AlertNotification) => {
      setNotifications((prev) => [notif, ...prev]);
    });

    // Inbound Live Hardware Anomaly
    socket.on("hardware_anomaly_alert", (anomalyNotif: AlertNotification) => {
      setNotifications((prev) => [anomalyNotif, ...prev]);
    });

    return () => {
      socket.off("connect", joinSession);
      socket.off("operators_online");
      socket.off("new_direct_message");
      socket.off("new_notification");
      socket.off("hardware_anomaly_alert");
    };
  }, [user?.id, token]);

  // Initial fetch of unread messages, squads, and notifications
  useEffect(() => {
    if (!token) return;

    const fetchInitialData = async () => {
      try {
        const [convoRes, notifRes] = await Promise.all([
          fetch("/api/social/conversations", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/social/notifications", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (convoRes.ok) {
          const convos = await convoRes.json();
          const total = convos.reduce((acc: number, c: any) => acc + c.unreadCount, 0);
          setUnreadCount(total);
        }

        if (notifRes.ok) {
          const notifs = await notifRes.json();
          setNotifications(notifs);
        }

        fetchMySquads();
      } catch (err) {
        console.error("Initial data fetch error:", err);
      }
    };

    fetchInitialData();
  }, [token]);

  // Dismiss notification popup on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (alertMenuRef.current && !alertMenuRef.current.contains(e.target as Node)) {
        setIsAlertMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleMarkNotificationsRead = async () => {
    try {
      await fetch("/api/social/notifications/read", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark notifications read:", err);
    }
  };

  const handleOpenDirectCommWithOperator = (operator: OnlineOperator) => {
    setIsDrawerOpen(false);
    setTargetPartner({
      id: operator.userId,
      username: operator.username,
      displayName: operator.displayName,
      callsign: operator.callsign,
      role: operator.role,
    });
    setIsMessengerOpen(true);
  };

  const unreadAlertsCount = notifications.filter((n) => !n.read).length;

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
          {/* ACTIVITY AND ANOMALY ALERT BELL */}
          <div style={{ position: "relative" }} ref={alertMenuRef}>
            <button
              onClick={() => setIsAlertMenuOpen(!isAlertMenuOpen)}
              style={layoutStyles.alertBellBtn}
              title="Station Activity & Anomaly Alerts"
            >
              <span style={{ fontSize: "1.05rem" }}>🔔</span>
              {unreadAlertsCount > 0 && (
                <span style={layoutStyles.alertBellBadge}>{unreadAlertsCount}</span>
              )}
            </button>

            {/* ALERT DROPDOWN */}
            {isAlertMenuOpen && (
              <div style={layoutStyles.alertDropdown}>
                <div style={layoutStyles.alertDropdownHeader}>
                  <span style={layoutStyles.alertDropdownTitle}>Activity & Anomalies</span>
                  {unreadAlertsCount > 0 && (
                    <button onClick={handleMarkNotificationsRead} style={layoutStyles.markReadBtn}>
                      Clear Alerts
                    </button>
                  )}
                </div>

                <div style={layoutStyles.alertList}>
                  {notifications.length === 0 ? (
                    <div style={layoutStyles.emptyAlertNotice}>
                      No active alerts or anomalous triggers recorded.
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const isAnomaly = notif.type === "ANOMALY";
                      return (
                        <div
                          key={notif.id}
                          onClick={() => {
                            if (notif.link) {
                              setIsAlertMenuOpen(false);
                              navigate(notif.link);
                            }
                          }}
                          style={{
                            ...layoutStyles.alertItem,
                            backgroundColor: notif.read
                              ? "transparent"
                              : isAnomaly
                                ? "rgba(239, 68, 68, 0.08)"
                                : "var(--bg-surface-elevated)",
                            cursor: notif.link ? "pointer" : "default",
                          }}
                        >
                          <div style={layoutStyles.alertTopRow}>
                            <span
                              style={{
                                ...layoutStyles.alertTag,
                                color: isAnomaly ? "var(--accent-rose)" : "var(--accent-primary)",
                              }}
                            >
                              {notif.type}
                            </span>
                            <span style={layoutStyles.alertTime}>
                              {new Date(notif.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div style={layoutStyles.alertItemTitle}>{notif.title}</div>
                          <div style={layoutStyles.alertItemContent}>{notif.content}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* DOCKED MESSENGER TRIGGER */}
          <button
            onClick={() => setIsMessengerOpen(!isMessengerOpen)}
            style={layoutStyles.quickCommsButton}
            aria-label="Toggle Field Messenger"
          >
            <span>✉ Field Comms</span>
            {unreadCount > 0 && <span style={layoutStyles.unreadBadgePill}>{unreadCount}</span>}
          </button>

          <button onClick={toggleTheme} style={layoutStyles.themeToggle} aria-label="Toggle Theme">
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      {/* SIDEBAR DRAWER */}
      {isDrawerOpen && (
        <>
          <div onClick={closeDrawer} style={layoutStyles.backdrop} />
          <aside style={layoutStyles.drawer}>
            <div style={layoutStyles.drawerHeader}>
              <div>
                <div style={layoutStyles.drawerTitle}>Station Control Rail</div>
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
              <div style={layoutStyles.operatorLabel}>Active Station Lead</div>
              <div style={layoutStyles.operatorIdentity}>{getIdentLabel()}</div>
              <div style={layoutStyles.operatorRole}>{user?.role || "Field Researcher"}</div>
              <div style={layoutStyles.operatorMeta}>Port 8081 Hardware Connected</div>
            </div>

            {/* MAIN NAVIGATION */}
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
                to="/investigators"
                onClick={closeDrawer}
                style={({ isActive }) => ({
                  ...layoutStyles.navLink,
                  ...(isActive ? layoutStyles.navLinkActive : {}),
                })}
              >
                <span style={layoutStyles.navIcon}>📡</span>
                <span>Station Directory</span>
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
                <span>My Credentials Dossier</span>
              </NavLink>
            </nav>

            {/* ACTIVE FIELD SQUAD SECTION WITH CREATE / JOIN ACTION */}
            <div style={layoutStyles.squadSection}>
              <div style={layoutStyles.squadHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={layoutStyles.squadTitle}>Field Squads</span>
                  <span style={layoutStyles.squadCountPill}>{squadList.length + 1} Online</span>
                </div>
                {/* TRIGGER BUTTON TO ACCESS CREATE / JOIN SQUAD MODAL */}
                <button
                  onClick={() => setIsSquadModalOpen(true)}
                  style={layoutStyles.formSquadBtn}
                  title="Form or join a field squad"
                >
                  + Squad
                </button>
              </div>

              {/* LIST OF CURRENT SQUADS */}
              {mySquads.map((sq) => (
                <div
                  key={sq.id}
                  onClick={() => {
                    closeDrawer();
                    navigate(`/squads/${sq.id}`);
                  }}
                  style={{ ...layoutStyles.squadBadgeCard, cursor: "pointer" }}
                  title="Open Squad Expedition Hub"
                >
                  <div style={layoutStyles.squadBadgeTop}>
                    <span style={layoutStyles.squadBadgeName}>{sq.name}</span>
                    <span style={layoutStyles.squadCodePill}>[{sq.callsign}]</span>
                  </div>
                  {sq.mission && <div style={layoutStyles.squadMissionText}>{sq.mission}</div>}
                  <div style={layoutStyles.squadMetaLine}>
                    <span>{sq.members?.length || 1} Registered Members (Open Hub ↗)</span>
                  </div>
                </div>
              ))}

              {/* LIVE ONLINE OPERATORS */}
              <div style={layoutStyles.squadRosterList}>
                {/* Self Status */}
                <div style={layoutStyles.squadOperatorItem}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={layoutStyles.statusDotActive} title="Active Monitoring" />
                    <div>
                      <div style={layoutStyles.squadCallsign}>
                        {user?.callsign ? `[${user.callsign}] (You)` : `@${user?.username}`}
                      </div>
                      <div style={layoutStyles.squadRole}>{user?.role || "Station Lead"}</div>
                    </div>
                  </div>
                </div>

                {/* Remote Field Operators */}
                {squadList.length === 0 ? (
                  <div style={layoutStyles.squadEmptyPrompt}>
                    No other operators currently deployed.
                  </div>
                ) : (
                  squadList.map((op) => (
                    <div
                      key={op.userId}
                      onClick={() => handleOpenDirectCommWithOperator(op)}
                      style={layoutStyles.squadOperatorItemInteractive}
                      title="Click to dispatch direct message"
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={
                            op.status === "active"
                              ? layoutStyles.statusDotActive
                              : layoutStyles.statusDotIdle
                          }
                          title={op.status === "active" ? "Active Monitoring" : "Idle"}
                        />
                        <div>
                          <div style={layoutStyles.squadCallsign}>
                            {op.callsign ? `[${op.callsign}]` : `@${op.username}`}
                          </div>
                          <div style={layoutStyles.squadRole}>{op.role || "Field Operator"}</div>
                        </div>
                      </div>

                      <span style={layoutStyles.commActionIcon}>✉</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={layoutStyles.drawerFooter}>
              <button onClick={handleLogout} style={layoutStyles.logoutButton}>
                Sign Out
              </button>
            </div>
          </aside>
        </>
      )}

      {/* DOCKED MESSENGER */}
      <DockedMessenger
        isOpen={isMessengerOpen}
        onClose={() => setIsMessengerOpen(false)}
        onUnreadChange={(count) => setUnreadCount(count)}
        initialPartner={targetPartner}
      />

      {/* MODAL TO CREATE OR JOIN A FIELD SQUAD */}
      <CreateSquadModal
        isOpen={isSquadModalOpen}
        onClose={() => setIsSquadModalOpen(false)}
        onSquadCreatedOrJoined={fetchMySquads}
      />

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
    gap: "8px",
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
  alertBellBtn: {
    position: "relative",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "8px 10px",
    cursor: "pointer",
    minHeight: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  alertBellBadge: {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    backgroundColor: "var(--accent-rose)",
    color: "#ffffff",
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: "10px",
    lineHeight: 1,
  },
  alertDropdown: {
    position: "absolute",
    top: "48px",
    right: 0,
    width: "320px",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)",
    zIndex: 150,
    overflow: "hidden",
  },
  alertDropdownHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    backgroundColor: "var(--bg-surface-elevated)",
  },
  alertDropdownTitle: {
    fontSize: "0.8rem",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--text-primary)",
  },
  markReadBtn: {
    background: "transparent",
    border: "none",
    color: "var(--accent-primary)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  alertList: {
    maxHeight: "340px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  },
  emptyAlertNotice: {
    padding: "2rem 1rem",
    textAlign: "center",
    fontSize: "0.8rem",
    color: "var(--text-muted)",
  },
  alertItem: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  alertTopRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.65rem",
    fontWeight: 700,
  },
  alertTag: {
    textTransform: "uppercase",
  },
  alertTime: {
    color: "var(--text-muted)",
    fontWeight: 400,
  },
  alertItemTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  alertItemContent: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    lineHeight: 1.3,
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
    width: "min(320px, 85vw)",
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
    margin: "0.75rem 1rem 0.5rem 1rem",
    padding: "0.75rem",
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
    padding: "0.5rem",
    borderBottom: "1px solid var(--border-subtle)",
  },
  navLink: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: "0.85rem",
    borderRadius: "6px",
    fontWeight: 500,
    minHeight: "40px",
  },
  navLinkActive: {
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    fontWeight: 600,
  },
  navIcon: {
    fontSize: "1rem",
  },
  squadSection: {
    flexGrow: 1,
    overflowY: "auto",
    padding: "0.75rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  squadHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "4px",
  },
  squadTitle: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  squadCountPill: {
    fontSize: "0.65rem",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--accent-emerald)",
    border: "1px solid var(--border-default)",
    padding: "1px 6px",
    borderRadius: "10px",
    fontWeight: 700,
  },
  formSquadBtn: {
    background: "var(--bg-surface-elevated)",
    color: "var(--accent-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  activeSquadCards: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  squadBadgeCard: {
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  squadBadgeTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  squadBadgeName: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  squadCodePill: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  squadMissionText: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    lineHeight: 1.3,
  },
  squadMetaLine: {
    fontSize: "0.65rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  squadRosterList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "4px",
  },
  squadOperatorItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 8px",
    backgroundColor: "var(--bg-surface-elevated)",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
  },
  squadOperatorItemInteractive: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 8px",
    backgroundColor: "var(--bg-surface-elevated)",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
  },
  statusDotActive: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "var(--accent-emerald)",
    display: "inline-block",
  },
  statusDotIdle: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "var(--accent-amber)",
    display: "inline-block",
  },
  squadCallsign: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "monospace",
  },
  squadRole: {
    fontSize: "0.65rem",
    color: "var(--text-muted)",
  },
  commActionIcon: {
    color: "var(--accent-primary)",
    fontSize: "0.8rem",
  },
  squadEmptyPrompt: {
    padding: "1rem",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "0.75rem",
    fontStyle: "italic",
  },
  drawerFooter: {
    padding: "0.75rem 1rem",
    borderTop: "1px solid var(--border-default)",
  },
  logoutButton: {
    width: "100%",
    padding: "8px",
    background: "var(--bg-surface-elevated)",
    color: "var(--accent-rose)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  contentArea: {
    flexGrow: 1,
    padding: "1.25rem",
    maxWidth: "1200px",
    width: "100%",
    margin: "0 auto",
  },
};
