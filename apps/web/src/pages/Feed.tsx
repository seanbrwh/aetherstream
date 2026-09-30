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
  imageUrl: string | null;
  audioUrl: string | null;
  telemetry: TelemetrySnapshot | null;
  createdAt: string;
  author: Author;
  comments: Comment[];
}

const MODES: Record<number, string> = {
  1: "SPIRIT BOX",
  2: "REM POD",
  3: "GEOPHONE",
  4: "ALICE BOX",
};

export default function Feed() {
  const { token, logout } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState("");
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

      if (!res.ok) throw new Error("Failed to fetch field feed");

      const data = await res.json();
      setPosts(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchFeed();

    // Hook into live hardware telemetry stream to allow 1-click snapshotting
    const socketUrl = window.location.port === "5173" ? "http://localhost:3030" : "/";
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
    if (!newPostContent.trim() && !photoFile && !audioFile && !lockedTelemetry) {
      setError("Provide field notes, attach evidence, or lock telemetry data.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("content", newPostContent);

      if (photoFile) {
        formData.append("photo", photoFile);
      }
      if (audioFile) {
        formData.append("audio", audioFile);
      }
      if (lockedTelemetry) {
        formData.append("telemetry", JSON.stringify(lockedTelemetry));
      }

      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to log investigation entry");

      setNewPostContent("");
      setPhotoFile(null);
      setAudioFile(null);
      setLockedTelemetry(null);

      // Reset file input elements
      const photoInput = document.getElementById("photoInput") as HTMLInputElement;
      const audioInput = document.getElementById("audioInput") as HTMLInputElement;
      if (photoInput) photoInput.value = "";
      if (audioInput) audioInput.value = "";

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

      if (!res.ok) throw new Error("Failed to publish commentary");

      setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
      fetchFeed();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ fontFamily: "monospace", color: "#e2e8f0" }}>
      <h2
        style={{
          borderBottom: "1px solid #333",
          paddingBottom: "1rem",
          margin: 0,
          color: "#00ffcc",
        }}
      >
        INVESTIGATION FEED & TELEMETRY LOG
      </h2>

      {error && (
        <p
          style={{
            color: "#ff4444",
            border: "1px solid #ff4444",
            padding: "10px",
            marginTop: "1rem",
          }}
        >
          {error}
        </p>
      )}

      {/* CREATE INVESTIGATION LOG FORM */}
      <form
        onSubmit={handleCreatePost}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "15px",
          marginTop: "2rem",
          padding: "1.5rem",
          backgroundColor: "#0c0c10",
          border: "1px solid #2a2a35",
        }}
      >
        <span style={{ color: "#00ffcc", fontWeight: "bold" }}>TRANSMIT ANOMALY LOG</span>

        <textarea
          placeholder="Document anomaly details, session location, observed activity..."
          value={newPostContent}
          onChange={(e) => setNewPostContent(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "10px",
            background: "#15151c",
            color: "#e2e8f0",
            border: "1px solid #333",
            fontFamily: "monospace",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        {/* EVIDENCE ATTACHMENT SECTION */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "15px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontSize: "0.85em",
                color: "#94a3b8",
              }}
            >
              PHOTO / SPECTROGRAM EVIDENCE:
            </label>
            <input
              id="photoInput"
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              style={{ fontSize: "0.85em", color: "#888" }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontSize: "0.85em",
                color: "#94a3b8",
              }}
            >
              EVP / AUDIO CAPTURE:
            </label>
            <input
              id="audioInput"
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              style={{ fontSize: "0.85em", color: "#888" }}
            />
          </div>
        </div>

        {/* HARDWARE TELEMETRY SNAPSHOT CONTROLS */}
        <div style={{ padding: "10px", border: "1px dashed #333", backgroundColor: "#111116" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.9em", color: "#94a3b8" }}>HARDWARE TELEMETRY LOCK:</span>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  if (liveTelemetry) {
                    setLockedTelemetry(liveTelemetry);
                  } else {
                    setError("No live hardware telemetry detected on Port 8081 to lock.");
                  }
                }}
                style={{
                  padding: "6px 12px",
                  background: lockedTelemetry ? "#00ffcc" : "#222",
                  color: lockedTelemetry ? "#000" : "#00ffcc",
                  border: "1px solid #00ffcc",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "0.8em",
                }}
              >
                {lockedTelemetry ? "LOCKED TO LOG" : "CAPTURE LIVE SENSOR FRAME"}
              </button>

              {lockedTelemetry && (
                <button
                  type="button"
                  onClick={() => setLockedTelemetry(null)}
                  style={{
                    padding: "6px 12px",
                    background: "#ff3333",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8em",
                  }}
                >
                  DISCARD
                </button>
              )}
            </div>
          </div>

          {lockedTelemetry && (
            <div style={{ marginTop: "8px", fontSize: "0.85em", color: "#00ffcc" }}>
              Locked frame from Mode: {MODES[lockedTelemetry.system.active_mode] || "CUSTOM"} |
              Temp: {lockedTelemetry.sensors.environment.temp_c.toFixed(1)}°C | Impact:{" "}
              {lockedTelemetry.sensors.mpu6050.peak_g.toFixed(3)}G | REM:{" "}
              {lockedTelemetry.sensors.mpr121.capacitance}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            alignSelf: "flex-end",
            padding: "10px 24px",
            background: isSubmitting ? "#555" : "#00ffcc",
            color: "#000",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            border: "none",
            fontWeight: "bold",
            letterSpacing: "1px",
          }}
        >
          {isSubmitting ? "TRANSMITTING EVIDENCE..." : "LOG INCIDENT"}
        </button>
      </form>

      {/* FEED LIST */}
      <div style={{ marginTop: "2.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {posts.length === 0 ? (
          <p style={{ color: "#888" }}>No anomaly records found in local database.</p>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              style={{
                border: "1px solid #2a2a35",
                padding: "1.5rem",
                backgroundColor: "#0c0c12",
              }}
            >
              {/* POST HEADER */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #222",
                  paddingBottom: "0.5rem",
                  marginBottom: "1rem",
                  fontSize: "0.85em",
                  color: "#888",
                }}
              >
                <span style={{ color: "#00ffcc", fontWeight: "bold" }}>
                  OPERATOR: {post.author.email}
                </span>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>

              {/* POST CONTENT */}
              {post.content && (
                <p
                  style={{
                    margin: "0 0 1rem 0",
                    whiteSpace: "pre-wrap",
                    lineHeight: "1.5",
                    color: "#f1f5f9",
                  }}
                >
                  {post.content}
                </p>
              )}

              {/* PHOTO EVIDENCE ATTACHMENT */}
              {post.imageUrl && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    border: "1px solid #333",
                    background: "#000",
                    padding: "5px",
                  }}
                >
                  <img
                    src={post.imageUrl}
                    alt="Investigation Visual Evidence"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "500px",
                      display: "block",
                      margin: "0 auto",
                    }}
                  />
                </div>
              )}

              {/* AUDIO EVP ATTACHMENT */}
              {post.audioUrl && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "10px",
                    background: "#15151c",
                    border: "1px solid #333",
                  }}
                >
                  <div style={{ fontSize: "0.85em", color: "#94a3b8", marginBottom: "6px" }}>
                    AUDIO / EVP RECORDING:
                  </div>
                  <audio controls style={{ width: "100%" }}>
                    <source src={post.audioUrl} />
                    Your browser does not support audio element playback.
                  </audio>
                </div>
              )}

              {/* EMBEDDED TELEMETRY EVIDENCE BADGE */}
              {post.telemetry && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    border: "1px solid #00ffcc",
                    padding: "1rem",
                    backgroundColor: "#111116",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      borderBottom: "1px solid #333",
                      paddingBottom: "4px",
                      marginBottom: "8px",
                      fontSize: "0.85em",
                    }}
                  >
                    <span style={{ color: "#00ffcc", fontWeight: "bold" }}>
                      SYNCHRONIZED HARDWARE TELEMETRY
                    </span>
                    <span style={{ color: "#b48ead" }}>
                      MODE: {MODES[post.telemetry.system.active_mode] || "FIELD UNIT"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "10px",
                      fontSize: "0.85em",
                    }}
                  >
                    <div>
                      <span style={{ color: "#888" }}>Ambient Temp: </span>
                      <span style={{ color: "#fff", fontWeight: "bold" }}>
                        {post.telemetry.sensors.environment.temp_c.toFixed(1)} °C
                      </span>
                    </div>

                    <div>
                      <span style={{ color: "#888" }}>Pressure: </span>
                      <span style={{ color: "#fff" }}>
                        {post.telemetry.sensors.environment.pressure_hpa.toFixed(1)} hPa
                      </span>
                    </div>

                    <div>
                      <span style={{ color: "#888" }}>REM Capacitance: </span>
                      <span style={{ color: "#00ffcc", fontWeight: "bold" }}>
                        {post.telemetry.sensors.mpr121.capacitance}
                      </span>
                    </div>

                    <div>
                      <span style={{ color: "#888" }}>Kinetic Shock: </span>
                      <span
                        style={{
                          color:
                            post.telemetry.sensors.mpu6050.peak_g >
                            post.telemetry.system.geo_threshold_g
                              ? "#ff3333"
                              : "#fff",
                          fontWeight: "bold",
                        }}
                      >
                        {post.telemetry.sensors.mpu6050.peak_g.toFixed(3)} G
                      </span>
                    </div>

                    <div>
                      <span style={{ color: "#888" }}>RF Frequency: </span>
                      <span style={{ color: "#fff" }}>
                        {post.telemetry.radio.frequency.toFixed(1)} FM
                      </span>
                    </div>

                    <div>
                      <span style={{ color: "#888" }}>Vector (X,Y,Z): </span>
                      <span style={{ color: "#aaa" }}>
                        {post.telemetry.sensors.mpu6050.accel.x.toFixed(1)},{" "}
                        {post.telemetry.sensors.mpu6050.accel.y.toFixed(1)},{" "}
                        {post.telemetry.sensors.mpu6050.accel.z.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* COMMENTS LOG SECTION */}
              <div
                style={{ marginLeft: "1rem", paddingLeft: "1rem", borderLeft: "2px solid #222" }}
              >
                {post.comments.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.8rem",
                      marginBottom: "1rem",
                    }}
                  >
                    {post.comments.map((comment) => (
                      <div key={comment.id} style={{ fontSize: "0.85em" }}>
                        <span style={{ color: "#00ffcc", fontWeight: "bold", marginRight: "8px" }}>
                          {comment.author.email}:
                        </span>
                        <span style={{ color: "#ccc" }}>{comment.content}</span>
                        <div style={{ fontSize: "0.75em", color: "#666", marginTop: "2px" }}>
                          {new Date(comment.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => handleCreateComment(post.id, e)}
                  style={{ display: "flex", gap: "10px" }}
                >
                  <input
                    type="text"
                    placeholder="Contribute case note or correlation analysis..."
                    value={commentInputs[post.id] || ""}
                    onChange={(e) =>
                      setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                    }
                    style={{
                      flexGrow: 1,
                      padding: "8px",
                      background: "#15151c",
                      color: "#00ffcc",
                      border: "1px solid #333",
                      fontFamily: "monospace",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "8px 16px",
                      background: "#222",
                      color: "#00ffcc",
                      cursor: "pointer",
                      border: "1px solid #444",
                    }}
                  >
                    ADD NOTE
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
