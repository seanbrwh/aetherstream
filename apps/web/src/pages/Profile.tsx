import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NetworkListModal from "../components/NetworkListModal";

interface UserProfileData {
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
  isFollowing?: boolean;
  isSelf?: boolean;
  createdAt: string;
  posts: Array<{
    id: string;
    content: string;
    location: string | null;
    imageUrl: string | null;
    audioUrl: string | null;
    createdAt: string;
  }>;
}

export default function Profile() {
  const { username } = useParams<{ username?: string }>();
  const { user: currentUser, token, updateUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Network modal state
  const [networkModalMode, setNetworkModalMode] = useState<"followers" | "following" | null>(null);

  // Edit form state
  const [displayName, setDisplayName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [gearLoadout, setGearLoadout] = useState("");
  const [investigationsCount, setInvestigationsCount] = useState<number>(0);

  const isOwnProfile = !username || username.toLowerCase() === currentUser?.username.toLowerCase();

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = isOwnProfile
        ? "/api/social/profile"
        : `/api/social/users/by-username/${username}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Investigator dossier could not be accessed.");
      }

      const data: UserProfileData = await res.json();
      setProfile(data);

      if (isOwnProfile) {
        setDisplayName(data.displayName || "");
        setCallsign(data.callsign || "");
        setRole(data.role || "Field Investigator");
        setBio(data.bio || "");
        setLocation(data.location || "");
        setGearLoadout(data.gearLoadout || "");
        setInvestigationsCount(data.investigationsCount || 0);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    setIsEditing(false);
  }, [username, token]);

  const handleToggleFollow = async () => {
    if (!profile) return;
    const nextState = !profile.isFollowing;

    setProfile({
      ...profile,
      isFollowing: nextState,
      followersCount: nextState
        ? profile.followersCount + 1
        : Math.max(0, profile.followersCount - 1),
    });

    try {
      await fetch(`/api/social/users/${profile.id}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("Follow toggle error:", err);
      fetchProfile();
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/social/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName,
          callsign,
          role,
          bio,
          location,
          gearLoadout,
          investigationsCount,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update dossier.");
      }

      const updated = await res.json();
      updateUser(updated);
      setIsEditing(false);
      fetchProfile();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div style={profileStyles.loadingContainer}>
        Retrieving tactical credentials and dispatches...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={profileStyles.errorCard}>
        <h3>Investigator Not Found</h3>
        <p>{error || "The requested operator file does not exist."}</p>
        <button onClick={() => navigate("/feed")} style={profileStyles.returnBtn}>
          Return to Feed
        </button>
      </div>
    );
  }

  const headerTitle = profile.displayName || profile.username;
  const initials = headerTitle.slice(0, 2).toUpperCase();

  return (
    <div style={profileStyles.container}>
      {/* DOSSIER HEADER */}
      <div style={profileStyles.headerCard}>
        <div style={profileStyles.headerTop}>
          <div style={profileStyles.avatarLarge}>{initials}</div>

          <div style={profileStyles.identityColumn}>
            <div style={profileStyles.nameRow}>
              <h1 style={profileStyles.displayNameTitle}>{headerTitle}</h1>
              {profile.callsign && (
                <span style={profileStyles.callsignPill}>[{profile.callsign}]</span>
              )}
            </div>

            <div style={profileStyles.handleText}>
              @{profile.username} // {profile.role || "Field Investigator"}
            </div>

            {profile.location && (
              <div style={profileStyles.locationText}>Operational Base: {profile.location}</div>
            )}
          </div>

          {/* ACTION BUTTONS (EDIT VS FOLLOW/MESSAGE) */}
          <div style={profileStyles.headerActionGroup}>
            {isOwnProfile ? (
              <button onClick={() => setIsEditing(!isEditing)} style={profileStyles.actionBtn}>
                {isEditing ? "Cancel Edit" : "Edit Credentials"}
              </button>
            ) : (
              <>
                <button
                  onClick={handleToggleFollow}
                  style={{
                    ...profileStyles.actionBtn,
                    backgroundColor: profile.isFollowing
                      ? "var(--bg-surface-elevated)"
                      : "var(--accent-primary)",
                    color: profile.isFollowing ? "var(--text-primary)" : "#ffffff",
                    borderColor: profile.isFollowing
                      ? "var(--border-default)"
                      : "var(--accent-primary)",
                  }}
                >
                  {profile.isFollowing ? "Following" : "+ Follow Unit"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* INTERACTIVE NETWORK STRIP */}
        <div style={profileStyles.statsStrip}>
          <div
            onClick={() => setNetworkModalMode("followers")}
            style={profileStyles.statItemInteractive}
          >
            <span style={profileStyles.statValue}>{profile.followersCount}</span>
            <span style={profileStyles.statLabel}>Followers ↗</span>
          </div>

          <div style={profileStyles.statDivider} />

          <div
            onClick={() => setNetworkModalMode("following")}
            style={profileStyles.statItemInteractive}
          >
            <span style={profileStyles.statValue}>{profile.followingCount}</span>
            <span style={profileStyles.statLabel}>Following ↗</span>
          </div>

          <div style={profileStyles.statDivider} />

          <div style={profileStyles.statItem}>
            <span style={profileStyles.statValue}>{profile.postsCount}</span>
            <span style={profileStyles.statLabel}>Dispatches</span>
          </div>

          <div style={profileStyles.statDivider} />

          <div style={profileStyles.statItem}>
            <span style={profileStyles.statValue}>{profile.investigationsCount}</span>
            <span style={profileStyles.statLabel}>Deployments</span>
          </div>
        </div>

        {profile.bio && <div style={profileStyles.bioBox}>{profile.bio}</div>}
      </div>

      {/* EDIT CREDENTIALS FORM (OWN PROFILE ONLY) */}
      {isOwnProfile && isEditing && (
        <form onSubmit={handleSaveProfile} style={profileStyles.editFormCard}>
          <h2 style={profileStyles.formTitle}>Update Investigator Credentials</h2>

          <div style={profileStyles.formGrid}>
            <div>
              <label style={profileStyles.fieldLabel}>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.fieldLabel}>Radio Callsign (e.g. SPECTER-1)</label>
              <input
                type="text"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.fieldLabel}>Role / Operational Specialty</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.fieldLabel}>Operational Sector (Location)</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.fieldLabel}>Total Deployments Count</label>
              <input
                type="number"
                value={investigationsCount}
                onChange={(e) => setInvestigationsCount(Number(e.target.value))}
                style={profileStyles.input}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={profileStyles.fieldLabel}>Primary Hardware Loadout</label>
              <input
                type="text"
                placeholder="e.g. AetherBox Node-1 (BME280, MPU6050, MPR121, TEA5767)"
                value={gearLoadout}
                onChange={(e) => setGearLoadout(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={profileStyles.fieldLabel}>Investigator Bio</label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                style={profileStyles.textarea}
              />
            </div>
          </div>

          <div style={profileStyles.formActionRow}>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              style={profileStyles.cancelBtn}
            >
              Cancel
            </button>
            <button type="submit" style={profileStyles.saveBtn}>
              Save Dossier
            </button>
          </div>
        </form>
      )}

      {/* GEAR LOADOUT SECTION */}
      {profile.gearLoadout && (
        <div style={profileStyles.gearCard}>
          <div style={profileStyles.gearCardTitle}>Active Field Gear Loadout</div>
          <div style={profileStyles.gearContent}>{profile.gearLoadout}</div>
        </div>
      )}

      {/* PUBLISHED DISPATCHES HISTORY */}
      <div style={profileStyles.postsSection}>
        <h2 style={profileStyles.sectionHeading}>
          {isOwnProfile ? "Your Incident Case Files" : `Dispatches by ${headerTitle}`}
        </h2>
        {profile.posts.length === 0 ? (
          <div style={profileStyles.emptyPosts}>No case files logged by this investigator yet.</div>
        ) : (
          <div style={profileStyles.postList}>
            {profile.posts.map((post) => (
              <div key={post.id} style={profileStyles.historyPostCard}>
                <div style={profileStyles.postCardHeader}>
                  <span style={profileStyles.postLocation}>
                    {post.location ? `📍 ${post.location}` : "General Sector"}
                  </span>
                  <span style={profileStyles.postTime}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {post.content && <p style={profileStyles.postBody}>{post.content}</p>}

                {post.imageUrl && (
                  <img src={post.imageUrl} alt="Artifact" style={profileStyles.postThumbnail} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOLLOWER / FOLLOWING ROSTER MODAL */}
      {networkModalMode && (
        <NetworkListModal
          isOpen={true}
          onClose={() => {
            setNetworkModalMode(null);
            fetchProfile();
          }}
          userId={profile.id}
          mode={networkModalMode}
          userNameTitle={headerTitle}
        />
      )}
    </div>
  );
}

const profileStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    width: "100%",
  },
  loadingContainer: {
    textAlign: "center",
    padding: "3rem",
    color: "var(--text-muted)",
    fontSize: "0.9rem",
  },
  errorCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--accent-rose)",
    borderRadius: "8px",
    padding: "2rem",
    textAlign: "center",
  },
  returnBtn: {
    marginTop: "1rem",
    padding: "8px 16px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
  },
  headerCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  avatarLarge: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "2px solid var(--border-default)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.4rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    flexShrink: 0,
  },
  identityColumn: {
    flexGrow: 1,
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  displayNameTitle: {
    fontSize: "1.3rem",
    fontWeight: 700,
    margin: 0,
  },
  callsignPill: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "2px 8px",
    borderRadius: "4px",
    fontFamily: "monospace",
    border: "1px solid var(--border-default)",
  },
  handleText: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  locationText: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginTop: "4px",
  },
  headerActionGroup: {
    display: "flex",
    gap: "8px",
  },
  actionBtn: {
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "8px 14px",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  statsStrip: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "10px 16px",
    gap: "16px",
    flexWrap: "wrap",
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "60px",
  },
  statItemInteractive: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "60px",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  statValue: {
    fontSize: "1.2rem",
    fontWeight: 700,
    fontFamily: "monospace",
    color: "var(--accent-primary)",
  },
  statLabel: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  statDivider: {
    width: "1px",
    height: "24px",
    backgroundColor: "var(--border-subtle)",
  },
  bioBox: {
    fontSize: "0.9rem",
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    paddingTop: "0.5rem",
    borderTop: "1px solid var(--border-subtle)",
  },
  editFormCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  formTitle: {
    fontSize: "1.05rem",
    fontWeight: 700,
    margin: 0,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  fieldLabel: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: "4px",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  formActionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "0.5rem",
  },
  cancelBtn: {
    padding: "8px 14px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "8px 18px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  gearCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1rem",
  },
  gearCardTitle: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "4px",
  },
  gearContent: {
    fontSize: "0.9rem",
    color: "var(--text-primary)",
  },
  postsSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sectionHeading: {
    fontSize: "1.05rem",
    fontWeight: 700,
    margin: 0,
  },
  emptyPosts: {
    padding: "2rem 1rem",
    textAlign: "center",
    color: "var(--text-muted)",
    backgroundColor: "var(--bg-surface)",
    border: "1px dashed var(--border-default)",
    borderRadius: "8px",
    fontSize: "0.85rem",
  },
  postList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  historyPostCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "1rem",
  },
  postCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    marginBottom: "6px",
  },
  postLocation: {
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  postTime: {
    fontSize: "0.7rem",
  },
  postBody: {
    fontSize: "0.9rem",
    lineHeight: 1.5,
    margin: "0 0 6px 0",
  },
  postThumbnail: {
    maxHeight: "180px",
    borderRadius: "4px",
    marginTop: "6px",
    display: "block",
  },
};
