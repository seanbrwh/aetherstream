import { useState } from "react";
import { useAuth } from "../context/AuthContext";

interface CreateSquadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSquadCreatedOrJoined: () => void;
}

export default function CreateSquadModal({
  isOpen,
  onClose,
  onSquadCreatedOrJoined,
}: CreateSquadModalProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<"create" | "join">("create");

  // Form states
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [mission, setMission] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !callsign.trim()) {
      setError("Squad name and tactical callsign code are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/social/squads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          callsign: callsign.trim().toUpperCase(),
          mission: mission.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to form squad.");

      onSquadCreatedOrJoined();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      setError("Please enter the squad tactical callsign code.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/social/squads/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join squad.");

      onSquadCreatedOrJoined();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.card}>
        <div style={modalStyles.header}>
          <div>
            <div style={modalStyles.tag}>Tactical Formations</div>
            <h2 style={modalStyles.title}>Field Research Squads</h2>
          </div>
          <button onClick={onClose} style={modalStyles.closeBtn}>
            ✕
          </button>
        </div>

        <div style={modalStyles.tabs}>
          <button
            onClick={() => {
              setTab("create");
              setError(null);
            }}
            style={{
              ...modalStyles.tabBtn,
              backgroundColor: tab === "create" ? "var(--bg-surface-elevated)" : "transparent",
              color: tab === "create" ? "var(--accent-primary)" : "var(--text-muted)",
              borderBottom: tab === "create" ? "2px solid var(--accent-primary)" : "none",
            }}
          >
            Form New Squad
          </button>
          <button
            onClick={() => {
              setTab("join");
              setError(null);
            }}
            style={{
              ...modalStyles.tabBtn,
              backgroundColor: tab === "join" ? "var(--bg-surface-elevated)" : "transparent",
              color: tab === "join" ? "var(--accent-primary)" : "var(--text-muted)",
              borderBottom: tab === "join" ? "2px solid var(--accent-primary)" : "none",
            }}
          >
            Join with Code
          </button>
        </div>

        {error && <div style={modalStyles.errorNotice}>{error}</div>}

        {tab === "create" ? (
          <form onSubmit={handleCreate} style={modalStyles.form}>
            <div>
              <label style={modalStyles.label}>Squad Name</label>
              <input
                type="text"
                placeholder="e.g. Unit 4 Baseline Sweep"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={modalStyles.input}
              />
            </div>

            <div>
              <label style={modalStyles.label}>Squad Callsign Code (Unique)</label>
              <input
                type="text"
                placeholder="e.g. SPECTER-SQUAD"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                style={modalStyles.input}
              />
              <span style={modalStyles.helpText}>
                Other units enter this code to link into the squad.
              </span>
            </div>

            <div>
              <label style={modalStyles.label}>Mission Objective (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Primary corridor thermal tracking & ITC audio recording"
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                style={modalStyles.input}
              />
            </div>

            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? "Initializing Squad..." : "Form Squad Frequency"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} style={modalStyles.form}>
            <div>
              <label style={modalStyles.label}>Enter Squad Callsign Code</label>
              <input
                type="text"
                placeholder="e.g. SPECTER-SQUAD"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                style={modalStyles.input}
              />
              <span style={modalStyles.helpText}>Ask the squad lead for their tactical code.</span>
            </div>

            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? "Connecting..." : "Join Squad Frequency"}
            </button>
          </form>
        )}
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
    zIndex: 110,
  },
  card: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    maxWidth: "460px",
    width: "100%",
    padding: "1.25rem",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid var(--border-default)",
    paddingBottom: "0.75rem",
  },
  tag: {
    fontSize: "0.65rem",
    color: "var(--accent-primary)",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  title: {
    fontSize: "1.15rem",
    fontWeight: 700,
    margin: "2px 0 0 0",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
  },
  tabs: {
    display: "flex",
    gap: "4px",
    borderBottom: "1px solid var(--border-subtle)",
    marginTop: "10px",
  },
  tabBtn: {
    flexGrow: 1,
    padding: "8px",
    border: "none",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  errorNotice: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    color: "var(--accent-rose)",
    padding: "8px 10px",
    borderRadius: "4px",
    fontSize: "0.8rem",
    marginTop: "10px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "12px",
  },
  label: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
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
  helpText: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    marginTop: "3px",
    display: "block",
  },
  submitBtn: {
    padding: "10px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    marginTop: "6px",
  },
};
