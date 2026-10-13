# Fella

A cozy pixel-art learning world built with React, Vite, Lucide icons, and a browser-based MSW mock API. The floor layout is based on `building.png`.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL shown by Vite. Service workers are required for the mock API; use localhost or HTTPS.

```sh
npm run build
npm run preview
```

## Controls and interactions

- Create a character and campus ID, optionally upload a real photo, and solve three visual puzzles to enter.
- The campus occupies the full viewport. Click an open spot to walk; WASD and arrow keys also move your character.
- Move the mouse near the map edges to pan the camera. On touch devices, drag to pan and tap to select or walk. Mouse wheel zooms; Shift-drag or middle-button drag also pans.
- The camera does not follow the player. Use **Find my character** in the bottom-right camera controls to recenter.
- The top-left **Campus menu** includes floor switching, help, home, and a keyboard-accessible destination selector.
- The top-right profile button opens your ID. The bottom-left toolkit opens the laptop, table chat, and stand-up controls.
- Select a chair or object to open an interaction popup next to it. Popups track objects and the camera; they hide when their target leaves the viewport.
- Table chat is enabled after arriving at a table chair. Standing up or changing tables closes an open chat for the previous table.
- Mentors have one persistent location across both floors and take the stairs independently of the player. Jonathan sits for 120–180 seconds between outings; Femi sits for 30–45 seconds, walks faster, and visits more tables and floors. Ezekiel has a slower, quieter routine. Mr Emmanuel and Mr Itunu start upstairs with their own schedules. The Facility Manager roams downstairs. Kayode sits at Collaboration table A, seat 9; that seat is reserved. NPC routines last for the current campus visit, not across page reloads.
- Characters have restrained, distinct idle animations; only plant leaves sway. Reduced-motion preferences disable decorative animation.
- The laptop is screen-only, centered at 90% of the viewport width and height. Its Ubuntu desktop has three icons: **Browser**, **Code editor**, and **Music**. Lessons, notes, files, and a **simulated** terminal remain in the dock. Activities returns to the desktop.
- Browser opens campus learning resources or HTTPS websites in a sandboxed frame. Sites that block embedding can be opened in a new tab. External browsing makes normal network requests; campus notes and code are not sent to those sites.
- Code editor is **Python-only**, with locally bundled Monaco, device autosave, **Run Python**, **Stop**, and an output panel for printed results and errors. Basic variables, arithmetic, lists, loops, and functions need no imports. Optional program input supplies values to `input()`, one per line. Python documents are stored separately so older non-Python work is not overwritten.
- Python runs locally using **Pyodide 0.27.7** in a dedicated worker. The first run downloads the runtime from jsDelivr and requires an internet connection; code and input are not uploaded for execution. Third-party packages are not installed automatically. Every run starts with a fresh namespace, stops after 10 seconds, and limits captured output to 64,000 characters. Closing the editor cancels execution.

- Music embeds Lofi Girl’s YouTube radio using YouTube’s privacy-enhanced embed and IFrame Player API. Playback is started manually and requires an internet connection. The player stays mounted when Music or the laptop closes, so playback continues without restarting. The play/pause button beside the bottom-left toolkit controls the same player and follows its playback state. Reopening Music shows that same player. Reloading or leaving the site stops playback. A YouTube link is available if the embed cannot play.

## Mock server and storage

MSW intercepts `/api/*` calls in both development and preview builds. Profiles, ID photos, admission, table histories, floor, and completed lessons are stored on this browser/device. Notes and editor code each have separate local storage entries. Photos are resized locally and are not uploaded to an external service.

Table chat includes a clearly labeled simulated campus buddy. This is a local prototype, **not live multiplayer or real authentication**. Replace the mock handlers with a backend to introduce shared accounts, presence, and chat.

## Structure

- `src/world.js`: canvas renderer, collisions, navigation, camera, NPC routines, and pixel animation.
- `src/components/Campus.jsx`: fullscreen world lifecycle and corner HUD.
- `src/components/ObjectPopover.jsx`: camera-aware object popup positioning.
- `src/components/Onboarding.jsx`: character creator, photo ID, and admission flow.
- `src/components/Laptop.jsx`: screen-only desktop and learning apps.
- `src/components/Browser.jsx`: sandboxed HTTPS browser and campus start page.
- `src/components/CodeEditor.jsx`: Python-only Monaco editor, autosave, run controls, input, and output.
- `src/python/`: Pyodide worker and execution controller with cancellation and time limits.
- `src/components/Music.jsx`: persistent YouTube player, playback state, and Music window.
- `src/components/Chat.jsx`: per-table conversations.
- `src/components/shared.jsx`: character SVG, ID card, modal, and nonmodal popup primitives.
- `src/mocks/`: MSW mock API and persistent mock store.
- `src/api.js`: API client, independent of the mock implementation.
- `src/state.js`: profile palettes, visual puzzles, and storage validation.

## Manual review

Try both floors, select objects near screen edges, pan away from the character, recenter, and watch a mentor complete an inspection and return home. Check Kayode's reserved seat, sitting/standing and chat gating, profile photo uploads, and all laptop apps. On a phone, verify tap-to-select versus drag-to-pan.

Run state/API/world tests via `npm test`. Browser UI testing is currently manual; do not run Playwright during manual review.
