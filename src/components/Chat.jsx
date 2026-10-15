import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import { Modal, Avatar } from "./shared.jsx";
import { api } from "../api.js";
import { chatSocketUrl } from "../presence.js";
import { tableLabel } from "../state.js";

// Merge by message id so the history fetch and the live socket never duplicate.
function mergeMessages(current, incoming) {
  const seen = new Set(current.map((message) => message.id));
  const merged = [...current];
  for (const message of incoming) {
    if (message?.id && seen.has(message.id)) continue;
    seen.add(message?.id);
    merged.push(message);
  }
  return merged;
}

export default function Chat({ tableId, profile, playerId, onClose }) {
  const identity = { ...profile, playerId };
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const list = useRef(null);
  const mounted = useRef(true);
  const sendingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .messages(tableId, identity, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setMessages((current) => mergeMessages(current, result.messages));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [tableId, playerId, retry]);
  useEffect(() => {
    let socket;
    try {
      socket = new WebSocket(chatSocketUrl(tableId));
    } catch {
      return undefined;
    }
    socket.onmessage = (event) => {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame?.type === "history" && Array.isArray(frame.messages)) {
        setMessages((current) => mergeMessages(current, frame.messages));
        setLoading(false);
      } else if (frame?.type === "message" && frame.message) {
        setMessages((current) => mergeMessages(current, [frame.message]));
      }
    };
    socket.onerror = () => {}; // chat still works over REST when the socket drops
    return () => socket.close();
  }, [tableId]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages, sending]);
  async function send(event) {
    event.preventDefault();
    if (!text.trim() || sendingRef.current || loading) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const result = await api.sendMessage(tableId, text.trim(), identity);
      if (mounted.current) {
        setMessages((current) => mergeMessages(current, result.messages));
        setText("");
      }
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }
  return (
    <Modal
      title="Table chat"
      presentation="floating"
      onClose={onClose}
      className="chat-panel"
    >
      <header className="modal-header">
        <p className="eyebrow">
          <MessageCircle size={15} /> PULL UP A CONVERSATION
        </p>
        <h2>Your table, your people.</h2>
        <p>{tableLabel(tableId)}</p>
      </header>
      <div className="chat-context">
        <Sparkles size={16} />
        <span>Keep Communication Respectful Please.</span>
      </div>
      <div
        ref={list}
        className="chat-messages"
        role="log"
        aria-label="Table messages"
        aria-live="polite"
        aria-busy={loading || sending}
      >
        {loading ? (
          <div className="empty-state">
            <MessageCircle />
            <p>Finding your conversation…</p>
          </div>
        ) : !messages.length ? (
          <div className="empty-state">
            <MessageCircle />
            <h3>Every connection starts with hello.</h3>
            <p>Share what you’re working on, or just introduce yourself.</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <article
              className={`chat-message ${message.name === profile.name ? "own" : ""}`}
              key={message.id || `${message.time}-${index}`}
            >
              <div className="chat-message-head">
                {message.name === profile.name && <Avatar profile={profile} />}
                <strong>{message.name}</strong>
                <time>
                  {message.time && !Number.isNaN(Date.parse(message.time))
                    ? new Date(message.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </time>
              </div>
              <p>{message.text}</p>
            </article>
          ))
        )}
        {sending && <p className="chat-message system">Sending your hello…</p>}
      </div>
      {error && (
        <p className="test-feedback error" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
            disabled={sending}
          >
            Reload chat
          </button>
        </p>
      )}
      <form className="chat-input-row" onSubmit={send}>
        <input
          aria-label="Your message"
          className="text-input"
          placeholder="A little hello goes a long way…"
          maxLength={500}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={loading || sending}
        />
        <button
          className="primary-button"
          aria-label="Send message"
          disabled={!text.trim() || loading || sending}
        >
          <ArrowRight size={19} />
        </button>
      </form>
    </Modal>
  );
}
