import { useState, useEffect, useRef } from "react";
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

interface MessengerConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadChange?: (totalUnread: number) => void;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

export default function MessengerConsole({
  isOpen,
  onClose,
  onUnreadChange,
}: MessengerConsoleProps) {
  const { user, token } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activePartner, setActivePartner] = useState<InvestigatorPartner | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [peerTypingLabel, setPeerTypingLabel] = useState("Operator");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [investigatorDirectory, setInvestigatorDirectory] = useState<InvestigatorPartner[]>([]);
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activePartnerRef = useRef<InvestigatorPartner | null>(null);
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<TimeoutHandle | null>(null);
  const peerTypingTimeoutRef = useRef<TimeoutHandle | null>(null);

  useEffect(() => {
    activePartnerRef.current = activePartner;
  }, [activePartner]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPeerTyping]);

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
        setInvestigatorDirectory(data);
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

  return (
    <div style={commStyles.overlay}>
      <div style={commStyles.container}>
        <div style={commStyles.topBar}>
          <div style={commStyles.topBarLeft}>
            <span style={commStyles.brandTag}>Secure Radio Ingestion</span>
            <h2 style={commStyles.consoleTitle}>Field Communications Console</h2>
          </div>
          <button onClick={onClose} style={commStyles.closeBtn} aria-label="Close Messenger">
            ✕
          </button>
        </div>

        <div style={commStyles.splitBody}>
          <aside style={commStyles.threadPanel}>
            <div style={commStyles.threadPanelHeader}>
              <span style={commStyles.sectionLabel}>Active Channels</span>
              <button
                onClick={() => setIsDirectoryOpen(!isDirectoryOpen)}
                style={commStyles.newChatBtn}
              >
                {isDirectoryOpen ? "Back to Threads" : "+ New Dispatch"}
              </button>
            </div>

            {isDirectoryOpen ? (
              <div style={commStyles.directoryList}>
                <div style={commStyles.directoryTip}>Select an investigator to open a channel:</div>
                {investigatorDirectory.length === 0 ? (
                  <div style={commStyles.emptyThreads}>
                    No other investigators found on network.
                  </div>
                ) : (
                  investigatorDirectory.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => {
                        setActivePartner(inv);
                        setIsDirectoryOpen(false);
                      }}
                      style={commStyles.directoryItem}
                    >
                      <div style={commStyles.partnerCallsign}>
                        {inv.callsign ? `[${inv.callsign}]` : "@" + inv.username}
                      </div>
                      <div style={commStyles.partnerName}>{inv.displayName || inv.username}</div>
                      <div style={commStyles.partnerRole}>{inv.role || "Field Operator"}</div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div style={commStyles.conversationList}>
                {conversations.length === 0 ? (
                  <div style={commStyles.emptyThreads}>
                    No active channels. Click "+ New Dispatch" to transmit.
                  </div>
                ) : (
                  conversations.map((c) => {
                    const isSelected = activePartner?.id === c.partner.id;
                    return (
                      <div
                        key={c.partner.id}
                        onClick={() => setActivePartner(c.partner)}
                        style={{
                          ...commStyles.threadCard,
                          backgroundColor: isSelected
                            ? "var(--bg-surface-elevated)"
                            : "transparent",
                          borderColor: isSelected
                            ? "var(--accent-primary)"
                            : "var(--border-subtle)",
                        }}
                      >
                        <div style={commStyles.threadCardTop}>
                          <span style={commStyles.threadCallsign}>
                            {c.partner.callsign
                              ? `[${c.partner.callsign}]`
                              : "@" + c.partner.username}
                          </span>
                          {c.unreadCount > 0 && (
                            <span style={commStyles.unreadBadge}>{c.unreadCount}</span>
                          )}
                        </div>

                        <div style={commStyles.threadName}>
                          {c.partner.displayName || c.partner.username}
                        </div>

                        <div style={commStyles.threadPreview}>
                          {c.latestMessage.senderId === user?.id ? "Outbound: " : "Inbound: "}
                          {c.latestMessage.content}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </aside>

          <main style={commStyles.chatPanel}>
            {activePartner ? (
              <>
                <div style={commStyles.chatHeader}>
                  <div>
                    <div style={commStyles.activeCallsign}>
                      {activePartner.callsign
                        ? `Channel: [${activePartner.callsign}]`
                        : `Channel: @${activePartner.username}`}
                    </div>
                    <div style={commStyles.activeDetails}>
                      {activePartner.displayName || activePartner.username} //{" "}
                      {activePartner.role || "Investigator"}
                    </div>
                  </div>
                  <div style={commStyles.channelEncryptedTag}>Encrypted Point-to-Point</div>
                </div>

                {sendError && (
                  <div style={commStyles.errorBanner}>
                    <span>{sendError}</span>
                  </div>
                )}

                <div style={commStyles.messagesStream}>
                  {messages.length === 0 ? (
                    <div style={commStyles.emptyChatPrompt}>
                      Point-to-point transmission line open. Send your field update below.
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isMine = m.senderId === user?.id;
                      return (
                        <div
                          key={m.id}
                          style={{
                            ...commStyles.messageRow,
                            justifyContent: isMine ? "flex-end" : "flex-start",
                          }}
                        >
                          <div
                            style={{
                              ...commStyles.bubble,
                              backgroundColor: isMine
                                ? "var(--accent-primary)"
                                : "var(--bg-surface-elevated)",
                              color: isMine ? "#ffffff" : "var(--text-primary)",
                            }}
                          >
                            <div style={commStyles.bubbleText}>{m.content}</div>
                            <div style={commStyles.bubbleMeta}>
                              <span>
                                {new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>

                              {isMine && (
                                <span
                                  style={commStyles.receiptIcon}
                                  title={
                                    m.readAt
                                      ? `Read at ${new Date(m.readAt).toLocaleTimeString()}`
                                      : "Transmitted"
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
                    <div style={commStyles.typingBanner}>
                      <span style={commStyles.typingPulseDot}>●</span>
                      <span>[{peerTypingLabel}] is transmitting telemetry...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSendMessage} style={commStyles.inputDock}>
                  <input
                    type="text"
                    placeholder={`Transmit dispatch to ${activePartner.callsign || activePartner.username}...`}
                    value={inputText}
                    onChange={handleInputChange}
                    style={commStyles.inputBox}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    style={{
                      ...commStyles.transmitBtn,
                      opacity: !inputText.trim() || isSending ? 0.5 : 1,
                      cursor: !inputText.trim() || isSending ? "default" : "pointer",
                      pointerEvents: "auto",
                    }}
                  >
                    {isSending ? "Sending..." : "Transmit"}
                  </button>
                </form>
              </>
            ) : (
              <div style={commStyles.noPartnerSelected}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📡</div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Direct Line Standby</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  Select an active channel from the left or establish a new dispatch to begin
                  communications.
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

const commStyles: Record<string, React.CSSProperties> = {
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
  container: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    maxWidth: "920px",
    width: "100%",
    height: "min(640px, 92vh)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
    overflow: "hidden",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.85rem 1.25rem",
    borderBottom: "1px solid var(--border-default)",
    backgroundColor: "var(--bg-surface-elevated)",
    flexShrink: 0,
  },
  topBarLeft: {
    display: "flex",
    flexDirection: "column",
  },
  brandTag: {
    fontSize: "0.65rem",
    color: "var(--accent-primary)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  consoleTitle: {
    fontSize: "1.05rem",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.3px",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: "4px 8px",
  },
  splitBody: {
    display: "flex",
    flexGrow: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  threadPanel: {
    width: "320px",
    borderRight: "1px solid var(--border-default)",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--bg-surface)",
    flexShrink: 0,
  },
  threadPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  newChatBtn: {
    background: "var(--bg-surface-elevated)",
    color: "var(--accent-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "4px",
    padding: "4px 8px",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  conversationList: {
    flexGrow: 1,
    overflowY: "auto",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minHeight: 0,
  },
  emptyThreads: {
    padding: "2rem 1rem",
    textAlign: "center",
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    fontStyle: "italic",
  },
  threadCard: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  threadCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  threadCallsign: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  unreadBadge: {
    backgroundColor: "var(--accent-rose)",
    color: "#ffffff",
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: "10px",
  },
  threadName: {
    fontSize: "0.85rem",
    fontWeight: 600,
    margin: "2px 0",
  },
  threadPreview: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  directoryList: {
    flexGrow: 1,
    overflowY: "auto",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minHeight: 0,
  },
  directoryTip: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    padding: "4px",
  },
  directoryItem: {
    padding: "8px 10px",
    borderRadius: "6px",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    cursor: "pointer",
  },
  partnerCallsign: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  partnerName: {
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  partnerRole: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
  },
  chatPanel: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--bg-page)",
    minHeight: 0,
    minWidth: 0,
    height: "100%",
  },
  chatHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    backgroundColor: "var(--bg-surface)",
    borderBottom: "1px solid var(--border-default)",
    flexShrink: 0,
  },
  activeCallsign: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--accent-primary)",
    fontFamily: "monospace",
  },
  activeDetails: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
  },
  channelEncryptedTag: {
    fontSize: "0.65rem",
    color: "var(--accent-emerald)",
    fontWeight: 600,
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderBottom: "1px solid var(--accent-rose)",
    color: "var(--accent-rose)",
    padding: "8px 14px",
    fontSize: "0.8rem",
    fontWeight: 500,
    flexShrink: 0,
  },
  messagesStream: {
    flexGrow: 1,
    overflowY: "auto",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: 0,
  },
  emptyChatPrompt: {
    margin: "auto",
    textAlign: "center",
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    padding: "2rem",
  },
  messageRow: {
    display: "flex",
    width: "100%",
  },
  bubble: {
    maxWidth: "75%",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "0.85rem",
    lineHeight: 1.4,
  },
  bubbleText: {
    wordBreak: "break-word",
  },
  bubbleMeta: {
    fontSize: "0.65rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "4px",
    marginTop: "3px",
    opacity: 0.8,
  },
  receiptIcon: {
    fontFamily: "monospace",
    fontWeight: 700,
  },
  typingBanner: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "0.75rem",
    color: "var(--accent-primary)",
    fontFamily: "monospace",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    padding: "6px 10px",
    borderRadius: "6px",
    width: "fit-content",
    marginTop: "4px",
    flexShrink: 0,
  },
  typingPulseDot: {
    color: "var(--accent-emerald)",
    fontSize: "0.75rem",
  },
  inputDock: {
    display: "flex",
    gap: "8px",
    padding: "10px 14px",
    backgroundColor: "var(--bg-surface)",
    borderTop: "1px solid var(--border-default)",
    flexShrink: 0,
    zIndex: 5,
  },
  inputBox: {
    flexGrow: 1,
    padding: "10px 12px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    fontSize: "16px",
    minHeight: "40px",
    boxSizing: "border-box",
  },
  transmitBtn: {
    padding: "8px 18px",
    backgroundColor: "var(--accent-primary)",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    fontSize: "0.85rem",
    minHeight: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  noPartnerSelected: {
    margin: "auto",
    textAlign: "center",
    padding: "2rem",
    maxWidth: "340px",
  },
};
