import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface NetworkUser {
  id: string;
  username: string;
  displayName: string | null;
  callsign: string | null;
  role: string | null;
  avatarUrl: string | null;
  isFollowing: boolean;
  isSelf: boolean;
}

interface NetworkListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  mode: "followers" | "following";
  userNameTitle: string;
}

export default function NetworkListModal({
  isOpen,
  onClose,
  userId,
  mode,
  userNameTitle,
}: NetworkListModalProps) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<NetworkUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoster = async () => {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        mode === "followers"
          ? `/api/social/users/${userId}/followers`
          : `/api/social/users/${userId}/following`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to retrieve operator roster.");
      const data: NetworkUser[] = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRoster();
    }
  }, [isOpen, userId, mode]);

  const handleToggleFollow = async (targetId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === targetId ? { ...u, isFollowing: !u.isFollowing } : u)),
    );

    try {
      await fetch(`/api/social/users/${targetId}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("Follow toggle error:", err);
      fetchRoster();
    }
  };

  const handleSelectUser = (username: string) => {
    onClose();
    navigate(`/profile/${username}`);
  };

  if (!isOpen) return null;

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.card}>
        <div style={modalStyles.header}>
          <div>
            <div style={modalStyles.tag}>Network Roster</div>
            <h3 style={modalStyles.title}>
              {userNameTitle}: {mode === "followers" ? "Followers" : "Following"}
            </h3>
          </div>
          <button onClick={onClose} style={modalStyles.closeBtn}>
            ✕
          </button>
        </div>

        <div style={modalStyles.body}>
          {loading ? (
            <div style={modalStyles.centerNotice}>Scanning investigator frequency roster...</div>
          ) : error ? (
            <div style={modalStyles.errorText}>{error}</div>
          ) : users.length === 0 ? (
            <div style={modalStyles.centerNotice}>
              {mode === "followers"
                ? "No operators currently monitor this frequency."
                : "This investigator is not currently monitoring any units."}
            </div>
          ) : (
            users.map((u) => {
              const name = u.displayName || u.username;
              const initials = name.slice(0, 2).toUpperCase();

              return (
                <div key={u.id} style={modalStyles.userRow}>
                  <div onClick={() => handleSelectUser(u.username)} style={modalStyles.userInfo}>
                    <div style={modalStyles.avatar}>{initials}</div>
                    <div>
                      <div style={modalStyles.nameLine}>
                        <span style={modalStyles.displayName}>{name}</span>
                        {u.callsign && (
                          <span style={modalStyles.callsignBadge}>[{u.callsign}]</span>
                        )}
                      </div>
                      <div style={modalStyles.handle}>
                        @{u.username} // {u.role || "Investigator"}
                      </div>
                    </div>
                  </div>

                  {!u.isSelf && (
                    <button
                      onClick={() => handleToggleFollow(u.id)}
                      style={{
                        ...modalStyles.actionBtn,
                        backgroundColor: u.isFollowing
                          ? "var(--bg-surface-elevated)"
                          : "transparent",
                        color: u.isFollowing ? "var(--text-muted)" : "var(--accent-primary)",
                        borderColor: u.isFollowing
                          ? "var(--border-default)"
                          : "var(--accent-primary)",
                      }}
                    >
                      {u.isFollowing ? "Following" : "+ Follow"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    zIndex: 120,
  },
  card: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    maxWidth: "480px",
    width: "100%",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem 1.25rem",
    borderBottom: "1px solid var(--border-default)",
  },
  tag: {
    fontSize: "0.65rem",
    color: "var(--accent-primary)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  title: {
    fontSize: "1.05rem",
    fontWeight: 700,
    margin: "2px 0 0 0",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: "4px",
  },
  body: {
    padding: "10px 14px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  centerNotice: {
    textAlign: "center",
    padding: "2rem 1rem",
    color: "var(--text-muted)",
    fontSize: "0.85rem",
  },
  errorText: {
    color: "var(--accent-rose)",
    textAlign: "center",
    padding: "1rem",
    fontSize: "0.85rem",
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: "6px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    flexGrow: 1,
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "0.8rem",
    color: "var(--accent-primary)",
    flexShrink: 0,
  },
  nameLine: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  displayName: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  callsignBadge: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  handle: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  actionBtn: {
    border: "1px solid",
    borderRadius: "4px",
    padding: "4px 10px",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
