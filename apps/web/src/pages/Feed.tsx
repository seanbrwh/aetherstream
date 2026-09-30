import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";

interface Author {
  id: string;
  username: string;
  displayName: string | null;
  callsign: string | null;
  role: string | null;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    callsign: string | null;
  };
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
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isFollowingAuthor: boolean;
}

const MODES: Record<number, string> = {
  1: "RF Sweep",
  2: "Proximity REM",
  3: "Seismic Geophone",
  4: "Dictionary ITC",
};

export default function Feed() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<Post[]>([]);
  const [feedScope, setFeedScope] = useState<"all" | "following">("all");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [lockedTelemetry, setLockedTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mention autocomplete state
  const [directory, setDirectory] = useState<Author[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTargetField, setMentionTargetField] = useState<"compose" | string | null>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const fetchFeed = async (scope = feedScope) => {
    try {
      const res = await fetch(`/api/social/feed?scope=${scope}`, {
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

  const fetchDirectory = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/social/investigators", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: Author[] = await res.json();
        setDirectory(data);
      }
    } catch (err) {
      console.error("Fetch directory error:", err);
    }
  };

  useEffect(() => {
    fetchFeed(feedScope);
    fetchDirectory();

    const socketUrl =
      window.location.port === "5173" ? `http://${window.location.hostname}:3030` : "/";

    const socket = io(socketUrl);

    socket.on("sensor_update", (payload: TelemetrySnapshot) => {
      setLiveTelemetry(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, logout, feedScope]);

  const handleToggleFollow = async (authorId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.author.id === authorId) {
          return { ...p, isFollowingAuthor: !p.isFollowingAuthor };
        }
        return p;
      }),
    );

    try {
      const res = await fetch(`/api/social/users/${authorId}/follow`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        fetchFeed(feedScope);
      }
    } catch (err) {
      console.error("Follow toggle error:", err);
      fetchFeed(feedScope);
    }
  };

  // Mention Autocomplete Input Handler for Post Composer
  const handleComposeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setNewPostContent(text);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastWordMatch = textBeforeCursor.match(/@(\w*)$/);

    if (lastWordMatch) {
      setMentionQuery(lastWordMatch[1].toLowerCase());
      setMentionTargetField("compose");
    } else {
      setMentionQuery(null);
      setMentionTargetField(null);
    }
  };

  // Mention Autocomplete Input Handler for Comments
  const handleCommentChange = (postId: string, text: string, cursorPos: number) => {
    setCommentInputs((prev) => ({ ...prev, [postId]: text }));

    const textBeforeCursor = text.slice(0, cursorPos);
    const lastWordMatch = textBeforeCursor.match(/@(\w*)$/);

    if (lastWordMatch) {
      setMentionQuery(lastWordMatch[1].toLowerCase());
      setMentionTargetField(postId);
    } else {
      setMentionQuery(null);
      setMentionTargetField(null);
    }
  };

  const applyMention = (author: Author) => {
    const handleTag = author.callsign ? `@${author.callsign} ` : `@${author.username} `;

    if (mentionTargetField === "compose") {
      const text = newPostContent;
      const cursorPos = composeTextareaRef.current?.selectionStart || text.length;
      const textBeforeCursor = text.slice(0, cursorPos);
      const textAfterCursor = text.slice(cursorPos);
      const newBefore = textBeforeCursor.replace(/@\w*$/, handleTag);

      setNewPostContent(newBefore + textAfterCursor);
    } else if (mentionTargetField) {
      const postId = mentionTargetField;
      const text = commentInputs[postId] || "";
      const newText = text.replace(/@\w*$/, handleTag);
      setCommentInputs((prev) => ({ ...prev, [postId]: newText }));
    }

    setMentionQuery(null);
    setMentionTargetField(null);
  };

  // Render text with clickable @callsign badges
  const renderContentWithMentions = (content: string) => {
    const parts = content.split(/(@\w+)/g);

    return parts.map((part, index) => {
      if (part.startsWith("@")) {
        const rawTag = part.slice(1).toUpperCase();
        const matched = directory.find(
          (d) =>
            (d.callsign && d.callsign.toUpperCase() === rawTag) ||
            d.username.toUpperCase() === rawTag,
        );

        if (matched) {
          return (
            <span
              key={index}
              onClick={() => navigate(`/profile/${matched.username}`)}
              style={feedStyles.mentionBadge}
              title={`View ${matched.displayName || matched.username}'s dossier`}
            >
              {part}
            </span>
          );
        }
      }
      return <span key={index}>{part}</span>;
    });
  };

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
      setIsComposeOpen(false);

      fetchFeed(feedScope);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleLike = async (postId: string) => {
    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.id === postId) {
          const nextIsLiked = !p.isLiked;
          return {
            ...p,
            isLiked: nextIsLiked,
            likeCount: nextIsLiked ? p.likeCount + 1 : Math.max(0, p.likeCount - 1),
          };
        }
        return p;
      }),
    );

    try {
      const res = await fetch(`/api/social/posts/${postId}/like`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) fetchFeed(feedScope);
    } catch {
      fetchFeed(feedScope);
    }
  };

  const handleCreateComment = async (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    const content = commentInputs[postId];
    if (!content || !content.trim()) return;

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
      fetchFeed(feedScope);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleCommentsAccordion = (postId: string) => {
    setExpandedComments((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const filteredMentions =
    mentionQuery !== null
      ? directory.filter((d) => {
          const query = mentionQuery.toLowerCase();
          return (
            d.username.toLowerCase().includes(query) ||
            (d.callsign && d.callsign.toLowerCase().includes(query)) ||
            (d.displayName && d.displayName.toLowerCase().includes(query))
          );
        })
      : [];

  const getAuthorDisplay = (post: Post) => {
    const { author, isFollowingAuthor } = post;
    const name = author.displayName || author.username || "Investigator";
    const initials = name.slice(0, 2).toUpperCase();
    const isSelf = user?.id === author.id;

    return (
      <div style={feedStyles.authorContainer}>
        <div
          onClick={() => navigate(`/profile/${author.username}`)}
          style={{ ...feedStyles.avatar, cursor: "pointer" }}
          title={`View ${name}'s public dossier`}
        >
          {initials}
        </div>
        <div>
          <div style={feedStyles.authorLine}>
            <span
              onClick={() => navigate(`/profile/${author.username}`)}
              style={{ ...feedStyles.authorName, cursor: "pointer" }}
            >
              {name}
            </span>
            {author.callsign && <span style={feedStyles.callsignPill}>[{author.callsign}]</span>}
            <span style={feedStyles.usernameHandle}>@{author.username}</span>

            {!isSelf && (
              <button
                type="button"
                onClick={() => handleToggleFollow(author.id)}
                style={{
                  ...feedStyles.followBtn,
                  backgroundColor: isFollowingAuthor ? "var(--bg-surface-elevated)" : "transparent",
                  color: isFollowingAuthor ? "var(--text-muted)" : "var(--accent-primary)",
                  borderColor: isFollowingAuthor
                    ? "var(--border-default)"
                    : "var(--accent-primary)",
                }}
              >
                {isFollowingAuthor ? "Following" : "+ Follow"}
              </button>
            )}
          </div>
          {author.role && <div style={feedStyles.roleText}>{author.role}</div>}
        </div>
      </div>
    );
  };

  return (
    <div style={feedStyles.container}>
      {/* HEADER BAR */}
      <div style={feedStyles.header}>
        <div>
          <h1 style={feedStyles.title}>Investigation Feed</h1>
          <div style={feedStyles.subtitle}>
            Field logbook, sensory verifications, and investigator communications
          </div>
        </div>

        <button onClick={() => setIsComposeOpen(true)} style={feedStyles.composeButton}>
          <span style={{ fontSize: "1rem", fontWeight: 700 }}>+</span>
          <span>New Entry</span>
        </button>
      </div>

      {/* FEED SCOPE SELECTOR TABS */}
      <div style={feedStyles.scopeBar}>
        <button
          type="button"
          onClick={() => setFeedScope("all")}
          style={{
            ...feedStyles.scopeTab,
            ...(feedScope === "all" ? feedStyles.scopeTabActive : {}),
          }}
        >
          All Transmissions
        </button>
        <button
          type="button"
          onClick={() => setFeedScope("following")}
          style={{
            ...feedStyles.scopeTab,
            ...(feedScope === "following" ? feedStyles.scopeTabActive : {}),
          }}
        >
          Monitored Units Only
        </button>
      </div>

      {error && (
        <div style={feedStyles.errorBanner}>
          <span>{error}</span>
        </div>
      )}

      {/* TIMELINE FEED */}
      <div style={feedStyles.feedList}>
        {posts.length === 0 ? (
          <div style={feedStyles.emptyFeed}>
            {feedScope === "following"
              ? "No dispatches found from monitored units. Follow other investigators to track their logs here."
              : "No case entries logged yet. Be the first to publish an incident report."}
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} style={feedStyles.postCard}>
              <div style={feedStyles.postHeader}>
                {getAuthorDisplay(post)}
                <div style={feedStyles.postDate}>
                  {new Date(post.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {post.location && (
                <div style={feedStyles.locationBadge}>Location: {post.location}</div>
              )}

              {post.content && (
                <p style={feedStyles.postContent}>{renderContentWithMentions(post.content)}</p>
              )}

              {post.imageUrl && (
                <div style={feedStyles.imageContainer}>
                  <img
                    src={post.imageUrl}
                    alt="Investigation Artifact"
                    style={feedStyles.evidenceImage}
                  />
                </div>
              )}

              {post.audioUrl && (
                <div style={feedStyles.audioContainer}>
                  <div style={feedStyles.audioLabel}>Acoustic Evidence (EVP Capture)</div>
                  <audio controls style={{ width: "100%", display: "block" }}>
                    <source src={post.audioUrl} />
                    Audio playback not supported.
                  </audio>
                </div>
              )}

              {post.telemetry && (
                <div style={feedStyles.telemetryBadge}>
                  <div style={feedStyles.telemetryBadgeHeader}>
                    <span>Synchronized Sensor Snapshot</span>
                    <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
                      {MODES[post.telemetry.system.active_mode] || "Telemetry Frame"}
                    </span>
                  </div>

                  <div style={feedStyles.telemetryGrid}>
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
                      <span style={feedStyles.badgeLabel}>Carrier: </span>
                      <span style={feedStyles.badgeValue}>
                        {post.telemetry.radio.frequency.toFixed(1)} MHz
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div style={feedStyles.actionBar}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => handleToggleLike(post.id)}
                    style={{
                      ...feedStyles.actionButton,
                      color: post.isLiked ? "var(--accent-rose)" : "var(--text-secondary)",
                      backgroundColor: post.isLiked
                        ? "rgba(244, 63, 94, 0.1)"
                        : "var(--bg-surface-elevated)",
                    }}
                  >
                    <span>{post.isLiked ? "♥" : "♡"}</span>
                    <span>
                      {post.likeCount} {post.likeCount === 1 ? "Endorsement" : "Endorsements"}
                    </span>
                  </button>

                  <button
                    onClick={() => toggleCommentsAccordion(post.id)}
                    style={feedStyles.actionButton}
                  >
                    <span>💬</span>
                    <span>
                      {post.commentCount} {post.commentCount === 1 ? "Comment" : "Comments"}
                    </span>
                  </button>
                </div>
              </div>

              {/* COMMENTS ACCORDION WITH INLINE AUTOCOMPLETE */}
              {expandedComments[post.id] && (
                <div style={feedStyles.commentsDrawer}>
                  <div style={feedStyles.commentsList}>
                    {post.comments.length === 0 ? (
                      <div style={feedStyles.noCommentsText}>
                        No comments on this case file. Start the discussion below.
                      </div>
                    ) : (
                      post.comments.map((comment) => (
                        <div key={comment.id} style={feedStyles.commentItem}>
                          <span
                            onClick={() => navigate(`/profile/${comment.author.username}`)}
                            style={{ ...feedStyles.commentAuthor, cursor: "pointer" }}
                          >
                            {comment.author.callsign ? `[${comment.author.callsign}] ` : ""}
                            {comment.author.displayName || comment.author.username}:
                          </span>
                          <span style={feedStyles.commentContent}>
                            {renderContentWithMentions(comment.content)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ position: "relative" }}>
                    {/* AUTOCOMPLETE POPUP FOR COMMENTS */}
                    {mentionTargetField === post.id && filteredMentions.length > 0 && (
                      <div style={feedStyles.mentionDropdown}>
                        {filteredMentions.map((inv) => (
                          <div
                            key={inv.id}
                            onClick={() => applyMention(inv)}
                            style={feedStyles.mentionOption}
                          >
                            <span style={feedStyles.mentionOptionCallsign}>
                              {inv.callsign ? `[${inv.callsign}]` : `@${inv.username}`}
                            </span>
                            <span style={feedStyles.mentionOptionName}>
                              {inv.displayName || inv.username}
                            </span>
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
                        placeholder="Add an observational note (use @callsign to mention)..."
                        value={commentInputs[post.id] || ""}
                        onChange={(e) =>
                          handleCommentChange(post.id, e.target.value, e.target.selectionStart || 0)
                        }
                        style={feedStyles.commentInput}
                      />
                      <button type="submit" style={feedStyles.commentSubmitBtn}>
                        Send
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {/* COMPOSE MODAL WITH AUTOCOMPLETE */}
      {isComposeOpen && (
        <div style={feedStyles.modalOverlay}>
          <div style={feedStyles.modalCard}>
            <div style={feedStyles.modalHeader}>
              <h2 style={feedStyles.modalTitle}>New Incident Case File</h2>
              <button onClick={() => setIsComposeOpen(false)} style={feedStyles.modalCloseBtn}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePost} style={feedStyles.modalForm}>
              <div>
                <label style={feedStyles.fieldLabel}>Location or Specific Chamber</label>
                <input
                  type="text"
                  placeholder="e.g. 2nd Floor Corridor, North Wing..."
                  value={locationTag}
                  onChange={(e) => setLocationTag(e.target.value)}
                  style={feedStyles.modalInput}
                />
              </div>

              <div style={{ position: "relative" }}>
                <label style={feedStyles.fieldLabel}>Field Observation Log</label>
                <textarea
                  ref={composeTextareaRef}
                  placeholder="Document anomalous audio, sensory perceptions, or tag units with @callsign..."
                  value={newPostContent}
                  onChange={handleComposeChange}
                  rows={4}
                  style={feedStyles.modalTextarea}
                />

                {/* AUTOCOMPLETE POPUP FOR COMPOSE */}
                {mentionTargetField === "compose" && filteredMentions.length > 0 && (
                  <div style={feedStyles.composeMentionDropdown}>
                    {filteredMentions.map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => applyMention(inv)}
                        style={feedStyles.mentionOption}
                      >
                        <span style={feedStyles.mentionOptionCallsign}>
                          {inv.callsign ? `[${inv.callsign}]` : `@${inv.username}`}
                        </span>
                        <span style={feedStyles.mentionOptionName}>
                          {inv.displayName || inv.username}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={feedStyles.modalMediaGrid}>
                <div style={feedStyles.mediaUploadBox}>
                  <label style={feedStyles.fieldLabel}>Photographic Evidence</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    style={feedStyles.fileField}
                  />
                </div>

                <div style={feedStyles.mediaUploadBox}>
                  <label style={feedStyles.fieldLabel}>EVP / Audio Capture</label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    style={feedStyles.fileField}
                  />
                </div>
              </div>

              <div style={feedStyles.modalTelemetryBox}>
                <div style={feedStyles.modalTelemetryHeader}>
                  <div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                      Hardware Telemetry Frame
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {liveTelemetry
                        ? "Active feed receiving on Port 8081"
                        : "Awaiting hardware packet on Port 8081"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (liveTelemetry) {
                          setLockedTelemetry(liveTelemetry);
                        } else {
                          setError("No active hardware telemetry packet on Port 8081 to lock.");
                        }
                      }}
                      style={{
                        ...feedStyles.telemetryLockBtn,
                        backgroundColor: lockedTelemetry
                          ? "var(--accent-primary)"
                          : "var(--bg-surface-elevated)",
                        color: lockedTelemetry ? "#ffffff" : "var(--text-primary)",
                      }}
                    >
                      {lockedTelemetry ? "Snapshot Locked" : "Attach Live Frame"}
                    </button>

                    {lockedTelemetry && (
                      <button
                        type="button"
                        onClick={() => setLockedTelemetry(null)}
                        style={feedStyles.discardBtn}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {lockedTelemetry && (
                  <div style={feedStyles.lockedTelemetrySummary}>
                    Locked: {MODES[lockedTelemetry.system.active_mode] || "Rig"} | Temp:{" "}
                    {lockedTelemetry.sensors.environment.temp_c.toFixed(1)}°C | Capacitance:{" "}
                    {lockedTelemetry.sensors.mpr121.capacitance} | Force:{" "}
                    {lockedTelemetry.sensors.mpu6050.peak_g.toFixed(3)} G
                  </div>
                )}
              </div>

              <div style={feedStyles.modalActionRow}>
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  style={feedStyles.cancelBtn}
                >
                  Cancel
                </button>

                <button type="submit" disabled={isSubmitting} style={feedStyles.submitPostBtn}>
                  {isSubmitting ? "Publishing..." : "Publish to Feed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const feedStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    width: "100%",
    position: "relative",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid var(--border-default)",
    paddingBottom: "1rem",
    gap: "12px",
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
  composeButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "8px 14px",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    minHeight: "40px",
  },
  scopeBar: {
    display: "flex",
    gap: "8px",
    borderBottom: "1px solid var(--border-subtle)",
    paddingBottom: "6px",
  },
  scopeTab: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "0.85rem",
    fontWeight: 600,
    padding: "6px 12px",
    cursor: "pointer",
    borderRadius: "4px",
  },
  scopeTabActive: {
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
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
  authorContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  avatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "0.85rem",
    flexShrink: 0,
  },
  authorLine: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  authorName: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  callsignPill: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "1px 6px",
    borderRadius: "4px",
    fontFamily: "monospace",
    border: "1px solid var(--border-default)",
  },
  usernameHandle: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
  },
  followBtn: {
    border: "1px solid",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
    marginLeft: "4px",
  },
  roleText: {
    fontSize: "0.7rem",
    color: "var(--text-secondary)",
    marginTop: "1px",
  },
  postDate: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  },
  locationBadge: {
    display: "inline-block",
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "3px 8px",
    borderRadius: "4px",
    border: "1px solid var(--border-default)",
    marginBottom: "0.75rem",
    fontWeight: 500,
  },
  postContent: {
    fontSize: "0.95rem",
    lineHeight: 1.6,
    margin: "0 0 1rem 0",
    whiteSpace: "pre-wrap",
  },
  mentionBadge: {
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    padding: "1px 6px",
    borderRadius: "4px",
    fontWeight: 600,
    fontFamily: "monospace",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
    margin: "0 2px",
  },
  imageContainer: {
    marginBottom: "1rem",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid var(--border-default)",
  },
  evidenceImage: {
    width: "100%",
    maxHeight: "460px",
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
  telemetryBadgeHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
    paddingBottom: "4px",
    marginBottom: "6px",
  },
  telemetryGrid: {
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
  actionBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: "0.75rem",
    borderTop: "1px solid var(--border-subtle)",
    flexWrap: "wrap",
    gap: "8px",
  },
  actionButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "0.8rem",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: "36px",
  },
  commentsDrawer: {
    marginTop: "0.75rem",
    paddingTop: "0.75rem",
    borderTop: "1px dashed var(--border-subtle)",
  },
  commentsList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "0.75rem",
  },
  noCommentsText: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    fontStyle: "italic",
    padding: "4px 0",
  },
  commentItem: {
    fontSize: "0.85rem",
    padding: "4px 0",
  },
  commentAuthor: {
    fontWeight: 600,
    marginRight: "6px",
    color: "var(--text-secondary)",
  },
  commentContent: {
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
    minHeight: "38px",
  },
  commentSubmitBtn: {
    padding: "8px 14px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  mentionDropdown: {
    position: "absolute",
    bottom: "46px",
    left: 0,
    right: 0,
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    boxShadow: "0 -4px 16px rgba(0,0,0,0.2)",
    maxHeight: "160px",
    overflowY: "auto",
    zIndex: 20,
    padding: "4px",
  },
  composeMentionDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    maxHeight: "160px",
    overflowY: "auto",
    zIndex: 20,
    padding: "4px",
  },
  mentionOption: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "4px",
    cursor: "pointer",
    backgroundColor: "transparent",
  },
  mentionOptionCallsign: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  mentionOptionName: {
    fontSize: "0.85rem",
    color: "var(--text-primary)",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    zIndex: 100,
  },
  modalCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.5rem",
    maxWidth: "540px",
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1rem",
    borderBottom: "1px solid var(--border-default)",
    paddingBottom: "0.5rem",
  },
  modalTitle: {
    fontSize: "1.15rem",
    fontWeight: 700,
    margin: 0,
  },
  modalCloseBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
  },
  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  fieldLabel: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "4px",
  },
  modalInput: {
    width: "100%",
    padding: "10px 12px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    minHeight: "44px",
  },
  modalTextarea: {
    width: "100%",
    padding: "10px 12px",
    background: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    resize: "vertical",
  },
  modalMediaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },
  mediaUploadBox: {
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "8px 12px",
  },
  fileField: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    width: "100%",
  },
  modalTelemetryBox: {
    padding: "12px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
  },
  modalTelemetryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
  },
  telemetryLockBtn: {
    padding: "6px 12px",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    minHeight: "36px",
  },
  discardBtn: {
    padding: "6px 12px",
    background: "transparent",
    color: "var(--accent-rose)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.75rem",
    minHeight: "36px",
  },
  lockedTelemetrySummary: {
    marginTop: "8px",
    fontSize: "0.75rem",
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  modalActionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "0.5rem",
  },
  cancelBtn: {
    padding: "10px 16px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.85rem",
    minHeight: "42px",
  },
  submitPostBtn: {
    padding: "10px 20px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.85rem",
    minHeight: "42px",
  },
};
