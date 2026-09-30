import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../lib/socket";

interface InvestigatorPartner {
  id: string;
  username: string;
  displayName?: string | null;
  callsign?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
}

interface ConversationItem {
  partner: InvestigatorPartner;
  latestMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    readAt: string | null;
  };
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  senderId: string;
  sender: {
    id: string;
    username: string;
    displayName?: string | null;
    callsign?: string | null;
  };
}

interface DockedMessengerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadChange?: (totalUnread: number) => void;
  initialPartner?: InvestigatorPartner | null;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

export default function DockedMessenger({
  isOpen,
  onClose,
  onUnreadChange,
  initialPartner = null,
}: DockedMessengerProps) {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [isMinimized, setIsMinimized] = useState(false);
  const [view, setView] = useState<"chat" | "threads" | "directory">("threads");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activePartner, setActivePartner] = useState<InvestigatorPartner | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [peerTypingLabel, setPeerTypingLabel] = useState("Operator");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [directory, setDirectory] = useState<InvestigatorPartner[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activePartnerRef = useRef<InvestigatorPartner | null>(null);
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<TimeoutHandle | null>(null);
  const peerTypingTimeoutRef = useRef<TimeoutHandle | null>(null);

  useEffect(() => {
    activePartnerRef.current = activePartner;
  }, [activePartner]);

  useEffect(() => {
    if (initialPartner) {
      setActivePartner(initialPartner);
      setView("chat");
      setIsMinimized(false);
    }
  }, [initialPartner]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!isMinimized && view === "chat") {
      scrollToBottom();
    }
  }, [messages, isPeerTyping, isMinimized, view]);

  const fetchConversations = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/social/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: ConversationItem[] = await res.json();
        setConversations(data);
        const total = data.reduce((acc, c) => acc + c.unreadCount, 0);
        onUnreadChange?.(total);
      }
    } catch (err) {
      console.error("Fetch conversations error:", err);
    }
  };

  const fetchDirectory = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/social/investigators", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: InvestigatorPartner[] = await res.json();
        setDirectory(data);
      }
    } catch (err) {
      console.error("Fetch directory error:", err);
    }
  };

  const fetchMessagesForPartner = async (partnerId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/social/messages/${partnerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: ChatMessage[] = await res.json();
        setMessages(data);

        await fetch(`/api/social/messages/${partnerId}/read`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (user) {
          const socket = getSocket();
          socket.emit("mark_read", { readerId: user.id, senderId: partnerId });
        }

        setConversations((prev) =>
          prev.map((c) => (c.partner.id === partnerId ? { ...c, unreadCount: 0 } : c)),
        );
      }
    } catch (err) {
      console.error("Fetch thread error:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
      fetchDirectory();
    }
  }, [isOpen, token]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const joinChannel = () => {
      socket.emit("join_user", user.id);
    };

    if (socket.connected) {
      joinChannel();
    }
    socket.on("connect", joinChannel);

    const handleNewDirectMessage = (msg: ChatMessage) => {
      const currentPartner = activePartnerRef.current;
      if (
        currentPartner &&
        (msg.senderId === currentPartner.id ||
          (msg.senderId === user.id && msg.sender.id === user.id))
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const filtered = prev.filter(
            (m) => !m.id.startsWith("temp-") || m.content !== msg.content,
          );
          return [...filtered, msg];
        });

        if (msg.senderId === currentPartner.id) {
          socket.emit("mark_read", { readerId: user.id, senderId: currentPartner.id });
          setIsPeerTyping(false);
        }
      }

      fetchConversations();
    };

    const handleReadReceipt = (payload: { readerId: string; readAt: string }) => {
      const currentPartner = activePartnerRef.current;
      if (currentPartner && currentPartner.id === payload.readerId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === user.id && !m.readAt ? { ...m, readAt: payload.readAt } : m,
          ),
        );
      }
    };

    const handlePeerTyping = (payload: { senderId: string; senderCallsign?: string }) => {
      const currentPartner = activePartnerRef.current;
      if (currentPartner && currentPartner.id === payload.senderId) {
        setPeerTypingLabel(
          payload.senderCallsign || currentPartner.callsign || currentPartner.username,
        );
        setIsPeerTyping(true);

        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = setTimeout(() => {
          setIsPeerTyping(false);
        }, 3500);
      }
    };

    const handlePeerStopTyping = (payload: { senderId: string }) => {
      const currentPartner = activePartnerRef.current;
      if (currentPartner && currentPartner.id === payload.senderId) {
        setIsPeerTyping(false);
        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
      }
    };

    socket.on("new_direct_message", handleNewDirectMessage);
    socket.on("messages_read_receipt", handleReadReceipt);
    socket.on("peer_typing", handlePeerTyping);
    socket.on("peer_stop_typing", handlePeerStopTyping);

    return () => {
      socket.off("connect", joinChannel);
      socket.off("new_direct_message", handleNewDirectMessage);
      socket.off("messages_read_receipt", handleReadReceipt);
      socket.off("peer_typing", handlePeerTyping);
      socket.off("peer_stop_typing", handlePeerStopTyping);
    };
  }, [user]);

  useEffect(() => {
    if (activePartner) {
      fetchMessagesForPartner(activePartner.id);
      setIsPeerTyping(false);
      setSendError(null);
    }
  }, [activePartner]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = inputText.trim();
    if (!content || !activePartner || !user || isSending) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    isTypingRef.current = false;
    const socket = getSocket();
    socket.emit("typing_stop", {
      senderId: user.id,
      receiverId: activePartner.id,
    });

    setSendError(null);
    setIsSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      readAt: null,
      senderId: user.id,
      sender: {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        callsign: user.callsign ?? null,
      },
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInputText("");

    try {
      const res = await fetch("/api/social/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: activePartner.id,
          content,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to transmit message.");
      }

      const savedMessage: ChatMessage = await res.json();

      setMessages((prev) => prev.map((m) => (m.id === tempId ? savedMessage : m)));

      fetchConversations();
    } catch (err: any) {
      console.error("Transmission error:", err);
      setSendError(err.message || "Transmission failed to dispatch.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(content);
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (!activePartner || !user) return;
    const socket = getSocket();

    if (!isTypingRef.current && val.trim().length > 0) {
      isTypingRef.current = true;
      socket.emit("typing_start", {
        senderId: user.id,
        receiverId: activePartner.id,
        senderCallsign: user.callsign || user.displayName || user.username,
      });
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit("typing_stop", {
        senderId: user.id,
        receiverId: activePartner.id,
      });
    }, 1800);
  };

  if (!isOpen) return null;

  const totalUnread = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  // MINIMIZED DOCK BAR VIEW
  if (isMinimized) {
    return (
      <aside style={dockStyles.minimizedBar} onClick={() => setIsMinimized(false)}>
        <div style={dockStyles.minimizedLeft}>
          <span style={dockStyles.radioIcon}>📻</span>
          <span style={dockStyles.minimizedTitle}>
            {activePartner
              ? `Channel: ${activePartner.callsign ? `[${activePartner.callsign}]` : activePartner.username}`
              : "Field Comms"}
          </span>
          {totalUnread > 0 && <span style={dockStyles.unreadBadgeMini}>{totalUnread}</span>}
        </div>
        <div style={dockStyles.minimizedControls}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(false);
            }}
            style={dockStyles.controlBtn}
            title="Expand Messenger"
          >
            ▲
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={dockStyles.controlBtn}
            title="Close Messenger"
          >
            ✕
          </button>
        </div>
      </aside>
    );
  }

  // EXPANDED DOCKED WINDOW
  return (
    <aside style={dockStyles.dockWindow} aria-label="Field Comms Dock">
      {/* DOCK TOP BAR */}
      <div style={dockStyles.dockHeader}>
        <div style={dockStyles.headerLeft}>
          {view === "chat" && (
            <button
              onClick={() => setView("threads")}
              style={dockStyles.backBtn}
              title="All Channels"
            >
              ←
            </button>
          )}

          <div>
            <div style={dockStyles.dockTitle}>
              {view === "chat" && activePartner
                ? `${activePartner.callsign ? `[${activePartner.callsign}] ` : ""}${activePartner.displayName || activePartner.username}`
                : view === "directory"
                  ? "Investigator Directory"
                  : "Field Transmissions"}
            </div>
            <div style={dockStyles.dockSubtitle}>
              {view === "chat" && activePartner
                ? `${activePartner.role || "Active Unit"}`
                : "Point-to-Point Secure Line"}
            </div>
          </div>
        </div>

        <div style={dockStyles.dockControls}>
          <button
            onClick={() => setIsMinimized(true)}
            style={dockStyles.controlBtn}
            title="Minimize to Dock Bar"
          >
            —
          </button>
          <button onClick={onClose} style={dockStyles.controlBtn} title="Close Messenger">
            ✕
          </button>
        </div>
      </div>

      {/* DOCK VIEWPORT BODY */}
      <div style={dockStyles.dockBody}>
        {/* VIEW 1: ACTIVE CHAT THREAD */}
        {view === "chat" && activePartner ? (
          <div style={dockStyles.chatContainer}>
            {sendError && <div style={dockStyles.errorNotice}>{sendError}</div>}

            <div style={dockStyles.messageList}>
              {messages.length === 0 ? (
                <div style={dockStyles.emptyChat}>Channel open. Transmit field updates below.</div>
              ) : (
                messages.map((m) => {
                  const isMine = m.senderId === user?.id;
                  return (
                    <div
                      key={m.id}
                      style={{
                        ...dockStyles.messageRow,
                        justifyContent: isMine ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          ...dockStyles.messageBubble,
                          backgroundColor: isMine
                            ? "var(--accent-primary)"
                            : "var(--bg-surface-elevated)",
                          color: isMine ? "#ffffff" : "var(--text-primary)",
                        }}
                      >
                        <div style={dockStyles.messageText}>{m.content}</div>
                        <div style={dockStyles.messageMeta}>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isMine && (
                            <span
                              style={dockStyles.receiptMark}
                              title={
                                m.readAt
                                  ? `Read ${new Date(m.readAt).toLocaleTimeString()}`
                                  : "Sent"
                              }
                            >
                              {m.readAt ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {isPeerTyping && (
                <div style={dockStyles.typingIndicator}>
                  <span style={dockStyles.typingDot}>●</span>
                  <span>[{peerTypingLabel}] is transmitting...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} style={dockStyles.dockInputForm}>
              <input
                type="text"
                placeholder="Transmit message..."
                value={inputText}
                onChange={handleInputChange}
                style={dockStyles.dockInputField}
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleSendMessage()}
                style={{
                  ...dockStyles.dockSendBtn,
                  opacity: !inputText.trim() || isSending ? 0.5 : 1,
                  cursor: !inputText.trim() || isSending ? "default" : "pointer",
                }}
              >
                Send
              </button>
            </form>
          </div>
        ) : view === "directory" ? (
          /* VIEW 2: NEW DISPATCH DIRECTORY */
          <div style={dockStyles.directoryContainer}>
            <div style={dockStyles.directoryHeader}>
              <span>Select an investigator</span>
              <button onClick={() => setView("threads")} style={dockStyles.textActionBtn}>
                Cancel
              </button>
            </div>
            <div style={dockStyles.channelList}>
              {directory.length === 0 ? (
                <div style={dockStyles.emptyNotice}>No other operators online.</div>
              ) : (
                directory.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      setActivePartner(inv);
                      setView("chat");
                    }}
                    style={dockStyles.channelItem}
                  >
                    <div style={dockStyles.partnerCallsign}>
                      {inv.callsign ? `[${inv.callsign}]` : `@${inv.username}`}
                    </div>
                    <div style={dockStyles.partnerName}>{inv.displayName || inv.username}</div>
                    <div style={dockStyles.partnerRole}>{inv.role || "Field Operator"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* VIEW 3: ACTIVE CONVERSATIONS LIST */
          <div style={dockStyles.threadsContainer}>
            <div style={dockStyles.threadsTopAction}>
              <span style={dockStyles.labelSmall}>Recent Channels</span>
              <button onClick={() => setView("directory")} style={dockStyles.newDispatchBtn}>
                + New Dispatch
              </button>
            </div>

            <div style={dockStyles.channelList}>
              {conversations.length === 0 ? (
                <div style={dockStyles.emptyNotice}>
                  No active channels. Click "+ New Dispatch" to transmit.
                </div>
              ) : (
                conversations.map((c) => {
                  return (
                    <div
                      key={c.partner.id}
                      onClick={() => {
                        setActivePartner(c.partner);
                        setView("chat");
                      }}
                      style={dockStyles.channelItem}
                    >
                      <div style={dockStyles.channelTopLine}>
                        <span style={dockStyles.partnerCallsign}>
                          {c.partner.callsign
                            ? `[${c.partner.callsign}]`
                            : `@${c.partner.username}`}
                        </span>
                        {c.unreadCount > 0 && (
                          <span style={dockStyles.unreadBadge}>{c.unreadCount}</span>
                        )}
                      </div>
                      <div style={dockStyles.partnerName}>
                        {c.partner.displayName || c.partner.username}
                      </div>
                      <div style={dockStyles.previewLine}>
                        {c.latestMessage.senderId === user?.id ? "Outbound: " : ""}
                        {c.latestMessage.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

const dockStyles: Record<string, React.CSSProperties> = {
  minimizedBar: {
    position: "fixed",
    bottom: 0,
    right: "24px",
    height: "42px",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderBottom: "none",
    borderRadius: "8px 8px 0 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 12px",
    zIndex: 1000,
    cursor: "pointer",
    boxShadow: "0 -2px 14px rgba(0, 0, 0, 0.25)",
    minWidth: "220px",
    maxWidth: "320px",
  },
  minimizedLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    overflow: "hidden",
  },
  radioIcon: {
    fontSize: "0.9rem",
  },
  minimizedTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  unreadBadgeMini: {
    backgroundColor: "var(--accent-rose)",
    color: "#ffffff",
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: "8px",
  },
  minimizedControls: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginLeft: "8px",
  },
  dockWindow: {
    position: "fixed",
    bottom: 0,
    right: "24px",
    width: "min(380px, calc(100vw - 32px))",
    height: "520px",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderBottom: "none",
    borderRadius: "8px 8px 0 0",
    display: "flex",
    flexDirection: "column",
    zIndex: 1000,
    boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.35)",
    overflow: "hidden",
  },
  dockHeader: {
    padding: "8px 12px",
    backgroundColor: "var(--bg-surface-elevated)",
    borderBottom: "1px solid var(--border-default)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    fontSize: "1rem",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  dockTitle: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  dockSubtitle: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    marginTop: "1px",
  },
  dockControls: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
  },
  controlBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: "4px",
  },
  dockBody: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: "var(--bg-page)",
  },
  chatContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  errorNotice: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    color: "var(--accent-rose)",
    padding: "6px 10px",
    fontSize: "0.75rem",
    borderBottom: "1px solid var(--accent-rose)",
  },
  messageList: {
    flexGrow: 1,
    overflowY: "auto",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: 0,
  },
  emptyChat: {
    margin: "auto",
    textAlign: "center",
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    padding: "1.5rem",
  },
  messageRow: {
    display: "flex",
    width: "100%",
  },
  messageBubble: {
    maxWidth: "82%",
    padding: "8px 10px",
    borderRadius: "8px",
    fontSize: "0.85rem",
    lineHeight: 1.4,
  },
  messageText: {
    wordBreak: "break-word",
  },
  messageMeta: {
    fontSize: "0.65rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "4px",
    marginTop: "3px",
    opacity: 0.8,
  },
  receiptMark: {
    fontFamily: "monospace",
    fontWeight: 700,
  },
  typingIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.7rem",
    color: "var(--accent-primary)",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    padding: "4px 8px",
    borderRadius: "4px",
    width: "fit-content",
  },
  typingDot: {
    color: "var(--accent-emerald)",
    fontSize: "0.7rem",
  },
  dockInputForm: {
    display: "flex",
    gap: "6px",
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface)",
    borderTop: "1px solid var(--border-default)",
    flexShrink: 0,
  },
  dockInputField: {
    flexGrow: 1,
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "14px",
    boxSizing: "border-box",
    minHeight: "36px",
  },
  dockSendBtn: {
    padding: "6px 14px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.8rem",
  },
  threadsContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "10px",
    gap: "8px",
    minHeight: 0,
  },
  threadsTopAction: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "4px",
  },
  labelSmall: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  newDispatchBtn: {
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--accent-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "4px",
    padding: "4px 8px",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  channelList: {
    flexGrow: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minHeight: 0,
  },
  channelItem: {
    padding: "8px 10px",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "border-color 0.15s ease",
  },
  channelTopLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  partnerCallsign: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  unreadBadge: {
    backgroundColor: "var(--accent-rose)",
    color: "#ffffff",
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: "8px",
  },
  partnerName: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    marginTop: "2px",
  },
  previewLine: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginTop: "2px",
  },
  partnerRole: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  directoryContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "10px",
    gap: "8px",
    minHeight: 0,
  },
  directoryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    paddingBottom: "4px",
  },
  textActionBtn: {
    background: "transparent",
    border: "none",
    color: "var(--accent-primary)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  emptyNotice: {
    textAlign: "center",
    padding: "2rem 1rem",
    color: "var(--text-muted)",
    fontSize: "0.8rem",
  },
};
