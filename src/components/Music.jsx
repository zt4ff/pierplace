import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Headphones } from "lucide-react";

const MusicContext = createContext(null);
let apiPromise;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const priorReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(
      () => finish(new Error("YouTube took too long to load. Try Play again.")),
      20000,
    );
    function ready() {
      try {
        priorReady?.();
      } finally {
        finish();
      }
    }
    function finish(error) {
      window.clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === ready)
        window.onYouTubeIframeAPIReady = priorReady;
      if (error) {
        script.remove();
        reject(error);
      } else resolve(window.YT);
    }
    window.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () =>
      finish(
        new Error(
          "Could not load YouTube. Check your connection and try Play again.",
        ),
      );
    document.head.appendChild(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

export function useMusic() {
  return useContext(MusicContext);
}

export function MusicProvider({ children }) {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [slot, setSlot] = useState(null);
  const [bounds, setBounds] = useState(null);
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const requestedPlay = useRef(false);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let player;
    let readyTimeout;
    setReady(false);
    setError("");
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        const mount = document.createElement("div");
        hostRef.current.appendChild(mount);
        readyTimeout = window.setTimeout(() => {
          if (!cancelled)
            setError(
              "The YouTube player did not respond. Check your connection and try Play again.",
            );
        }, 20000);
        player = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId: "_jH2oTNRe7g",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              window.clearTimeout(readyTimeout);
              playerRef.current = event.target;
              event.target.getIframe().title = "Lofi Girl YouTube music player";
              setReady(true);
              setError("");
              if (requestedPlay.current) {
                requestedPlay.current = false;
                event.target.playVideo();
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              setPlaying(
                event.data === YT.PlayerState.PLAYING ||
                  event.data === YT.PlayerState.BUFFERING,
              );
            },
            onAutoplayBlocked: () => {
              if (!cancelled) {
                setPlaying(false);
                setError(
                  "Your browser blocked playback. Press Play again or use the player in Music.",
                );
              }
            },
            onError: () => {
              window.clearTimeout(readyTimeout);
              if (!cancelled) {
                setPlaying(false);
                setError(
                  "This video cannot play right now. Try Play again or open it on YouTube.",
                );
              }
            },
          },
        });
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(readyTimeout);
      playerRef.current = null;
      player?.destroy();
      hostRef.current?.replaceChildren();
    };
  }, [started, attempt]);

  // Position the persistent iframe over the laptop slot without moving its DOM node.
  useEffect(() => {
    if (!slot) {
      setBounds(null);
      return;
    }
    let frame;
    function measure() {
      const rect = slot.getBoundingClientRect();
      const viewport = slot.parentElement.getBoundingClientRect();
      const next = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        clipPath: `inset(${Math.max(0, viewport.top - rect.top)}px ${Math.max(0, rect.right - viewport.right)}px ${Math.max(0, rect.bottom - viewport.bottom)}px ${Math.max(0, viewport.left - rect.left)}px)`,
      };
      setBounds((previous) =>
        previous &&
        Object.keys(next).every((key) => previous[key] === next[key])
          ? previous
          : next,
      );
      frame = requestAnimationFrame(measure);
    }
    measure();
    return () => cancelAnimationFrame(frame);
  }, [slot]);

  function toggle() {
    if (!started || (!ready && error)) {
      requestedPlay.current = true;
      setStarted(true);
      if (started) setAttempt((value) => value + 1);
      return;
    }
    if (!ready) {
      requestedPlay.current = !requestedPlay.current;
      return;
    }
    setError("");
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }

  return (
    <MusicContext.Provider
      value={{
        playing,
        ready,
        loading: started && !ready && !error,
        error,
        toggle,
        open: () => setStarted(true),
        setSlot,
      }}
    >
      {children}
      {started && (
        <div
          ref={hostRef}
          className="persistent-music-player"
          aria-hidden={!slot}
          style={
            bounds
              ? { ...bounds, visibility: "visible" }
              : {
                  left: -10000,
                  top: 0,
                  width: 320,
                  height: 200,
                  visibility: "hidden",
                  pointerEvents: "none",
                }
          }
        />
      )}
    </MusicContext.Provider>
  );
}

export function MusicWindow() {
  const music = useMusic();
  const slotRef = useRef(null);
  useEffect(() => {
    music.open();
    music.setSlot(slotRef.current);
    return () => music.setSlot(null);
  }, [music.setSlot]);
  return (
    <div className="music-app">
      <div className="music-heading">
        <Headphones size={22} aria-hidden="true" />
        <div>
          <h2>Lofi Girl</h2>
          <p>lofi hip hop radio · beats to relax/study to</p>
        </div>
      </div>
      <div
        ref={slotRef}
        className="music-player"
        aria-label="Lofi Girl YouTube music player"
      />
      <p className="browser-notice" role="status">
        {music.error ||
          (music.ready
            ? "Music keeps playing when you close this app or laptop. Use the campus play/pause button to control it."
            : "Loading YouTube music player…")}
      </p>
      <p className="browser-notice">
        Music uses YouTube and needs an internet connection.{" "}
        <a
          href="https://www.youtube.com/watch?v=_jH2oTNRe7g&list=RD_jH2oTNRe7g&start_radio=1"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Lofi Girl on YouTube
        </a>
        .
      </p>
    </div>
  );
}
