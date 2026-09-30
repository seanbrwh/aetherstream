import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../lib/socket";

interface Floorplan {
  id: string;
  title: string;
  imageUrl: string;
  createdAt: string;
}

interface PlanItem {
  id: string;
  title: string;
  phase: "PRE_HUNT" | "ACTIVE" | "DEBRIEF";
  assignedTo: string | null;
  completed: boolean;
}

interface SquadMemberData {
  id: string;
  role: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    callsign: string | null;
    role: string | null;
    gearLoadout: string | null;
  };
}

interface SquadData {
  id: string;
  name: string;
  callsign: string;
  mission: string | null;
  location: string | null;
  huntDate: string | null;
  stagingNotes: string | null;
  leader: {
    id: string;
    username: string;
    displayName: string | null;
    callsign: string | null;
  };
  members: SquadMemberData[];
  floorplans: Floorplan[];
  planItems: PlanItem[];
}

interface SquadChatMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    displayName: string | null;
    callsign: string | null;
  };
}

export default function SquadHub() {
  const { squadId } = useParams<{ squadId: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [squad, setSquad] = useState<SquadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<"plans" | "floorplans" | "gear" | "comms">("plans");

  // Mission edit state
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [briefLocation, setBriefLocation] = useState("");
  const [briefHuntDate, setBriefHuntDate] = useState("");
  const [briefMission, setBriefMission] = useState("");
  const [briefStaging, setBriefStaging] = useState("");

  // Floor plan upload state
  const [floorplanTitle, setFloorplanTitle] = useState("");
  const [floorplanFile, setFloorplanFile] = useState<File | null>(null);
  const [isUploadingPlan, setIsUploadingPlan] = useState(false);
  const [selectedPlanView, setSelectedPlanView] = useState<string | null>(null);

  // Tactical checklist state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPhase, setNewTaskPhase] = useState<"PRE_HUNT" | "ACTIVE" | "DEBRIEF">("PRE_HUNT");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");

  // Group comms state
  const [messages, setMessages] = useState<SquadChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSquad = async () => {
    if (!squadId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/social/squads/${squadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not access squad expedition file.");

      const data: SquadData = await res.json();
      setSquad(data);
      setBriefLocation(data.location || "");
      setBriefHuntDate(data.huntDate ? data.huntDate.slice(0, 16) : "");
      setBriefMission(data.mission || "");
      setBriefStaging(data.stagingNotes || "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!squadId || !token) return;
    try {
      const res = await fetch(`/api/social/squads/${squadId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Fetch squad comms error:", err);
    }
  };

  useEffect(() => {
    fetchSquad();
    fetchMessages();

    const socket = getSocket();
    socket.emit("join_squad", squadId);

    const handleNewSquadMessage = (msg: SquadChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on("new_squad_message", handleNewSquadMessage);

    return () => {
      socket.off("new_squad_message", handleNewSquadMessage);
    };
  }, [squadId, token]);

  useEffect(() => {
    if (activeTab === "comms") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  const handleSaveBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!squadId) return;

    try {
      const res = await fetch(`/api/social/squads/${squadId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location: briefLocation,
          huntDate: briefHuntDate || null,
          mission: briefMission,
          stagingNotes: briefStaging,
        }),
      });

      if (!res.ok) throw new Error("Failed to update mission briefing.");
      setIsEditingBrief(false);
      fetchSquad();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUploadFloorplan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floorplanFile || !squadId) return;

    setIsUploadingPlan(true);
    const formData = new FormData();
    formData.append("title", floorplanTitle.trim() || "Site Blueprint");
    formData.append("photo", floorplanFile);

    try {
      const res = await fetch(`/api/social/squads/${squadId}/floorplans`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Blueprint upload failed.");
      setFloorplanTitle("");
      setFloorplanFile(null);
      fetchSquad();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUploadingPlan(false);
    }
  };

  const handleDeleteFloorplan = async (planId: string) => {
    if (!confirm("Remove this blueprint from the squad hub?")) return;
    try {
      await fetch(`/api/social/squads/${squadId}/floorplans/${planId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchSquad();
    } catch (err) {
      console.error("Delete floorplan error:", err);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !squadId) return;

    try {
      const res = await fetch(`/api/social/squads/${squadId}/plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          phase: newTaskPhase,
          assignedTo: newTaskAssignee.trim() || null,
        }),
      });

      if (res.ok) {
        setNewTaskTitle("");
        setNewTaskAssignee("");
        fetchSquad();
      }
    } catch (err) {
      console.error("Add task error:", err);
    }
  };

  const handleToggleTask = async (itemId: string) => {
    setSquad((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        planItems: prev.planItems.map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item,
        ),
      };
    });

    try {
      await fetch(`/api/social/squads/${squadId}/plans/${itemId}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("Toggle task error:", err);
      fetchSquad();
    }
  };

  const handleDeleteTask = async (itemId: string) => {
    try {
      await fetch(`/api/social/squads/${squadId}/plans/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchSquad();
    } catch (err) {
      console.error("Delete task error:", err);
    }
  };

  const handleSendSquadMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() || !squadId) return;

    const content = msgInput.trim();
    setMsgInput("");

    try {
      await fetch(`/api/social/squads/${squadId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error("Send squad message error:", err);
    }
  };

  if (loading) {
    return <div style={hubStyles.centerNotice}>Accessing Squad Expedition Briefing...</div>;
  }

  if (error || !squad) {
    return (
      <div style={hubStyles.errorCard}>
        <h3>Expedition Hub Error</h3>
        <p>{error || "Squad records could not be found."}</p>
        <button onClick={() => navigate("/feed")} style={hubStyles.buttonPrimary}>
          Return to Feed
        </button>
      </div>
    );
  }

  const preTasks = squad.planItems.filter((i) => i.phase === "PRE_HUNT");
  const activeTasks = squad.planItems.filter((i) => i.phase === "ACTIVE");
  const debriefTasks = squad.planItems.filter((i) => i.phase === "DEBRIEF");

  return (
    <div style={hubStyles.container}>
      {/* SQUAD COMMAND BANNER */}
      <div style={hubStyles.headerCard}>
        <div style={hubStyles.headerTopRow}>
          <div>
            <div style={hubStyles.tagLine}>Expedition Headquarters</div>
            <div style={hubStyles.titleRow}>
              <h1 style={hubStyles.squadTitle}>{squad.name}</h1>
              <span style={hubStyles.callsignBadge}>[{squad.callsign}]</span>
            </div>
            <div style={hubStyles.leadLine}>
              Led by {squad.leader.displayName || squad.leader.username} ({squad.members.length}{" "}
              Units Enrolled)
            </div>
          </div>

          <button
            onClick={() => setIsEditingBrief(!isEditingBrief)}
            style={hubStyles.buttonSecondary}
          >
            {isEditingBrief ? "Cancel Briefing Edit" : "Edit Mission Briefing"}
          </button>
        </div>

        {/* BRIEFING SPECIFICATIONS */}
        {!isEditingBrief ? (
          <div style={hubStyles.briefSummaryGrid}>
            <div style={hubStyles.briefItem}>
              <span style={hubStyles.briefLabel}>Target Site:</span>
              <span style={hubStyles.briefValue}>{squad.location || "Location Not Specified"}</span>
            </div>
            <div style={hubStyles.briefItem}>
              <span style={hubStyles.briefLabel}>Target Deployment:</span>
              <span style={hubStyles.briefValue}>
                {squad.huntDate
                  ? new Date(squad.huntDate).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Time Window Standby"}
              </span>
            </div>
            <div style={hubStyles.briefItem}>
              <span style={hubStyles.briefLabel}>Mission Scope:</span>
              <span style={hubStyles.briefValue}>
                {squad.mission || "General Environmental Investigation"}
              </span>
            </div>
            <div style={hubStyles.briefItem}>
              <span style={hubStyles.briefLabel}>Staging Notes:</span>
              <span style={hubStyles.briefValue}>
                {squad.stagingNotes || "No special staging instructions entered."}
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveBrief} style={hubStyles.editBriefForm}>
            <div style={hubStyles.formGrid}>
              <div>
                <label style={hubStyles.label}>Target Site / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Old Mill Processing Plant"
                  value={briefLocation}
                  onChange={(e) => setBriefLocation(e.target.value)}
                  style={hubStyles.input}
                />
              </div>

              <div>
                <label style={hubStyles.label}>Target Deployment Date & Time</label>
                <input
                  type="datetime-local"
                  value={briefHuntDate}
                  onChange={(e) => setBriefHuntDate(e.target.value)}
                  style={hubStyles.input}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={hubStyles.label}>Mission Directive</label>
                <input
                  type="text"
                  placeholder="e.g. Map thermal drops and capture baseline EVP sweeps in eastern tunnels"
                  value={briefMission}
                  onChange={(e) => setBriefMission(e.target.value)}
                  style={hubStyles.input}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={hubStyles.label}>Staging Area & Entry Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Park behind south gate. Wear boots. First staging check at 21:00."
                  value={briefStaging}
                  onChange={(e) => setBriefStaging(e.target.value)}
                  style={hubStyles.textarea}
                />
              </div>
            </div>

            <button type="submit" style={hubStyles.buttonPrimary}>
              Save Expedition Briefing
            </button>
          </form>
        )}
      </div>

      {/* WORKSPACE NAVIGATION TABS */}
      <div style={hubStyles.tabStrip}>
        <button
          onClick={() => setActiveTab("plans")}
          style={{
            ...hubStyles.tabButton,
            borderBottomColor: activeTab === "plans" ? "var(--accent-primary)" : "transparent",
            color: activeTab === "plans" ? "var(--accent-primary)" : "var(--text-secondary)",
          }}
        >
          Tactical Action Plan ({squad.planItems.filter((p) => p.completed).length}/
          {squad.planItems.length})
        </button>

        <button
          onClick={() => setActiveTab("floorplans")}
          style={{
            ...hubStyles.tabButton,
            borderBottomColor: activeTab === "floorplans" ? "var(--accent-primary)" : "transparent",
            color: activeTab === "floorplans" ? "var(--accent-primary)" : "var(--text-secondary)",
          }}
        >
          Floor Plans & Blueprints ({squad.floorplans.length})
        </button>

        <button
          onClick={() => setActiveTab("gear")}
          style={{
            ...hubStyles.tabButton,
            borderBottomColor: activeTab === "gear" ? "var(--accent-primary)" : "transparent",
            color: activeTab === "gear" ? "var(--accent-primary)" : "var(--text-secondary)",
          }}
        >
          Squad Gear Manifest ({squad.members.length} Units)
        </button>

        <button
          onClick={() => setActiveTab("comms")}
          style={{
            ...hubStyles.tabButton,
            borderBottomColor: activeTab === "comms" ? "var(--accent-primary)" : "transparent",
            color: activeTab === "comms" ? "var(--accent-primary)" : "var(--text-secondary)",
          }}
        >
          Squad Radio Channel ({messages.length})
        </button>
      </div>

      {/* TAB 1: TACTICAL ACTION PLAN */}
      {activeTab === "plans" && (
        <div style={hubStyles.sectionContainer}>
          <div style={hubStyles.sectionHeader}>
            <div>
              <h2 style={hubStyles.sectionTitle}>Investigation Checklist & Tasks</h2>
              <div style={hubStyles.sectionSubtitle}>
                Synchronized action phases for pre-hunt prep, active investigation, and post-hunt
                review.
              </div>
            </div>
          </div>

          {/* ADD TASK COMPOSER */}
          <form onSubmit={handleAddTask} style={hubStyles.taskComposer}>
            <input
              type="text"
              placeholder="Add action item (e.g. Set up baseline thermometer in furnace room)..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              style={hubStyles.taskInput}
            />

            <select
              value={newTaskPhase}
              onChange={(e: any) => setNewTaskPhase(e.target.value)}
              style={hubStyles.selectField}
            >
              <option value="PRE_HUNT">Phase 1: Pre-Hunt Prep</option>
              <option value="ACTIVE">Phase 2: Active Investigation</option>
              <option value="DEBRIEF">Phase 3: Debrief & Evidence</option>
            </select>

            <select
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value)}
              style={hubStyles.selectField}
            >
              <option value="">Assign To: Anyone</option>
              {squad.members.map((m) => (
                <option key={m.id} value={m.user.callsign || m.user.username}>
                  {m.user.callsign ? `[${m.user.callsign}] ` : ""}
                  {m.user.displayName || m.user.username}
                </option>
              ))}
            </select>

            <button type="submit" style={hubStyles.buttonPrimary}>
              + Add Task
            </button>
          </form>

          {/* THREE PHASE CHECKLIST COLUMNS */}
          <div style={hubStyles.phaseColumnsGrid}>
            {/* PHASE 1: PRE-HUNT */}
            <div style={hubStyles.phaseBox}>
              <div style={hubStyles.phaseBoxHeader}>Phase 1: Pre-Hunt Preparation</div>
              <div style={hubStyles.taskList}>
                {preTasks.length === 0 ? (
                  <div style={hubStyles.emptyTaskNotice}>No prep items added.</div>
                ) : (
                  preTasks.map((t) => (
                    <div key={t.id} style={hubStyles.taskRow}>
                      <input
                        type="checkbox"
                        checked={t.completed}
                        onChange={() => handleToggleTask(t.id)}
                        style={hubStyles.taskCheckbox}
                      />
                      <div style={{ flexGrow: 1 }}>
                        <div
                          style={{
                            ...hubStyles.taskItemTitle,
                            textDecoration: t.completed ? "line-through" : "none",
                            color: t.completed ? "var(--text-muted)" : "var(--text-primary)",
                          }}
                        >
                          {t.title}
                        </div>
                        {t.assignedTo && (
                          <div style={hubStyles.taskAssigneeBadge}>Assigned: {t.assignedTo}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        style={hubStyles.taskDeleteBtn}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* PHASE 2: ACTIVE HUNT */}
            <div style={hubStyles.phaseBox}>
              <div style={hubStyles.phaseBoxHeader}>Phase 2: Active Sweep</div>
              <div style={hubStyles.taskList}>
                {activeTasks.length === 0 ? (
                  <div style={hubStyles.emptyTaskNotice}>No active sweep tasks entered.</div>
                ) : (
                  activeTasks.map((t) => (
                    <div key={t.id} style={hubStyles.taskRow}>
                      <input
                        type="checkbox"
                        checked={t.completed}
                        onChange={() => handleToggleTask(t.id)}
                        style={hubStyles.taskCheckbox}
                      />
                      <div style={{ flexGrow: 1 }}>
                        <div
                          style={{
                            ...hubStyles.taskItemTitle,
                            textDecoration: t.completed ? "line-through" : "none",
                            color: t.completed ? "var(--text-muted)" : "var(--text-primary)",
                          }}
                        >
                          {t.title}
                        </div>
                        {t.assignedTo && (
                          <div style={hubStyles.taskAssigneeBadge}>Assigned: {t.assignedTo}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        style={hubStyles.taskDeleteBtn}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* PHASE 3: DEBRIEF */}
            <div style={hubStyles.phaseBox}>
              <div style={hubStyles.phaseBoxHeader}>Phase 3: Debrief & Evidence</div>
              <div style={hubStyles.taskList}>
                {debriefTasks.length === 0 ? (
                  <div style={hubStyles.emptyTaskNotice}>No debrief items.</div>
                ) : (
                  debriefTasks.map((t) => (
                    <div key={t.id} style={hubStyles.taskRow}>
                      <input
                        type="checkbox"
                        checked={t.completed}
                        onChange={() => handleToggleTask(t.id)}
                        style={hubStyles.taskCheckbox}
                      />
                      <div style={{ flexGrow: 1 }}>
                        <div
                          style={{
                            ...hubStyles.taskItemTitle,
                            textDecoration: t.completed ? "line-through" : "none",
                            color: t.completed ? "var(--text-muted)" : "var(--text-primary)",
                          }}
                        >
                          {t.title}
                        </div>
                        {t.assignedTo && (
                          <div style={hubStyles.taskAssigneeBadge}>Assigned: {t.assignedTo}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        style={hubStyles.taskDeleteBtn}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FLOOR PLANS & BLUEPRINTS */}
      {activeTab === "floorplans" && (
        <div style={hubStyles.sectionContainer}>
          <div style={hubStyles.sectionHeader}>
            <div>
              <h2 style={hubStyles.sectionTitle}>Site Floor Plans & Blueprints</h2>
              <div style={hubStyles.sectionSubtitle}>
                Upload sketches, architectural schematics, or satellite layouts to coordinate sweep
                zones.
              </div>
            </div>
          </div>

          {/* BLUEPRINT UPLOADER */}
          <form onSubmit={handleUploadFloorplan} style={hubStyles.planUploadCard}>
            <div style={hubStyles.planUploadInputs}>
              <input
                type="text"
                placeholder="Blueprint Title (e.g. 2nd Floor Attic & Corridor)"
                value={floorplanTitle}
                onChange={(e) => setFloorplanTitle(e.target.value)}
                style={hubStyles.input}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFloorplanFile(e.target.files?.[0] || null)}
                style={hubStyles.fileInput}
              />
            </div>
            <button
              type="submit"
              disabled={isUploadingPlan || !floorplanFile}
              style={{
                ...hubStyles.buttonPrimary,
                opacity: isUploadingPlan || !floorplanFile ? 0.6 : 1,
              }}
            >
              {isUploadingPlan ? "Uploading Blueprint..." : "Upload Floor Plan"}
            </button>
          </form>

          {/* FLOORPLAN GALLERY GRID */}
          {squad.floorplans.length === 0 ? (
            <div style={hubStyles.emptyBox}>
              No blueprints uploaded yet. Add a room layout or sketch above to help your squad
              navigate.
            </div>
          ) : (
            <div style={hubStyles.galleryGrid}>
              {squad.floorplans.map((fp) => (
                <div key={fp.id} style={hubStyles.blueprintCard}>
                  <div style={hubStyles.blueprintHeader}>
                    <span style={hubStyles.blueprintTitle}>{fp.title}</span>
                    <button
                      onClick={() => handleDeleteFloorplan(fp.id)}
                      style={hubStyles.taskDeleteBtn}
                    >
                      Delete
                    </button>
                  </div>

                  <div
                    onClick={() => setSelectedPlanView(fp.imageUrl)}
                    style={hubStyles.blueprintImgWrap}
                  >
                    <img src={fp.imageUrl} alt={fp.title} style={hubStyles.blueprintImg} />
                  </div>
                  <div style={hubStyles.blueprintFooter}>Click image to view full scale</div>
                </div>
              ))}
            </div>
          )}

          {/* FULL SCREEN IMAGE MODAL */}
          {selectedPlanView && (
            <div onClick={() => setSelectedPlanView(null)} style={hubStyles.imageOverlay}>
              <img src={selectedPlanView} alt="Blueprint Scale" style={hubStyles.fullImage} />
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SQUAD GEAR MANIFEST */}
      {activeTab === "gear" && (
        <div style={hubStyles.sectionContainer}>
          <div style={hubStyles.sectionHeader}>
            <div>
              <h2 style={hubStyles.sectionTitle}>Squad Equipment Loadout Manifest</h2>
              <div style={hubStyles.sectionSubtitle}>
                Live hardware inventory registered by joined investigators in their personal
                dossiers.
              </div>
            </div>
          </div>

          <div style={hubStyles.gearManifestList}>
            {squad.members.map((m) => (
              <div key={m.id} style={hubStyles.gearManifestCard}>
                <div style={hubStyles.operatorMetaLeft}>
                  <div style={hubStyles.operatorCallsign}>
                    {m.user.callsign ? `[${m.user.callsign}] ` : ""}
                    {m.user.displayName || m.user.username}
                  </div>
                  <div style={hubStyles.operatorRoleBadge}>
                    {m.role} // {m.user.role || "Investigator"}
                  </div>
                </div>

                <div style={hubStyles.loadoutRight}>
                  <div style={hubStyles.loadoutLabel}>Field Gear Deployed:</div>
                  <div style={hubStyles.loadoutContent}>
                    {m.user.gearLoadout || "Standard issue telemetry sensor unit."}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SQUAD RADIO CHANNEL */}
      {activeTab === "comms" && (
        <div style={hubStyles.sectionContainer}>
          <div style={hubStyles.sectionHeader}>
            <div>
              <h2 style={hubStyles.sectionTitle}>Squad Direct Radio Channel</h2>
              <div style={hubStyles.sectionSubtitle}>
                Encrypted communication room shared exclusively among enrolled squad members.
              </div>
            </div>
          </div>

          <div style={hubStyles.commsStream}>
            {messages.length === 0 ? (
              <div style={hubStyles.emptyBox}>
                No field radio transmissions yet. Open the line below.
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender.id === user?.id;
                return (
                  <div
                    key={msg.id}
                    style={{
                      ...hubStyles.msgRow,
                      justifyContent: isMine ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        ...hubStyles.msgBubble,
                        backgroundColor: isMine
                          ? "var(--accent-primary)"
                          : "var(--bg-surface-elevated)",
                        color: isMine ? "#ffffff" : "var(--text-primary)",
                      }}
                    >
                      <div style={hubStyles.msgSender}>
                        {msg.sender.callsign ? `[${msg.sender.callsign}] ` : ""}
                        {msg.sender.displayName || msg.sender.username}
                      </div>
                      <div style={hubStyles.msgContent}>{msg.content}</div>
                      <div style={hubStyles.msgTime}>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendSquadMessage} style={hubStyles.commsInputForm}>
            <input
              type="text"
              placeholder={`Broadcast to ${squad.callsign}...`}
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              style={hubStyles.input}
            />
            <button type="submit" style={hubStyles.buttonPrimary}>
              Broadcast
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const hubStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    width: "100%",
  },
  centerNotice: {
    textAlign: "center",
    padding: "3rem",
    color: "var(--text-muted)",
  },
  errorCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--accent-rose)",
    borderRadius: "8px",
    padding: "2rem",
    textAlign: "center",
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
  headerTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "12px",
  },
  tagLine: {
    fontSize: "0.7rem",
    color: "var(--accent-primary)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  squadTitle: {
    fontSize: "1.4rem",
    fontWeight: 700,
    margin: "2px 0 0 0",
  },
  callsignBadge: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    padding: "2px 8px",
    borderRadius: "4px",
    fontFamily: "monospace",
  },
  leadLine: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  briefSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "12px 16px",
  },
  briefItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  briefLabel: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  briefValue: {
    fontSize: "0.85rem",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  editBriefForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "1rem",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },
  label: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    fontWeight: 600,
    marginBottom: "4px",
    display: "block",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  buttonPrimary: {
    padding: "8px 16px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    width: "fit-content",
  },
  buttonSecondary: {
    padding: "8px 14px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  tabStrip: {
    display: "flex",
    gap: "6px",
    borderBottom: "1px solid var(--border-default)",
    overflowX: "auto",
  },
  tabButton: {
    padding: "10px 14px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  sectionContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  taskComposer: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "10px",
  },
  taskInput: {
    flexGrow: 1,
    minWidth: "220px",
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "15px",
  },
  selectField: {
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "14px",
  },
  phaseColumnsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "1rem",
  },
  phaseBox: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  phaseBoxHeader: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    borderBottom: "1px solid var(--border-subtle)",
    paddingBottom: "6px",
  },
  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  emptyTaskNotice: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    fontStyle: "italic",
    padding: "0.5rem 0",
  },
  taskRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "6px",
    padding: "8px 10px",
  },
  taskCheckbox: {
    marginTop: "3px",
    cursor: "pointer",
  },
  taskItemTitle: {
    fontSize: "0.85rem",
    fontWeight: 500,
    lineHeight: 1.3,
  },
  taskAssigneeBadge: {
    fontSize: "0.7rem",
    color: "var(--accent-primary)",
    marginTop: "2px",
    fontWeight: 600,
  },
  taskDeleteBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  planUploadCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  planUploadInputs: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px",
  },
  fileInput: {
    fontSize: "0.8rem",
    color: "var(--text-secondary)",
  },
  emptyBox: {
    padding: "2rem",
    textAlign: "center",
    backgroundColor: "var(--bg-surface)",
    border: "1px dashed var(--border-default)",
    borderRadius: "8px",
    color: "var(--text-muted)",
    fontSize: "0.85rem",
  },
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "1rem",
  },
  blueprintCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  blueprintHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blueprintTitle: {
    fontSize: "0.85rem",
    fontWeight: 700,
  },
  blueprintImgWrap: {
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid var(--border-subtle)",
    cursor: "zoom-in",
    maxHeight: "220px",
    backgroundColor: "#000000",
  },
  blueprintImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  blueprintFooter: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    textAlign: "center",
  },
  imageOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    zIndex: 1200,
    cursor: "zoom-out",
  },
  fullImage: {
    maxWidth: "90vw",
    maxHeight: "90vh",
    objectFit: "contain",
    borderRadius: "6px",
  },
  gearManifestList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  gearManifestCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
  },
  operatorMetaLeft: {
    minWidth: "200px",
  },
  operatorCallsign: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  operatorRoleBadge: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginTop: "2px",
  },
  loadoutRight: {
    flexGrow: 1,
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "6px",
    padding: "8px 12px",
  },
  loadoutLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  loadoutContent: {
    fontSize: "0.85rem",
    color: "var(--text-primary)",
    marginTop: "2px",
  },
  commsStream: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1rem",
    height: "360px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  msgRow: {
    display: "flex",
    width: "100%",
  },
  msgBubble: {
    maxWidth: "75%",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "0.85rem",
    lineHeight: 1.4,
  },
  msgSender: {
    fontSize: "0.7rem",
    fontWeight: 700,
    marginBottom: "2px",
    opacity: 0.9,
  },
  msgContent: {
    wordBreak: "break-word",
  },
  msgTime: {
    fontSize: "0.65rem",
    opacity: 0.75,
    textAlign: "right",
    marginTop: "4px",
  },
  commsInputForm: {
    display: "flex",
    gap: "8px",
  },
};
