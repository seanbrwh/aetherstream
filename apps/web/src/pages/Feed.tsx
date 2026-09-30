import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";

interface Author {
  email: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface TelemetrySnapshot {
  timestamp: string | number;
  system: {
    active_mode: number;
    rem_sensitivity_lvl: number;
    geo_threshold_g: number;
  };
  radio: {
    frequency: number;
  };
  sensors: {
    environment: {
      temp_c: number;
      humidity_pct: number;
      pressure_hpa: number;
    };
    mpr121: {
      capacitance: number;
      pad_mask: number;
    };
    mpu6050: {
      peak_g: number;
      accel: {
        x: number;
        y: number;
        z: number;
      };
    };
  };
}

interface Post {
  id: string;
  content: string;
  location: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  telemetry: TelemetrySnapshot | null;
  createdAt: string;
  author: Author;
  comments: Comment[];
}

const MODES: Record<number, string> = {
  1: "RF Sweep",
  2: "Proximity REM",
  3: "Seismic Geophone",
  4: "Dictionary ITC",
};

export default function Feed() {
  const { token, logout } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [lockedTelemetry, setLockedTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFeed = async () => {
    try {
      const res = await fetch("/api/social/feed", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        throw new Error("Session expired. Please log in again.");
      }

      if (!res.ok) throw new Error("Failed to retrieve case file logs.");

      const data = await res.json();
      setPosts(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchFeed();

    // Dynamically target the host IP rather than hardcoded localhost
    const socketUrl =
      window.location.port === "5173" ? `http://${window.location.hostname}:3030` : "/";

    const socket = io(socketUrl);

    socket.on("sensor_update", (payload: TelemetrySnapshot) => {
      setLiveTelemetry(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, logout]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newPostContent.trim() &&
      !locationTag.trim() &&
      !photoFile &&
      !audioFile &&
      !lockedTelemetry
    ) {
      setError("Please provide notes, location, media, or telemetry snapshot.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("content", newPostContent);

      if (locationTag.trim()) formData.append("location", locationTag.trim());
      if (photoFile) formData.append("photo", photoFile);
      if (audioFile) formData.append("audio", audioFile);
      if (lockedTelemetry) formData.append("telemetry", JSON.stringify(lockedTelemetry));

      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) throw new Error("Transmission failed. Record rejected.");

      setNewPostContent("");
      setLocationTag("");
      setPhotoFile(null);
      setAudioFile(null);
      setLockedTelemetry(null);

      const pInput = document.getElementById("photoInput") as HTMLInputElement;
      const aInput = document.getElementById("audioInput") as HTMLInputElement;
      if (pInput) pInput.value = "";
      if (aInput) aInput.value = "";

      fetchFeed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateComment = async (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    const content = commentInputs[postId];
    if (!content || !content.trim()) return;
    setError(null);

    try {
      const res = await fetch(`/api/social/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error("Comment could not be published.");

      setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
      fetchFeed();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={feedStyles.container}>
      {/* PAGE HEADER */}
      <div style={feedStyles.header}>
        <h2 style={feedStyles.title}>Investigation Field Journal</h2>
        <div style={feedStyles.subtitle}>
          Forensic archive of observations, media evidence, and hardware sensor frames
        </div>
      </div>

      {error && (
        <div style={feedStyles.errorBanner}>
          <span>{error}</span>
        </div>
      )}

      {/* NEW CASE ENTRY FORM */}
      <form onSubmit={handleCreatePost} style={feedStyles.formCard}>
        <div style={feedStyles.formTitle}>New Investigation Entry</div>

        <input
          type="text"
          placeholder="Location or Room Description..."
          value={locationTag}
          onChange={(e) => setLocationTag(e.target.value)}
          style={feedStyles.textInput}
        />

        <textarea
          placeholder="Document anomaly details, investigator notes, or audio observations..."
          value={newPostContent}
          onChange={(e) => setNewPostContent(e.target.value)}
          rows={3}
          style={feedStyles.textArea}
        />

        {/* EVIDENCE UPLOAD CONTROLS */}
        <div style={feedStyles.uploadGrid}>
          <div style={feedStyles.uploadBox}>
            <label style={feedStyles.uploadLabel}>Visual Evidence (Photo)</label>
            <input
              id="photoInput"
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              style={feedStyles.fileInput}
            />
          </div>

          <div style={feedStyles.uploadBox}>
            <label style={feedStyles.uploadLabel}>Audio Evidence (EVP)</label>
            <input
              id="audioInput"
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              style={feedStyles.fileInput}
            />
          </div>
        </div>

        {/* SENSOR TELEMETRY LOCKING PANEL */}
        <div style={feedStyles.telemetryPanel}>
          <div style={feedStyles.telemetryHeader}>
            <div>
              <div style={feedStyles.telemetryTitle}>Hardware Telemetry Link</div>
              <div style={feedStyles.telemetryStatus}>
                {liveTelemetry
                  ? "Active stream received on Port 8081"
                  : "Awaiting sensor stream on Port 8081"}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  if (liveTelemetry) {
                    setLockedTelemetry(liveTelemetry);
                  } else {
                    setError("No active hardware telemetry stream on Port 8081 to lock.");
                  }
                }}
                style={{
                  ...feedStyles.telemetryButton,
                  backgroundColor: lockedTelemetry
                    ? "var(--accent-primary)"
                    : "var(--bg-surface-elevated)",
                  color: lockedTelemetry ? "#ffffff" : "var(--text-primary)",
                }}
              >
                {lockedTelemetry ? "Snapshot Attached" : "Attach Live Frame"}
              </button>

              {lockedTelemetry && (
                <button
                  type="button"
                  onClick={() => setLockedTelemetry(null)}
                  style={feedStyles.discardButton}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {lockedTelemetry && (
            <div style={feedStyles.telemetrySummary}>
              Attached: {MODES[lockedTelemetry.system.active_mode] || "Rig"} | Temp:{" "}
              {lockedTelemetry.sensors.environment.temp_c.toFixed(1)}°C | Capacitance:{" "}
              {lockedTelemetry.sensors.mpr121.capacitance} | Force:{" "}
              {lockedTelemetry.sensors.mpu6050.peak_g.toFixed(3)} G
            </div>
          )}
        </div>

        <button type="submit" disabled={isSubmitting} style={feedStyles.submitButton}>
          {isSubmitting ? "Submitting Record..." : "Publish Investigation Entry"}
        </button>
      </form>

      {/* FEED ENTRIES LIST */}
      <div style={feedStyles.feedList}>
        {posts.length === 0 ? (
          <div style={feedStyles.emptyFeed}>No investigation entries found in the database.</div>
        ) : (
          posts.map((post) => (
            <article key={post.id} style={feedStyles.postCard}>
              {/* POST HEADER */}
              <div style={feedStyles.postHeader}>
                <div>
                  <div style={feedStyles.authorEmail}>{post.author.email}</div>
                  {post.location && <div style={feedStyles.locationBadge}>📍 {post.location}</div>}
                </div>
                <div style={feedStyles.postDate}>
                  {new Date(post.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {/* POST CONTENT */}
              {post.content && <p style={feedStyles.postContent}>{post.content}</p>}

              {/* PHOTO EVIDENCE */}
              {post.imageUrl && (
                <div style={feedStyles.imageContainer}>
                  <img
                    src={post.imageUrl}
                    alt="Investigation Evidence"
                    style={feedStyles.evidenceImage}
                  />
                </div>
              )}

              {/* AUDIO EVIDENCE */}
              {post.audioUrl && (
                <div style={feedStyles.audioContainer}>
                  <div style={feedStyles.audioLabel}>Audio Capture (EVP)</div>
                  <audio controls style={{ width: "100%", display: "block" }}>
                    <source src={post.audioUrl} />
                    Audio playback is not supported in this browser.
                  </audio>
                </div>
              )}

              {/* SYNCHRONIZED TELEMETRY BADGE */}
              {post.telemetry && (
                <div style={feedStyles.telemetryBadge}>
                  <div style={feedStyles.badgeHeader}>
                    <span>Synchronized Sensor Frame</span>
                    <span>{MODES[post.telemetry.system.active_mode] || "Telemetry"}</span>
                  </div>

                  <div style={feedStyles.badgeGrid}>
                    <div>
                      <span style={feedStyles.badgeLabel}>Temp: </span>
                      <span style={feedStyles.badgeValue}>
                        {post.telemetry.sensors.environment.temp_c.toFixed(1)}°C
                      </span>
                    </div>

                    <div>
                      <span style={feedStyles.badgeLabel}>Capacitance: </span>
                      <span style={feedStyles.badgeValue}>
                        {post.telemetry.sensors.mpr121.capacitance}
                      </span>
                    </div>

                    <div>
                      <span style={feedStyles.badgeLabel}>Impact: </span>
                      <span style={feedStyles.badgeValue}>
                        {post.telemetry.sensors.mpu6050.peak_g.toFixed(3)} G
                      </span>
                    </div>

                    <div>
                      <span style={feedStyles.badgeLabel}>RF Band: </span>
                      <span style={feedStyles.badgeValue}>
                        {post.telemetry.radio.frequency.toFixed(1)} MHz
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* COMMENTS THREAD */}
              <div style={feedStyles.commentsSection}>
                {post.comments.length > 0 && (
                  <div style={feedStyles.commentsList}>
                    {post.comments.map((comment) => (
                      <div key={comment.id} style={feedStyles.commentItem}>
                        <span style={feedStyles.commentAuthor}>{comment.author.email}:</span>
                        <span style={feedStyles.commentText}>{comment.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => handleCreateComment(post.id, e)}
                  style={feedStyles.commentForm}
                >
                  <input
                    type="text"
                    placeholder="Add field note or analysis..."
                    value={commentInputs[post.id] || ""}
                    onChange={(e) =>
                      setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                    }
                    style={feedStyles.commentInput}
                  />
                  <button type="submit" style={feedStyles.commentButton}>
                    Post
                  </button>
                </form>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

const feedStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    width: "100%",
  },
  header: {
    borderBottom: "1px solid var(--border-default)",
    paddingBottom: "1rem",
  },
  title: {
    fontSize: "1.4rem",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.3px",
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid var(--accent-rose)",
    color: "var(--accent-rose)",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "0.85rem",
    fontWeight: 500,
  },
  formCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "1.25rem",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    boxShadow: "var(--card-shadow)",
  },
  formTitle: {
    fontSize: "0.95rem",
    fontWeight: 600,
  },
  textInput: {
    padding: "10px 12px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    minHeight: "44px",
    width: "100%",
  },
  textArea: {
    width: "100%",
    padding: "10px 12px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    resize: "vertical",
  },
  uploadGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
    gap: "10px",
  },
  uploadBox: {
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "8px 12px",
  },
  uploadLabel: {
    display: "block",
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginBottom: "4px",
    fontWeight: 500,
  },
  fileInput: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    width: "100%",
  },
  telemetryPanel: {
    padding: "12px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
  },
  telemetryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
  },
  telemetryTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  telemetryStatus: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  telemetryButton: {
    padding: "6px 12px",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: "36px",
  },
  discardButton: {
    padding: "6px 12px",
    background: "transparent",
    color: "var(--accent-rose)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.75rem",
    minHeight: "36px",
  },
  telemetrySummary: {
    marginTop: "8px",
    fontSize: "0.75rem",
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  submitButton: {
    padding: "10px 16px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 600,
    minHeight: "44px",
    marginTop: "4px",
  },
  feedList: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  emptyFeed: {
    padding: "3rem 1.5rem",
    textAlign: "center",
    color: "var(--text-muted)",
    backgroundColor: "var(--bg-surface)",
    border: "1px dashed var(--border-default)",
    borderRadius: "8px",
    fontSize: "0.9rem",
  },
  postCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.25rem",
    boxShadow: "var(--card-shadow)",
  },
  postHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "0.75rem",
  },
  authorEmail: {
    fontSize: "0.9rem",
    fontWeight: 600,
  },
  locationBadge: {
    display: "inline-block",
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid var(--border-default)",
    marginTop: "4px",
  },
  postDate: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  postContent: {
    fontSize: "0.95rem",
    lineHeight: 1.6,
    margin: "0 0 1rem 0",
    whiteSpace: "pre-wrap",
  },
  imageContainer: {
    marginBottom: "1rem",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid var(--border-default)",
  },
  evidenceImage: {
    width: "100%",
    maxHeight: "450px",
    objectFit: "contain",
    display: "block",
    backgroundColor: "#000000",
  },
  audioContainer: {
    marginBottom: "1rem",
    padding: "10px 12px",
    backgroundColor: "var(--bg-surface-elevated)",
    borderRadius: "6px",
    border: "1px solid var(--border-default)",
  },
  audioLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "6px",
  },
  telemetryBadge: {
    marginBottom: "1rem",
    padding: "10px 12px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
  },
  badgeHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
    paddingBottom: "4px",
    marginBottom: "6px",
  },
  badgeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: "6px",
    fontSize: "0.8rem",
  },
  badgeLabel: {
    color: "var(--text-muted)",
  },
  badgeValue: {
    fontWeight: 600,
    fontFamily: "monospace",
  },
  commentsSection: {
    marginTop: "1rem",
    paddingTop: "1rem",
    borderTop: "1px solid var(--border-subtle)",
  },
  commentsList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "0.75rem",
  },
  commentItem: {
    fontSize: "0.85rem",
  },
  commentAuthor: {
    fontWeight: 600,
    marginRight: "6px",
    color: "var(--text-secondary)",
  },
  commentText: {
    color: "var(--text-primary)",
  },
  commentForm: {
    display: "flex",
    gap: "8px",
  },
  commentInput: {
    flexGrow: 1,
    padding: "8px 12px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    minHeight: "40px",
  },
  commentButton: {
    padding: "8px 16px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
    minHeight: "40px",
  },
};
