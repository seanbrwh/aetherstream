import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

interface ProfileData {
  email: string;
  createdAt: string;
  posts: {
    id: string;
    content: string;
    createdAt: string;
  }[];
}

export default function Profile() {
  const { token, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch("/api/social/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 401 || res.status === 403) {
          logout();
          throw new Error("Session expired. Please log in again.");
        }

        if (!res.ok) throw new Error("Failed to load profile data");

        const data = await res.json();
        setProfile(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [token, logout]);

  if (isLoading) {
    return (
      <div style={{ color: "#00ffcc", fontFamily: "monospace" }}>
        Establishing secure connection to profile matrix...
      </div>
    );
  }

  if (error) {
    return <div style={{ color: "#ff4444", fontFamily: "monospace" }}>Error: {error}</div>;
  }

  if (!profile) {
    return null;
  }

  return (
    <div style={{ fontFamily: "monospace", color: "#00ffcc" }}>
      <h2 style={{ borderBottom: "1px solid #333", paddingBottom: "1rem", margin: 0 }}>
        Operator Profile
      </h2>

      <div
        style={{
          marginTop: "2rem",
          padding: "1.5rem",
          backgroundColor: "#0a0a0a",
          border: "1px solid #00ffcc",
        }}
      >
        <h3 style={{ margin: "0 0 1rem 0", color: "#fff" }}>Identity Data</h3>
        <p style={{ margin: "0.5rem 0" }}>
          <strong style={{ color: "#888" }}>Registered Email:</strong> {profile.email}
        </p>
        <p style={{ margin: "0.5rem 0" }}>
          <strong style={{ color: "#888" }}>System Entry Date:</strong>{" "}
          {new Date(profile.createdAt).toLocaleDateString()}
        </p>
        <p style={{ margin: "0.5rem 0" }}>
          <strong style={{ color: "#888" }}>Total Transmissions:</strong> {profile.posts.length}
        </p>
      </div>

      <div style={{ marginTop: "3rem" }}>
        <h3 style={{ borderBottom: "1px solid #333", paddingBottom: "0.5rem" }}>
          Personal Transmission Archive
        </h3>

        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {profile.posts.length === 0 ? (
            <p style={{ color: "#888" }}>No personal transmissions recorded.</p>
          ) : (
            profile.posts.map((post) => (
              <div
                key={post.id}
                style={{ border: "1px solid #333", padding: "1rem", backgroundColor: "#0f0f0f" }}
              >
                <div style={{ fontSize: "0.85em", color: "#666", marginBottom: "0.5rem" }}>
                  {new Date(post.createdAt).toLocaleString()}
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: "1.4" }}>
                  {post.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
