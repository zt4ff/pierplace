import { useEffect, useRef, useState } from "react";
import { connectPresence } from "../presence.js";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Armchair,
  ChevronUp,
  CircleHelp,
  Crosshair,
  Droplets,
  Footprints,
  Home,
  Laptop,
  MapPin,
  Menu,
  MessageCircle,
  Megaphone,
  Minus,
  Move,
  Pause,
  Play,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import { Avatar, Brand, IdCard } from "./shared.jsx";
import ObjectPopover from "./ObjectPopover.jsx";
import { useMusic } from "./Music.jsx";
import { PixelWorld } from "../world.js";
import { NPC_LINES, tableLabel } from "../state.js";
import "../campus.css";

const objectIcon = (type) => {
  if (type === "chair" || type === "beanbag") return Armchair;
  if (type === "npc" || type === "mentor") return MessageCircle;
  if (type === "water") return Droplets;
  if (type === "stairs") return ChevronUp;
  return MapPin;
};

export default function Campus({
  profile,
  floor,
  onFloorChange,
  onProfile,
  onLaptop,
  onChat,
  onHelp,
  onHome,
  onAnnouncements,
  onToast,
  onSeatChange,
  onCameraChange,
  onPresence,
}) {
  const music = useMusic();
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const remotesRef = useRef(new Map());
  const selfIdRef = useRef(null);
  const callbacksRef = useRef({
    onFloorChange,
    onChat,
    onToast,
    onSeatChange,
    onCameraChange,
    onPresence,
  });
  const seatRef = useRef(null);
  const popoverTriggerRef = useRef(null);
  const initialRef = useRef({ profile, floor: floor === 2 ? 2 : 1 });
  const engineFloorRef = useRef(initialRef.current.floor);
  const pendingActionRef = useRef(null);
  const [currentFloor, setCurrentFloor] = useState(initialRef.current.floor);
  const [objects, setObjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [travellingId, setTravellingId] = useState(null);
  const [position, setPosition] = useState({ seated: false, tableId: null });
  const [remoteCount, setRemoteCount] = useState(0);
  const [speech, setSpeech] = useState(null);
  const [popover, setPopover] = useState(null);
  const [camera, setCamera] = useState(null);

  // The controller lives for the mount, while its event handlers use current props.
  callbacksRef.current = {
    onFloorChange,
    onChat,
    onToast,
    onSeatChange,
    onCameraChange,
    onPresence,
  };

  useEffect(() => {
    if (!popover) return;
    const dismiss = (event) => {
      if (!event.target.closest?.("[data-game-popover], [data-game-trigger]"))
        setPopover(null);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      setPopover(null);
      popoverTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [popover]);

  function togglePopover(next, event) {
    popoverTriggerRef.current = event.currentTarget;
    setPopover((previous) => (previous === next ? null : next));
  }

  function launch(callback) {
    setPopover(null);
    callback?.();
  }

  function finishInteraction(engine) {
    const pending = pendingActionRef.current;
    if (!pending?.started) return;
    if (engine.keys.size || engine.selected?.id !== pending.object.id) {
      pendingActionRef.current = null;
      setTravellingId(null);
      return;
    }
    if (engine.pending || engine.path.length) return;

    pendingActionRef.current = null;
    setTravellingId(null);
    const object = pending.object;
    // Keep the chair action available for table chat, but retire completed visits.
    if (!["chair", "beanbag"].includes(object.type)) setSelected(null);
    if (object.type === "npc" || object.type === "mentor") {
      const lines = NPC_LINES[object.name] || [
        "Make yourself at home. There’s room for your next big idea here.",
      ];
      setSpeech({
        id: object.npcId || object.id,
        name: object.name || object.label,
        text: lines[Math.floor(Math.random() * lines.length)],
      });
    } else if (object.type === "water") {
      engine.clearSelection();
      callbacksRef.current.onToast?.(
        "A little water break. Stay hydrated, curious mind!",
      );
    } else if (object.type === "restroom") {
      engine.clearSelection();
      callbacksRef.current.onToast?.(
        "You’ve reached the restroom. Take a moment for yourself.",
      );
    }
  }

  useEffect(() => {
    const syncRemotes = () => {
      const engine = engineRef.current;
      if (engine) engine.setRemotes([...remotesRef.current.values()]);
    };
    const presence = connectPresence({
      profile: initialRef.current.profile,
      floor: initialRef.current.floor,
      onEvent: (msg) => {
        switch (msg?.type) {
          case "welcome":
            selfIdRef.current = msg.id;
            remotesRef.current = new Map(
              (msg.players || [])
                .filter((player) => player?.id && player.id !== msg.id)
                .map((player) => [player.id, player]),
            );
            syncRemotes();
            setRemoteCount(remotesRef.current.size);
            break;
          case "joined":
            if (msg.player?.id) remotesRef.current.set(msg.player.id, msg.player);
            syncRemotes();
            setRemoteCount(remotesRef.current.size);
            break;
          case "moved": {
            const previous = remotesRef.current.get(msg.id);
            if (previous) {
              remotesRef.current.set(msg.id, { ...previous, ...msg });
              syncRemotes();
            }
            break;
          }
          case "left":
            if (remotesRef.current.delete(msg.id)) {
              syncRemotes();
              setRemoteCount(remotesRef.current.size);
            }
            break;
          default:
            break;
        }
        callbacksRef.current.onPresence?.(msg);
      },
    });
    const engine = new PixelWorld(canvasRef.current, {
      camera: true,
      onObjectsChange: (next) => setObjects(next),
      onCameraChange: (state) => {
        setCamera((previous) =>
          previous &&
          Object.keys(state).every((key) => previous[key] === state[key])
            ? previous
            : { ...state },
        );
        callbacksRef.current.onCameraChange?.(state);
      },
      onInteract: (object) => {
        setSelected(object);
        setSpeech(null);
        setPopover(null);
      },
      onMove: (next) => {
        const world = engineRef.current;
        if (!world) return;
        presence.sendMove({ ...next, floor: world.floor });
        setPosition((previous) =>
          previous.seated === next.seated && previous.tableId === next.tableId
            ? previous
            : { seated: next.seated, tableId: next.tableId },
        );
        const seatedTable = next.seated ? next.tableId || null : null;
        if (seatRef.current !== seatedTable) {
          seatRef.current = seatedTable;
          callbacksRef.current.onSeatChange?.(seatedTable);
        }
        if (world.floor !== engineFloorRef.current) {
          engineFloorRef.current = world.floor;
          pendingActionRef.current = null;
          setCurrentFloor(world.floor);
          setObjects(world.layout.objects);
          setSelected(null);
          setSpeech(null);
          setTravellingId(null);
          callbacksRef.current.onFloorChange?.(world.floor);
        }
        finishInteraction(world);
      },
    });
    // Publish before setFloor/setActive emit movement events.
    engineRef.current = engine;
    engine.setPlayer(initialRef.current.profile);
    if (engine.floor !== initialRef.current.floor)
      engine.setFloor(initialRef.current.floor);
    setObjects(engine.layout.objects);
    engine.setActive(true);
    setCamera(engine.getCamera());
    const clearFloorSelection = () => {
      queueMicrotask(() => {
        if (engine.destroyed || engine.selected) return;
        setSelected(null);
        setSpeech(null);
      });
    };
    canvasRef.current.addEventListener("pointerup", clearFloorSelection);
    return () => {
      presence.close();
      engine.canvas.removeEventListener("pointerup", clearFloorSelection);
      pendingActionRef.current = null;
      engineRef.current = null;
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setPlayer(profile);
  }, [profile]);

  useEffect(() => {
    const nextFloor = floor === 2 ? 2 : 1;
    const engine = engineRef.current;
    if (!engine || engine.floor === nextFloor) return;
    // A parent-driven update is not a new floor-change request.
    engineFloorRef.current = nextFloor;
    pendingActionRef.current = null;
    engine.setFloor(nextFloor);
    setCurrentFloor(nextFloor);
    setObjects(engine.layout.objects);
    setSelected(null);
    setSpeech(null);
    setTravellingId(null);
  }, [floor]);

  function chooseFloor(level) {
    pendingActionRef.current = null;
    setSelected(null);
    setSpeech(null);
    setTravellingId(null);
    setPopover(null);
    const engine = engineRef.current;
    if (engine && engine.floor !== level) engine.setFloor(level);
  }

  function interact(object) {
    const engine = engineRef.current;
    if (!engine || !object) return;
    setSpeech(null);
    const pending = { object, started: false };
    pendingActionRef.current = pending;
    setTravellingId(object.id);
    if (!engine.interact(object)) {
      pendingActionRef.current = null;
      setTravellingId(null);
      callbacksRef.current.onToast?.(
        "That spot can’t be reached right now. Try another seat or clear walkway.",
      );
      return;
    }
    pending.started = true;
    // An interaction can finish synchronously when already at its destination.
    finishInteraction(engine);
  }

  function openChat() {
    const player = engineRef.current?.player;
    if (player?.seated && player.tableId) {
      setPopover(null);
      callbacksRef.current.onChat?.(player.tableId);
    }
  }

  function stand() {
    engineRef.current?.stand();
    pendingActionRef.current = null;
    setTravellingId(null);
    setSelected(null);
  }

  function dismissObject() {
    engineRef.current?.clearSelection();
    setSelected(null);
    setSpeech(null);
  }

  function selectDestination(id) {
    const engine = engineRef.current;
    const found = engine?.layout.objects.find((object) => object.id === id);
    const target = found?.occupantId
      ? engine.layout.objects.find((object) => object.id === found.occupantId)
      : found;
    if (!target) return;
    engine.selected = target;
    const view = engine.getCamera();
    engine.panCamera(
      target.x - view.x - view.width / 2,
      target.y - view.y - view.height / 2,
    );
    setSelected({ ...target });
    setSpeech(null);
    setPopover(null);
    canvasRef.current?.focus();
  }

  const SelectedIcon = objectIcon(selected?.type);
  const canChat = position.seated && Boolean(position.tableId);
  const seatDescription = position.seated
    ? position.tableId
      ? tableLabel(position.tableId)
      : "Settled into a beanbag"
    : "You’re free to wander";
  const name = profile?.name?.trim() || "curious mind";
  const groups = [
    {
      label: "People & places",
      items: objects.filter(
        (object) => !["chair", "beanbag"].includes(object.type),
      ),
    },
    {
      label: "Shared tables & quiet desks",
      items: objects.filter((object) => object.type === "chair"),
    },
    {
      label: "A moment to relax",
      items: objects.filter((object) => object.type === "beanbag"),
    },
  ];

  return (
    <main
      className="game-campus"
      aria-label="Campus"
      data-camera-x={camera?.x}
      data-camera-y={camera?.y}
      data-camera-zoom={camera?.zoom}
      data-player-visible={camera?.playerVisible}
      data-remote-players={remoteCount}
    >
      <canvas
        className="game-map"
        ref={canvasRef}
        width={1320}
        height={700}
        tabIndex={0}
        role="img"
        aria-label={`Interactive pixel-art campus, floor ${currentFloor}`}
        aria-describedby="game-instructions"
      >
        Explore with arrow keys or WASD. Open Campus menu to choose an
        accessible destination.
      </canvas>

      {selected && (
        <ObjectPopover
          engineRef={engineRef}
          objectId={selected.id}
          className="game-interaction"
          label={selected.label}
        >
          <div className="game-panel-heading">
            <SelectedIcon size={18} aria-hidden="true" />
            <h2>{selected.label}</h2>
            <button
              className="game-icon"
              type="button"
              aria-label="Dismiss selection"
              onClick={dismissObject}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <button
            className="game-button game-primary"
            type="button"
            disabled={
              travellingId === selected.id || Boolean(selected.occupantId)
            }
            onClick={() => interact(selected)}
          >
            {travellingId === selected.id ? "On your way…" : selected.action}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          {canChat && selected.tableId === position.tableId && (
            <button className="game-action" type="button" onClick={openChat}>
              <MessageCircle size={16} aria-hidden="true" /> Open table chat
            </button>
          )}
        </ObjectPopover>
      )}
      {speech && (
        <ObjectPopover
          engineRef={engineRef}
          objectId={speech.id}
          className="game-speech"
          label={`A conversation with ${speech.name}`}
        >
          <div className="game-panel-heading">
            <MessageCircle size={18} aria-hidden="true" />
            <h2>{speech.name}</h2>
            <button
              className="game-icon"
              type="button"
              aria-label="Dismiss conversation"
              onClick={dismissObject}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p role="status">“{speech.text}”</p>
        </ObjectPopover>
      )}

      <div className="game-corner game-top-left">
        <button
          className="game-button game-brand-button"
          type="button"
          aria-label="Campus menu"
          data-game-trigger
          aria-expanded={popover === "menu"}
          aria-controls="game-menu"
          onClick={(event) => togglePopover("menu", event)}
        >
          <Brand />
          <Menu size={17} aria-hidden="true" />
        </button>
        {popover === "menu" && (
          <section
            className="game-popover"
            id="game-menu"
            data-game-popover
            aria-label="Campus menu"
          >
            <div className="game-panel-heading">
              <h2>Campus menu</h2>
              <button
                className="game-icon"
                type="button"
                aria-label="Close campus menu"
                onClick={() => setPopover(null)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <button
              className="game-action"
              type="button"
              onClick={() => launch(onHome)}
            >
              <Home size={18} aria-hidden="true" /> Back to home
            </button>
            <button
              className="game-action"
              type="button"
              onClick={() => launch(onHelp)}
            >
              <CircleHelp size={18} aria-hidden="true" /> Help
            </button>
            <div
              className="game-floor-switch"
              role="group"
              aria-label="Choose campus floor"
            >
              {[1, 2].map((level) => (
                <button
                  className="game-button"
                  key={level}
                  type="button"
                  aria-pressed={currentFloor === level}
                  onClick={() => chooseFloor(level)}
                >
                  Floor {level}
                </button>
              ))}
            </div>
            <label
              className="game-destination-label"
              htmlFor="campus-destination"
            >
              Explore a destination
            </label>
            <select
              id="campus-destination"
              value={selected?.id || ""}
              onChange={(event) => selectDestination(event.target.value)}
            >
              <option value="">Choose a person, seat, or place…</option>
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((object) => (
                    <option key={object.id} value={object.id}>
                      {object.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="game-hint">
              Walk with WASD or arrow keys. Select a destination, then choose
              its action.
            </p>
          </section>
        )}
      </div>

      <div className="game-corner game-top-right">
        <div className="game-profile-row">
          <span className="game-location">
            <MapPin size={14} aria-hidden="true" />
            <span>The commons · Floor {currentFloor}</span>
          </span>
          <button
            className="game-button game-profile-button"
            type="button"
            aria-label="Your profile"
            data-game-trigger
            aria-expanded={popover === "profile"}
            aria-controls="game-profile"
            onClick={(event) => togglePopover("profile", event)}
          >
            <Avatar profile={profile} className="game-avatar" />
          </button>

          <button
          className="game-button game-announcements-button"
          type="button"
          aria-label="Announcements"
          onClick={() => onAnnouncements?.()}
        >
          <Megaphone size={20} aria-hidden="true" />
        </button>
        </div>
        
        {popover === "profile" && (
          <section
            className="game-popover game-profile-popover"
            id="game-profile"
            data-game-popover
            aria-label="Your profile"
          >
            <div className="game-panel-heading">
              <h2>Hey, {name}.</h2>
              <button
                className="game-icon"
                type="button"
                aria-label="Close profile"
                onClick={() => setPopover(null)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <IdCard profile={profile} />
            <button
              className="game-action"
              type="button"
              onClick={() => launch(onProfile)}
            >
              Edit profile <ArrowRight size={17} aria-hidden="true" />
            </button>
          </section>
        )}
      </div>

      <div className="game-corner game-bottom-left">
        {popover === "toolkit" && (
          <section
            className="game-popover"
            id="game-toolkit"
            data-game-popover
            aria-label="Your campus toolkit"
          >
            <div className="game-panel-heading">
              <h2>Your toolkit</h2>
              <button
                className="game-icon"
                type="button"
                aria-label="Close toolkit"
                onClick={() => setPopover(null)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <button
              className="game-action"
              type="button"
              onClick={() => launch(onLaptop)}
            >
              <Laptop size={20} aria-hidden="true" /> Open your laptop{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button
              className="game-action"
              type="button"
              onClick={openChat}
              disabled={!canChat}
              aria-describedby="table-chat-hint"
            >
              <MessageCircle size={20} aria-hidden="true" /> Table chat{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="game-hint" id="table-chat-hint">
              {canChat
                ? `You’re seated at ${tableLabel(position.tableId)}.`
                : "Choose a table chair, then sit down. Chat becomes available when you arrive."}
            </p>
            <button
              className="game-action"
              type="button"
              onClick={stand}
              disabled={!position.seated}
            >
              <Footprints size={20} aria-hidden="true" /> Stretch your legs
            </button>
            <p className="game-hint" role="status">
              {seatDescription}
            </p>
            <button
              className="game-action"
              type="button"
              onClick={() => launch(onHelp)}
            >
              <CircleHelp size={18} aria-hidden="true" /> How to explore
            </button>
          </section>
        )}
        <div className="game-toolkit-controls">
          <button
            className="game-button game-toolkit-button"
            type="button"
            aria-label="Your toolkit"
            data-game-trigger
            aria-expanded={popover === "toolkit"}
            aria-controls="game-toolkit"
            onClick={(event) => togglePopover("toolkit", event)}
          >
            <Wrench size={20} aria-hidden="true" />
          </button>
          <button
            className="game-button game-music-button"
            type="button"
            aria-label={music.playing ? "Pause music" : "Play music"}
            aria-pressed={music.playing}
            disabled={music.loading}
            title={
              music.error ||
              (music.loading
                ? "Loading YouTube…"
                : music.playing
                  ? "Pause music"
                  : "Play music")
            }
            onClick={music.toggle}
          >
            {music.playing ? (
              <Pause size={20} aria-hidden="true" />
            ) : (
              <Play size={20} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="game-corner game-bottom-right">
        {popover === "camera" && (
          <section
            className="game-popover game-camera-popover"
            id="game-camera"
            data-game-popover
            aria-label="Camera controls"
          >
            <div className="game-panel-heading">
              <h2>Look around</h2>
              <button
                className="game-icon"
                type="button"
                aria-label="Close camera controls"
                onClick={() => setPopover(null)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div
              className="game-pan-controls"
              role="group"
              aria-label="Pan camera"
            >
              <button
                className="game-button game-pan-up"
                type="button"
                aria-label="Pan up"
                onClick={() => engineRef.current?.panCamera(0, -160)}
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button
                className="game-button"
                type="button"
                aria-label="Pan left"
                onClick={() => engineRef.current?.panCamera(-160, 0)}
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <button
                className="game-button"
                type="button"
                aria-label="Pan down"
                onClick={() => engineRef.current?.panCamera(0, 160)}
              >
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <button
                className="game-button"
                type="button"
                aria-label="Pan right"
                onClick={() => engineRef.current?.panCamera(160, 0)}
              >
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="game-hint">
              Move your mouse to the map edges, or drag on touch. Find my
              character brings you back.
            </p>
          </section>
        )}
        <div className="game-camera-status" role="status">
          {camera?.playerVisible === false
            ? "Character off screen · Find me ↘"
            : "Character in view"}
        </div>
        <div className="game-camera-bar" role="group" aria-label="Camera">
          <button
            className="game-icon"
            type="button"
            aria-label="Zoom out"
            disabled={!camera || camera.zoom <= 1}
            onClick={() => engineRef.current?.zoomBy(-0.25)}
          >
            <Minus size={19} aria-hidden="true" />
          </button>
          <span className="game-zoom" aria-label="Camera zoom">
            {Math.round((camera?.zoom || 1) * 100)}%
          </span>
          <button
            className="game-icon"
            type="button"
            aria-label="Zoom in"
            disabled={!camera || camera.zoom >= 2.5}
            onClick={() => engineRef.current?.zoomBy(0.25)}
          >
            <Plus size={19} aria-hidden="true" />
          </button>
          <button
            className="game-icon"
            type="button"
            aria-label="Find my character"
            onClick={() => engineRef.current?.centerOnPlayer()}
          >
            <Crosshair size={20} aria-hidden="true" />
          </button>
          <button
            className="game-icon"
            type="button"
            aria-label="Look around"
            data-game-trigger
            aria-expanded={popover === "camera"}
            aria-controls="game-camera"
            onClick={(event) => togglePopover("camera", event)}
          >
            <Move size={19} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="game-instructions" id="game-instructions">
        Click to walk · move mouse to edges to look around · drag on touch
      </p>
    </main>
  );
}
