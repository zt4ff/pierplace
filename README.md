# PierPlace

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
- Mr Jonathan, Mr Femi, and Mr Ezekiel leave their mentor corners to inspect different areas, then return to their seats. The Facility Manager roams. Kayode sits at Collaboration table A, seat 9; that seat is reserved.
- Characters have restrained, distinct idle animations; only plant leaves sway. Reduced-motion preferences disable decorative animation.
- The dark Latitude-inspired laptop is an anchored hardware-only popup with an Ubuntu desktop: lessons, notes, files, and a **simulated** terminal. The terminal never executes real commands.

## Mock server and storage

MSW intercepts `/api/*` calls in both development and preview builds. Profiles, ID photos, admission, table histories, floor, and completed lessons are stored on this browser/device. Notes have a separate local storage entry. Photos are resized locally and are not uploaded to an external service.

Table chat includes a clearly labeled simulated campus buddy. This is a local prototype, **not live multiplayer or real authentication**. Replace the mock handlers with a backend to introduce shared accounts, presence, and chat.

## Structure

- `src/world.js`: canvas renderer, collisions, navigation, camera, NPC routines, and pixel animation.
- `src/components/Campus.jsx`: fullscreen world lifecycle and corner HUD.
- `src/components/ObjectPopover.jsx`: camera-aware object popup positioning.
- `src/components/Onboarding.jsx`: character creator, photo ID, and admission flow.
- `src/components/Laptop.jsx`: laptop hardware and learning apps.
- `src/components/Chat.jsx`: per-table conversations.
- `src/components/shared.jsx`: character SVG, ID card, modal, and nonmodal popup primitives.
- `src/mocks/`: MSW mock API and persistent mock store.
- `src/api.js`: API client, independent of the mock implementation.
- `src/state.js`: profile palettes, visual puzzles, and storage validation.

## Manual review

Try both floors, select objects near screen edges, pan away from the character, recenter, and watch a mentor complete an inspection and return home. Check Kayode's reserved seat, sitting/standing and chat gating, profile photo uploads, and all laptop apps. On a phone, verify tap-to-select versus drag-to-pan.

Automated state/API/world tests remain available via `npm test`. Browser tests are not being run while manual UI review is in progress.
