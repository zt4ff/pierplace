import { useEffect, useState } from "react";
import { X, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../api.js";

const SAMPLE_ACTIVITIES = {
  active: [
    {
      id: "sample-1",
      kind: "quest_open",
      title: "Week 1 Quest Open",
      description: "Quest challenges are available for submission. Head to your laptop to begin.",
      opens_at: new Date(Date.now() - 10 * 60000).toISOString(),
      closes_at: new Date(Date.now() + 50 * 60000).toISOString(),
      status: "open",
      week: 1,
    },
    {
      id: "sample-2",
      kind: "raid_open",
      title: "Raid Week 1",
      description: "Group raid challenges opened. Team up with fellow learners.",
      opens_at: new Date(Date.now() - 20 * 60000).toISOString(),
      closes_at: new Date(Date.now() + 40 * 60000).toISOString(),
      status: "open",
      week: 1,
    },
  ],
  upcoming: [
    {
      id: "sample-3",
      kind: "briefing",
      title: "Week 1 Briefing",
      description: "Orientation session for new participants.",
      opens_at: new Date(Date.now() + 2 * 60 * 60000).toISOString(),
      closes_at: new Date(Date.now() + 3 * 60 * 60000).toISOString(),
      status: "scheduled",
      week: 1,
    },
    {
      id: "sample-4",
      kind: "checkpoint_lock",
      title: "Checkpoint Week 2",
      description: "Checkpoint questions for skill verification.",
      opens_at: new Date(Date.now() + 5 * 60 * 60000).toISOString(),
      closes_at: new Date(Date.now() + 6 * 60 * 60000).toISOString(),
      status: "scheduled",
      week: 2,
    },
  ],
  timed: [
    {
      id: "sample-5",
      kind: "quest_open",
      title: "Quest Week 3",
      description: "Quest challenges available for submission.",
      opens_at: new Date(Date.now() - 15 * 60000).toISOString(),
      closes_at: new Date(Date.now() + 5 * 60000).toISOString(),
      status: "open",
      week: 3,
    },
  ],
};

export default function Announcements({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(SAMPLE_ACTIVITIES);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.announcements()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setData(SAMPLE_ACTIVITIES);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const formatTimeRemaining = (futureTime) => {
    if (!futureTime) return "";
    const now = new Date();
    const future = new Date(futureTime);
    const diff = future - now;
    if (diff <= 0) return "Now";
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const sections = [
    { key: "active", label: "Active Now", icon: CheckCircle2, color: "#4caf50" },
    { key: "upcoming", label: "Coming Up", icon: Clock, color: "#2196f3" },
    { key: "timed", label: "Timed Activities", icon: AlertCircle, color: "#ff9800" },
  ];

  if (loading && !data) {
    return (
      <section className="modal-panel announcements-panel" role="dialog" aria-modal="true" aria-label="Announcements" tabIndex={-1}>
        <button className="modal-close icon-button" onClick={onClose} aria-label="Close announcements"><X size={20} /></button>
        <div className="game-panel-heading"><h2>Announcements</h2></div>
        <p>Loading activities&hellip;</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="modal-panel announcements-panel" role="dialog" aria-modal="true" aria-label="Announcements" tabIndex={-1}>
        <button className="modal-close icon-button" onClick={onClose} aria-label="Close announcements"><X size={20} /></button>
        <div className="game-panel-heading"><h2>Announcements</h2></div>
        <p>{error}</p>
        <button className="game-action" type="button" onClick={() => { setLoading(true); setError(""); api.announcements().then(setData).finally(() => setLoading(false)); }}>
          Try again
        </button>
      </section>
    );
  }

  const active = data.active || [];
  const upcoming = data.upcoming || [];
  const timed = data.timed || [];
  const serverTime = data.server_time || "";

  return (
    <section className="announcements-panel" role="dialog" aria-modal="true" aria-label="Announcements" tabIndex={-1}>
      <button className="modal-close icon-button" onClick={onClose} aria-label="Close announcements"><X size={20} /></button>
      <div className="game-panel-heading">
        <h2>Announcements</h2>
        {serverTime && (
          <span className="announcements-server-time" style={{ fontSize: "10px", color: "#63735e", fontFamily: "monospace" }}>
            {serverTime}
          </span>
        )}
      </div>
      {sections.map(({ key, label, icon: Icon, color }) => {
        const items = key === "active" ? active : key === "upcoming" ? upcoming : timed;
        return (
          <div key={key} className="announcements-section">
            <h3 style={{ color, marginBottom: 8, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <Icon size={14} style={{ marginRight: 6 }} aria-hidden="true" />
              {label}
            </h3>
            {items.length === 0 ? (
              <p style={{ color: "#63735e", fontSize: "11px", textAlign: "center", padding: "16px 0", background: "#f6f5eb", borderRadius: 8 }}>
                No {label.toLowerCase()}
              </p>
            ) : (
              <div className="announcements-list">
                {items.map((activity) => (
                  <div key={activity.id} className="announcements-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
                      <h4 style={{ margin: 0, fontSize: "13px", color: "#29483d" }}>{activity.title}</h4>
                      <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: 4, background: color + "20", color, fontWeight: 600, textTransform: "uppercase" }}>
                        {activity.status}
                      </span>
                    </div>
                    <p style={{ fontSize: "11px", color: "#596b56", margin: "0 0 8px 0", lineHeight: 1.5 }}>{activity.description}</p>
                    {activity.closes_at && (
                      <div style={{ display: "flex", gap: 12, fontSize: "10px", color: "#63735e" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={12} aria-hidden="true" />
                          Closes {formatTimeRemaining(activity.closes_at)}
                        </span>
                      </div>
                    )}
                    {activity.opens_at && !activity.closes_at && (
                      <div style={{ display: "flex", gap: 12, fontSize: "10px", color: "#63735e" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={12} aria-hidden="true" />
                          Starts {formatTimeRemaining(activity.opens_at)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
