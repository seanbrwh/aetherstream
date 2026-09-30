import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

interface PostRecord {
  id: string;
  content: string;
  location: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  telemetry: any;
  createdAt: string;
}

interface ProfileData {
  id: string;
  username: string;
  displayName: string | null;
  callsign: string | null;
  role: string | null;
  bio: string | null;
  location: string | null;
  gearLoadout: string | null;
  investigationsCount: number;
  createdAt: string;
  posts: PostRecord[];
}

export default function Profile() {
  const { token, updateUserContext } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Edit form state
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editCallsign, setEditCallsign] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editGearLoadout, setEditGearLoadout] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editInvestigationsCount, setEditInvestigationsCount] = useState(0);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/social/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Failed to fetch investigator profile.");

      const data: ProfileData = await res.json();
      setProfile(data);

      // Initialize edit fields
      setEditUsername(data.username || "");
      setEditDisplayName(data.displayName || "");
      setEditCallsign(data.callsign || "");
      setEditRole(data.role || "Field Investigator");
      setEditLocation(data.location || "");
      setEditGearLoadout(data.gearLoadout || "");
      setEditBio(data.bio || "");
      setEditInvestigationsCount(data.investigationsCount || 0);
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/social/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: editUsername,
          displayName: editDisplayName,
          callsign: editCallsign,
          role: editRole,
          location: editLocation,
          gearLoadout: editGearLoadout,
          bio: editBio,
          investigationsCount: editInvestigationsCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile.");

      setProfile((prev) => (prev ? { ...prev, ...data } : null));
      updateUserContext({
        username: data.username,
        displayName: data.displayName,
        callsign: data.callsign,
        role: data.role,
      });

      setIsEditing(false);
      setStatusMessage("Investigator dossier updated successfully.");
    } catch (err: any) {
      setStatusMessage(`Update Error: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={profileStyles.loadingState}>
        <div>Accessing Investigator Dossier...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={profileStyles.errorState}>
        <div>Unable to retrieve investigator credentials.</div>
      </div>
    );
  }

  return (
    <div style={profileStyles.container}>
      {/* DOSSIER HEADER */}
      <div style={profileStyles.headerCard}>
        <div style={profileStyles.headerTop}>
          <div>
            <div style={profileStyles.badgeRow}>
              <span style={profileStyles.callsignPill}>
                {profile.callsign ? `[${profile.callsign}]` : "[UNASSIGNED CALLSIGN]"}
              </span>
              <span style={profileStyles.rolePill}>{profile.role || "Field Investigator"}</span>
            </div>
            <h1 style={profileStyles.identityTitle}>{profile.displayName || profile.username}</h1>
            <div style={profileStyles.handleText}>@{profile.username}</div>
          </div>

          <button onClick={() => setIsEditing(!isEditing)} style={profileStyles.editButton}>
            {isEditing ? "Cancel Editing" : "Modify Credentials"}
          </button>
        </div>

        {statusMessage && <div style={profileStyles.statusBar}>{statusMessage}</div>}

        {/* METRIC OVERVIEW TILES */}
        <div style={profileStyles.tileGrid}>
          <div style={profileStyles.metricTile}>
            <div style={profileStyles.tileVal}>{profile.investigationsCount}</div>
            <div style={profileStyles.tileLabel}>Field Investigations</div>
          </div>
          <div style={profileStyles.metricTile}>
            <div style={profileStyles.tileVal}>{profile.posts.length}</div>
            <div style={profileStyles.tileLabel}>Logged Incident Files</div>
          </div>
          <div style={profileStyles.metricTile}>
            <div style={profileStyles.tileVal}>{profile.location || "Unspecified"}</div>
            <div style={profileStyles.tileLabel}>Base of Operations</div>
          </div>
        </div>
      </div>

      {/* EDITING FORM */}
      {isEditing && (
        <form onSubmit={handleSaveProfile} style={profileStyles.editCard}>
          <h3 style={profileStyles.sectionHeading}>Modify Investigator Dossier</h3>

          <div style={profileStyles.formGrid}>
            <div>
              <label style={profileStyles.label}>Username (System Handle)</label>
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                style={profileStyles.input}
                required
              />
            </div>

            <div>
              <label style={profileStyles.label}>Display Name</label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.label}>Tactical Callsign</label>
              <input
                type="text"
                placeholder="e.g. SPECTER-1"
                value={editCallsign}
                onChange={(e) => setEditCallsign(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.label}>Investigation Specialization</label>
              <input
                type="text"
                placeholder="e.g. Lead ITC Specialist / Audio Forensics"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.label}>Base of Operations (HQ)</label>
              <input
                type="text"
                placeholder="e.g. Salt Lake County, UT"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                style={profileStyles.input}
              />
            </div>

            <div>
              <label style={profileStyles.label}>Total Verified Investigations</label>
              <input
                type="number"
                min="0"
                value={editInvestigationsCount}
                onChange={(e) => setEditInvestigationsCount(parseInt(e.target.value) || 0)}
                style={profileStyles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <label style={profileStyles.label}>Hardware & Sensor Kit Loadout</label>
            <textarea
              placeholder="List hardware: e.g. Dual-Bus ESP32 Rig, BME280 Atmospheric Sensor, MPU6050 Geophone, Zoom H6 Recorder..."
              value={editGearLoadout}
              onChange={(e) => setEditGearLoadout(e.target.value)}
              rows={3}
              style={profileStyles.textarea}
            />
          </div>

          <div style={{ marginTop: "1rem" }}>
            <label style={profileStyles.label}>Investigative Methodology & Bio</label>
            <textarea
              placeholder="Describe analytical methods, empirical standards, skepticism protocols..."
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              rows={3}
              style={profileStyles.textarea}
            />
          </div>

          <button type="submit" disabled={saveLoading} style={profileStyles.saveBtn}>
            {saveLoading ? "Updating Dossier..." : "Save Dossier"}
          </button>
        </form>
      )}

      {/* DETAIL SECTIONS */}
      <div style={profileStyles.infoColumns}>
        {/* HARDWARE SPECIFICATION */}
        <div style={profileStyles.card}>
          <h3 style={profileStyles.cardTitle}>Hardware & Field Loadout</h3>
          <p style={profileStyles.cardBody}>
            {profile.gearLoadout || "No hardware specification documented for this operator."}
          </p>
        </div>

        {/* METHODOLOGY & BIO */}
        <div style={profileStyles.card}>
          <h3 style={profileStyles.cardTitle}>Investigative Methodology</h3>
          <p style={profileStyles.cardBody}>
            {profile.bio ||
              "No methodology statement on file. Operating under standard empirical baseline protocols."}
          </p>
        </div>
      </div>

      {/* CASE HISTORY LIST */}
      <div style={{ marginTop: "2rem" }}>
        <h3 style={profileStyles.sectionHeading}>
          Documented Case History ({profile.posts.length})
        </h3>

        {profile.posts.length === 0 ? (
          <div style={profileStyles.emptyCases}>No case entries published to the network yet.</div>
        ) : (
          <div style={profileStyles.caseList}>
            {profile.posts.map((post) => (
              <div key={post.id} style={profileStyles.caseItem}>
                <div style={profileStyles.caseHeader}>
                  <span style={profileStyles.caseLocation}>
                    {post.location ? `Location: ${post.location}` : "Unspecified Field Site"}
                  </span>
                  <span style={profileStyles.caseDate}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {post.content && (
                  <p
                    style={{
                      margin: "0 0 0.5rem 0",
                      fontSize: "0.9rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    {post.content}
                  </p>
                )}
                {post.telemetry && (
                  <div style={profileStyles.telemetryBadge}>
                    <span>Temp: {post.telemetry.sensors.environment.temp_c.toFixed(1)}°C</span>
                    <span>Cap: {post.telemetry.sensors.mpr121.capacitance}</span>
                    <span>Peak G: {post.telemetry.sensors.mpu6050.peak_g.toFixed(3)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const profileStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    width: "100%",
  },
  loadingState: {
    padding: "4rem",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "0.9rem",
  },
  errorState: {
    padding: "4rem",
    textAlign: "center",
    color: "var(--accent-rose)",
    fontSize: "0.9rem",
  },
  headerCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.5rem",
    boxShadow: "var(--card-shadow)",
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "1rem",
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
    flexWrap: "wrap",
  },
  callsignPill: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    padding: "3px 8px",
    borderRadius: "4px",
    fontFamily: "monospace",
  },
  rolePill: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "3px 8px",
    borderRadius: "4px",
  },
  identityTitle: {
    fontSize: "1.6rem",
    fontWeight: 700,
    margin: "4px 0",
    letterSpacing: "-0.3px",
  },
  handleText: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
  },
  editButton: {
    padding: "8px 14px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
    minHeight: "40px",
  },
  statusBar: {
    marginTop: "1rem",
    padding: "8px 12px",
    borderRadius: "4px",
    backgroundColor: "var(--bg-surface-elevated)",
    fontSize: "0.8rem",
    color: "var(--accent-primary)",
  },
  tileGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginTop: "1.5rem",
    borderTop: "1px solid var(--border-subtle)",
    paddingTop: "1.25rem",
  },
  metricTile: {
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "12px",
  },
  tileVal: {
    fontSize: "1.3rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    fontFamily: "monospace",
  },
  tileLabel: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  editCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.5rem",
  },
  sectionHeading: {
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 1rem 0",
    color: "var(--text-primary)",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
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
    padding: "8px 10px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    minHeight: "40px",
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    resize: "vertical",
  },
  saveBtn: {
    marginTop: "1.25rem",
    padding: "10px 18px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    minHeight: "42px",
  },
  infoColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: "1rem",
  },
  card: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.25rem",
    boxShadow: "var(--card-shadow)",
  },
  cardTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    margin: "0 0 0.5rem 0",
    color: "var(--text-primary)",
  },
  cardBody: {
    fontSize: "0.85rem",
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  emptyCases: {
    padding: "2.5rem",
    textAlign: "center",
    color: "var(--text-muted)",
    backgroundColor: "var(--bg-surface)",
    border: "1px dashed var(--border-default)",
    borderRadius: "8px",
    fontSize: "0.85rem",
  },
  caseList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  caseItem: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "1rem",
  },
  caseHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.4rem",
  },
  caseLocation: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--accent-primary)",
  },
  caseDate: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  telemetryBadge: {
    display: "flex",
    gap: "12px",
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "4px 8px",
    borderRadius: "4px",
    fontFamily: "monospace",
    marginTop: "6px",
  },
};
