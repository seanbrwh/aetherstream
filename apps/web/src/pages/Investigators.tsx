import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface InvestigatorRecord {
  id: string;
  username: string;
  displayName: string | null;
  callsign: string | null;
  role: string | null;
  bio: string | null;
  location: string | null;
  gearLoadout: string | null;
  investigationsCount: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing: boolean;
}

export default function Investigators() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [investigators, setInvestigators] = useState<InvestigatorRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social/investigators", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not access station directory.");
      const data: InvestigatorRecord[] = await res.json();
      setInvestigators(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectory();
  }, [token]);

  const handleToggleFollow = async (targetId: string) => {
    setInvestigators((prev) =>
      prev.map((inv) =>
        inv.id === targetId
          ? {
              ...inv,
              isFollowing: !inv.isFollowing,
              followersCount: !inv.isFollowing
                ? inv.followersCount + 1
                : Math.max(0, inv.followersCount - 1),
            }
          : inv,
      ),
    );

    try {
      await fetch(`/api/social/users/${targetId}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("Follow toggle error:", err);
      fetchDirectory();
    }
  };

  const filteredList = investigators.filter((inv) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      inv.username.toLowerCase().includes(query) ||
      (inv.callsign && inv.callsign.toLowerCase().includes(query)) ||
      (inv.displayName && inv.displayName.toLowerCase().includes(query)) ||
      (inv.gearLoadout && inv.gearLoadout.toLowerCase().includes(query)) ||
      (inv.location && inv.location.toLowerCase().includes(query));

    const matchesRole = roleFilter === "ALL" || (inv.role && inv.role.toUpperCase() === roleFilter);

    return matchesSearch && matchesRole;
  });

  const uniqueRoles = Array.from(
    new Set(investigators.map((i) => (i.role || "Field Investigator").toUpperCase())),
  );

  return (
    <div style={dirStyles.container}>
      {/* HEADER */}
      <div style={dirStyles.header}>
        <div>
          <div style={dirStyles.tag}>Station Network Registry</div>
          <h1 style={dirStyles.title}>Investigator Directory</h1>
          <p style={dirStyles.subtitle}>
            Browse registered field units, review active gear configurations, and monitor research
            frequencies.
          </p>
        </div>
      </div>

      {/* FILTER & SEARCH STRIP */}
      <div style={dirStyles.filterBar}>
        <input
          type="text"
          placeholder="Search by callsign, name, sector, or hardware loadout..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={dirStyles.searchInput}
        />

        <div style={dirStyles.roleFilterGroup}>
          <button
            onClick={() => setRoleFilter("ALL")}
            style={{
              ...dirStyles.roleFilterBtn,
              backgroundColor: roleFilter === "ALL" ? "var(--accent-primary)" : "var(--bg-surface)",
              color: roleFilter === "ALL" ? "#ffffff" : "var(--text-secondary)",
            }}
          >
            All Roles ({investigators.length})
          </button>
          {uniqueRoles.map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              style={{
                ...dirStyles.roleFilterBtn,
                backgroundColor:
                  roleFilter === role ? "var(--accent-primary)" : "var(--bg-surface)",
                color: roleFilter === role ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={dirStyles.errorBanner}>{error}</div>}

      {/* DIRECTORY GRID */}
      {loading ? (
        <div style={dirStyles.loadingNotice}>Scanning operator frequencies...</div>
      ) : filteredList.length === 0 ? (
        <div style={dirStyles.emptyNotice}>
          No investigators found matching your filter criteria.
        </div>
      ) : (
        <div style={dirStyles.grid}>
          {filteredList.map((inv) => {
            const name = inv.displayName || inv.username;
            const initials = name.slice(0, 2).toUpperCase();

            return (
              <div key={inv.id} style={dirStyles.card}>
                <div style={dirStyles.cardTop}>
                  <div
                    onClick={() => navigate(`/profile/${inv.username}`)}
                    style={dirStyles.avatar}
                    title="View public dossier"
                  >
                    {initials}
                  </div>

                  <div style={dirStyles.cardIdentity}>
                    <div style={dirStyles.nameLine}>
                      <span
                        onClick={() => navigate(`/profile/${inv.username}`)}
                        style={dirStyles.displayName}
                      >
                        {name}
                      </span>
                      {inv.callsign && <span style={dirStyles.callsignPill}>[{inv.callsign}]</span>}
                    </div>
                    <div style={dirStyles.handleText}>@{inv.username}</div>
                    <div style={dirStyles.roleText}>{inv.role || "Field Investigator"}</div>
                  </div>
                </div>

                {inv.location && <div style={dirStyles.locationBadge}>Base: {inv.location}</div>}

                {inv.bio && <p style={dirStyles.bioText}>{inv.bio}</p>}

                {/* GEAR LOADOUT PREVIEW */}
                <div style={dirStyles.gearBox}>
                  <span style={dirStyles.gearLabel}>Hardware Rig: </span>
                  <span style={dirStyles.gearContent}>
                    {inv.gearLoadout || "Standard AetherStream multi-modal rig"}
                  </span>
                </div>

                {/* METRICS ROW */}
                <div style={dirStyles.statsRow}>
                  <div style={dirStyles.stat}>
                    <strong>{inv.followersCount}</strong>
                    <span>Followers</span>
                  </div>
                  <div style={dirStyles.stat}>
                    <strong>{inv.postsCount}</strong>
                    <span>Dispatches</span>
                  </div>
                  <div style={dirStyles.stat}>
                    <strong>{inv.investigationsCount}</strong>
                    <span>Deployments</span>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div style={dirStyles.actionRow}>
                  <button
                    onClick={() => handleToggleFollow(inv.id)}
                    style={{
                      ...dirStyles.followBtn,
                      backgroundColor: inv.isFollowing
                        ? "var(--bg-surface-elevated)"
                        : "var(--accent-primary)",
                      color: inv.isFollowing ? "var(--text-secondary)" : "#ffffff",
                      borderColor: inv.isFollowing
                        ? "var(--border-default)"
                        : "var(--accent-primary)",
                    }}
                  >
                    {inv.isFollowing ? "Following" : "+ Follow Unit"}
                  </button>

                  <button
                    onClick={() => navigate(`/profile/${inv.username}`)}
                    style={dirStyles.dossierBtn}
                  >
                    View Dossier
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const dirStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    width: "100%",
  },
  header: {
    borderBottom: "1px solid var(--border-default)",
    paddingBottom: "1rem",
  },
  tag: {
    fontSize: "0.7rem",
    color: "var(--accent-primary)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  title: {
    fontSize: "1.4rem",
    fontWeight: 700,
    margin: "2px 0 4px 0",
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    margin: 0,
  },
  filterBar: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  searchInput: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    boxSizing: "border-box",
  },
  roleFilterGroup: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  roleFilterBtn: {
    padding: "6px 12px",
    border: "1px solid var(--border-default)",
    borderRadius: "4px",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    color: "var(--accent-rose)",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "0.85rem",
  },
  loadingNotice: {
    textAlign: "center",
    padding: "3rem",
    color: "var(--text-muted)",
  },
  emptyNotice: {
    textAlign: "center",
    padding: "3rem",
    backgroundColor: "var(--bg-surface)",
    border: "1px dashed var(--border-default)",
    borderRadius: "8px",
    color: "var(--text-muted)",
    fontSize: "0.85rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: "1.25rem",
  },
  card: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow: "var(--card-shadow)",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  avatar: {
    width: "46px",
    height: "46px",
    borderRadius: "50%",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    cursor: "pointer",
    flexShrink: 0,
  },
  cardIdentity: {
    flexGrow: 1,
    minWidth: 0,
  },
  nameLine: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  displayName: {
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: "pointer",
    color: "var(--text-primary)",
  },
  callsignPill: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    padding: "1px 6px",
    borderRadius: "4px",
    fontFamily: "monospace",
  },
  handleText: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  roleText: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    fontWeight: 500,
  },
  locationBadge: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "3px 8px",
    borderRadius: "4px",
    width: "fit-content",
    border: "1px solid var(--border-subtle)",
  },
  bioText: {
    fontSize: "0.85rem",
    lineHeight: 1.4,
    color: "var(--text-secondary)",
    margin: 0,
  },
  gearBox: {
    fontSize: "0.8rem",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    lineHeight: 1.4,
  },
  gearLabel: {
    fontWeight: 700,
    color: "var(--accent-primary)",
  },
  gearContent: {
    color: "var(--text-primary)",
  },
  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderTop: "1px solid var(--border-subtle)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: "0.7rem",
    color: "var(--text-muted)",
  },
  actionRow: {
    display: "flex",
    gap: "8px",
    marginTop: "4px",
  },
  followBtn: {
    flexGrow: 1,
    padding: "8px",
    borderRadius: "6px",
    border: "1px solid",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  dossierBtn: {
    padding: "8px 12px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
};
