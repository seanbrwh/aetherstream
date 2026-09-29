import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// --- TYPES ---
interface Author {
  email: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface Post {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
  comments: Comment[];
}

export default function Feed() {
  const { token, logout } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState("");
  // Object to track comment input state for each individual post
  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});
  const [error, setError] = useState<string | null>(null);

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

      if (!res.ok) throw new Error("Failed to fetch feed data");

      const data = await res.json();
      setPosts(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [token, logout]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;
    setError(null);

    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newPostContent }),
      });

      if (!res.ok) throw new Error("Failed to publish post");

      setNewPostContent("");
      fetchFeed(); // Refresh the feed to get the new post with author data
    } catch (err: any) {
      setError(err.message);
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

      if (!res.ok) throw new Error("Failed to publish comment");

      // Clear the specific comment box input
      setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
      fetchFeed(); // Refresh the feed to pull in the new comment
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2 style={{ borderBottom: "1px solid #333", paddingBottom: "1rem", margin: 0 }}>
        Global Feed
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

      {/* CREATE POST BOX */}
      <form
        onSubmit={handleCreatePost}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginTop: "2rem",
          padding: "1rem",
          backgroundColor: "#0f0f0f",
          border: "1px solid #333",
        }}
      >
        <textarea
          placeholder="Transmit a message to the network..."
          value={newPostContent}
          onChange={(e) => setNewPostContent(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "10px",
            background: "#1a1a1a",
            color: "#00ffcc",
            border: "1px solid #333",
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
        <button
          type="submit"
          style={{
            alignSelf: "flex-end",
            padding: "8px 16px",
            background: "#00ffcc",
            color: "#000",
            cursor: "pointer",
            border: "none",
            fontWeight: "bold",
          }}
        >
          PUBLISH
        </button>
      </form>

      {/* FEED TIMELINE */}
      <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {posts.length === 0 ? (
          <p style={{ color: "#888" }}>No transmissions detected on the network.</p>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              style={{ border: "1px solid #00ffcc", padding: "1rem", backgroundColor: "#0a0a0a" }}
            >
              {/* POST HEADER */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px dotted #333",
                  paddingBottom: "0.5rem",
                  marginBottom: "1rem",
                  fontSize: "0.85em",
                  color: "#888",
                }}
              >
                <span style={{ color: "#00ffcc", fontWeight: "bold" }}>{post.author.email}</span>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>

              {/* POST CONTENT */}
              <p style={{ margin: "0 0 1.5rem 0", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                {post.content}
              </p>

              {/* COMMENTS SECTION */}
              <div
                style={{ marginLeft: "1rem", paddingLeft: "1rem", borderLeft: "2px solid #333" }}
              >
                {post.comments.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                      marginBottom: "1rem",
                    }}
                  >
                    {post.comments.map((comment) => (
                      <div key={comment.id} style={{ fontSize: "0.9em" }}>
                        <span style={{ color: "#00ffcc", fontWeight: "bold", marginRight: "8px" }}>
                          {comment.author.email}:
                        </span>
                        <span style={{ color: "#ccc" }}>{comment.content}</span>
                        <div style={{ fontSize: "0.8em", color: "#666", marginTop: "4px" }}>
                          {new Date(comment.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* CREATE COMMENT BOX */}
                <form
                  onSubmit={(e) => handleCreateComment(post.id, e)}
                  style={{ display: "flex", gap: "10px" }}
                >
                  <input
                    type="text"
                    placeholder="Append a comment..."
                    value={commentInputs[post.id] || ""}
                    onChange={(e) =>
                      setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                    }
                    style={{
                      flexGrow: 1,
                      padding: "8px",
                      background: "#0f0f0f",
                      color: "#00ffcc",
                      border: "1px solid #333",
                      fontFamily: "monospace",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "8px 16px",
                      background: "#333",
                      color: "#00ffcc",
                      cursor: "pointer",
                      border: "1px solid #555",
                    }}
                  >
                    REPLY
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
