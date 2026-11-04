import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Armchair,
  Laptop as LaptopIcon,
  Leaf,
  MessageCircle,
  MousePointer2,
  Sparkles,
  X,
} from "lucide-react";
import Landing from "./components/Landing.jsx";
import Campus from "./components/Campus.jsx";
import Onboarding from "./components/Onboarding.jsx";
import Laptop from "./components/Laptop.jsx";
import { MusicProvider } from "./components/Music.jsx";
import Chat from "./components/Chat.jsx";
import Announcements from "./components/Announcements.jsx";
import { Brand, Modal } from "./components/shared.jsx";
import { api } from "./api.js";

function Help({ onClose, inCampus = false }) {
  return (
    <Modal
      title="Welcome to PierPlace"
      presentation={inCampus ? "floating" : "modal"}
      className={inCampus ? "help-popup" : ""}
      onClose={onClose}
    >
      <header className="modal-header">
        <p className="eyebrow">
          <Leaf size={15} /> A LITTLE DIRECTION
        </p>
        <h2>A small world. Plenty to discover.</h2>
        <p>Make yourself at home—there’s no timer and no rush.</p>
      </header>
      <div className="help-grid">
        {[
          {
            Icon: Sparkles,
            title: "First, make a little you.",
            text: "Choose your character’s colors and name. Add an optional real photo to your campus ID, then solve three visual puzzles. You can retry as often as you need.",
          },
          {
            Icon: MousePointer2,
            title: "Follow your curiosity.",
            text: "Click an open spot to walk. WASD and arrow keys also work. Move the mouse near the screen edges to look around, drag on touch, or use the camera controls. Use the campus menu or stairs to change floors. Find my character recenters the view. The menu’s destination selector is keyboard accessible.",
          },
          {
            Icon: Armchair,
            title: "Pull up a chair.",
            text: "Click a chair, then choose Sit down. When you arrive, Table chat opens in your toolkit. Beanbags, the mentor cubicle, water dispenser, and restroom have their own interactions.",
          },
          {
            Icon: MessageCircle,
            title: "A friendly face, a shared idea.",
            text: "Walk over to Mr Jonathan, Mr Femi, Mr Ezekiel, Mr Emmanuel, or the Facility Manager. Mentors move independently between floors, so look for them where they are. Table chat has separate histories and clearly labeled simulated replies.",
          },
          {
            Icon: LaptopIcon,
            title: "Learn something little.",
            text: "Open your laptop for an Ubuntu-inspired desktop. Launch Browser or the Monaco code editor from the desktop. Lessons, notes, files, and the simulated terminal are in the dock. Code, notes, and completed lessons are saved on this device.",
          },
        ].map(({ Icon, title, text }) => (
          <article className="help-item" key={title}>
            <span className="tool-icon">
              <Icon size={22} />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="form-note">
        Local prototype: the MSW mock server runs in your browser. Profiles,
        photo, chat history, notes, and progress stay in this browser. No real
        multiplayer or account authentication is connected.
      </p>
      <div className="modal-actions">
        <span />
        <button className="primary-button" onClick={onClose}>
          Got it. Let’s explore. <ArrowRight size={17} />
        </button>
      </div>
    </Modal>
  );
}
export default function App() {
  const [session, setSession] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [page, setPage] = useState("home");
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState("");
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const toastTimer = useRef(null);
  const floorQueue = useRef(Promise.resolve());
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api
      .session(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSession(data);
          if (!data.persistent)
            notify(
              "Device storage is unavailable. Your progress will last for this visit only.",
            );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [reload, notify]);
  const close = () => setDialog(null);
  const seatChanged = useCallback((tableId) => {
    setDialog((previous) =>
      previous?.type === "chat" && previous.tableId !== tableId
        ? null
        : previous,
    );
  }, []);
  async function finishOnboarding(profile, answers) {
    const editing = dialog?.type === "profile";
    const result = editing
      ? await api.profile(profile)
      : await api.admit(profile, answers);
    setSession((previous) => ({
      ...previous,
      profile: result.profile,
      admitted: result.admitted,
      persistent: result.persistent,
    }));
    setDialog(null);
    if (!editing) setPage("campus");
    notify(
      !result.persistent
        ? "Your pass is ready. Device storage is unavailable; this visit won’t persist."
        : editing
          ? "A little more you. Your campus profile is saved."
          : `Welcome to PierPlace, ${profile.name}. Your seat is waiting.`,
    );
  }
  function changeFloor(floor) {
    setSession((previous) => ({ ...previous, floor }));
    // Serialize writes so rapid floor switches cannot persist an older choice last.
    floorQueue.current = floorQueue.current
      .catch(() => {})
      .then(() => api.floor(floor))
      .catch((error) => notify(error.message));
  }
  async function completeLesson(id) {
    const result = await api.completeLesson(id);
    setSession((previous) => ({ ...previous, lessons: result.lessons }));
    notify("One small step forward. Lesson complete!");
  }
  if (!session)
    return (
      <main className="loading-screen">
        <Brand />
        <span className="loading-spark">
          <Sparkles size={32} />
        </span>
        <h1>
          {error
            ? "Your campus needs a moment."
            : "Making a little room for you…"}
        </h1>
        <p>{error || "Preparing your cozy corner of the world."}</p>
        {error && (
          <button
            className="primary-button"
            onClick={() => setReload((value) => value + 1)}
          >
            Try again <ArrowRight size={17} />
          </button>
        )}
      </main>
    );
  return (
    <MusicProvider>
      {page === "home" ? (
        <Landing
          profile={session.profile}
          admitted={session.admitted}
          onStart={() => setDialog({ type: "onboarding" })}
          onEnter={() =>
            session.admitted
              ? setPage("campus")
              : setDialog({ type: "onboarding" })
          }
          onHelp={() => setDialog({ type: "help" })}
        />
      ) : (
        <Campus
          profile={session.profile}
          floor={session.floor}
          onFloorChange={changeFloor}
          onProfile={() => setDialog({ type: "profile" })}
          onLaptop={() => setDialog({ type: "laptop" })}
          onChat={(tableId) => setDialog({ type: "chat", tableId })}
          onAnnouncements={() => setAnnouncementsOpen(true)}
          onHelp={() => setDialog({ type: "help" })}
          onHome={() => {
            setDialog(null);
            setPage("home");
          }}
          onSeatChange={seatChanged}
          onPresence={(message) => {
            if (message?.type === "welcome" && message.id)
              setPlayerId(message.id);
          }}
          onToast={notify}
        />
      )}
      {(dialog?.type === "onboarding" || dialog?.type === "profile") && (
        <Onboarding
          initialProfile={session.profile}
          editing={dialog.type === "profile"}
          onClose={close}
          onComplete={finishOnboarding}
        />
      )}
      {dialog?.type === "help" && (
        <Help inCampus={page === "campus"} onClose={close} />
      )}
      {dialog?.type === "laptop" && (
        <Laptop
          profile={session.profile}
          lessons={session.lessons}
          onCompleteLesson={completeLesson}
          onClose={close}
        />
      )}
      {dialog?.type === "chat" && (
        <Chat
          key={dialog.tableId}
          profile={session.profile}
          playerId={playerId}
          tableId={dialog.tableId}
          onClose={close}
        />
      )}
      {announcementsOpen && (
        <Announcements onClose={() => setAnnouncementsOpen(false)} />
      )}
      {toast && (
        <div className="toast" role="status">
          <Leaf size={19} />
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </MusicProvider>
  );
}
