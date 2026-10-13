// The map stays in logical pixels; CSS controls its display size, not its geometry.
const WIDTH = 1320;
const HEIGHT = 700;
const CELL = 10;
const COLS = WIDTH / CELL;
const ROWS = HEIGHT / CELL;
const PLAYER_RADIUS = 9;
const SPEED = 160;
const PALETTE = {
  floor: '#f2ead5', tile: '#e4dac2', wall: '#245d62', trim: '#438b88',
  oak: '#654137', oakLight: '#98644c', oakDark: '#432e2e',
  purple: '#8973aa', purpleDark: '#574768', teal: '#539994', tealDark: '#32666c',
  ink: '#37474c', cream: '#fff6df', gold: '#d7b56a', green: '#578965',
};
const NPC_NAMES = ['Mr Jonathan', 'Mr Femi', 'Mr Ezekiel', 'Facility Manager', 'Kayode, the male rep'];
const MENTOR_HOMES = [105, 175, 245].map((x, i) => ({
  name: NPC_NAMES[i], x, y: 566, chairY: 560, approachX: x, approachY: 590,
  desk: { x: x - 28, y: 514, w: 56, h: 30 },
}));
const PLANTS = [
  [34, 371, true], [391, 52], [848, 80], [1125, 337, true],
  [322, 619, true], [890, 637, true], [1279, 570], [272, 499],
].map(([x, y, large = false], i) => ({ x, y, large, phase: i * 937, zone: i === 7 ? 'mentor' : 'floor' }));
const COMMON_AISLES = [[345, 375], [375, 435], [620, 435], [865, 435], [715, 565], [850, 650], [1105, 345], [1115, 560]];
const randomBetween = (min, max) => min + Math.random() * (max - min);
const choose = values => values[Math.floor(Math.random() * values.length)];

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function text(ctx, value, x, y, size = 10, color = PALETTE.ink, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = `${size >= 12 ? 'bold ' : ''}${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, Math.round(x), Math.round(y));
}

function color(value, fallback) {
  return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
    ? value : fallback;
}

function shade(hex, amount) {
  let digits = hex.slice(1);
  if (digits.length <= 4) digits = digits.slice(0, 3).split('').map(v => v + v).join('');
  const channels = [0, 2, 4].map(i => Math.max(0, Math.min(255, parseInt(digits.slice(i, i + 2), 16) + amount)));
  return `rgb(${channels.join(',')})`;
}

function shadow(ctx, x, y, w, h) {
  rect(ctx, x + 4, y + 5, w, h, '#604a3320');
  rect(ctx, x + 2, y + 3, w, h, '#604a3315');
}

function roundedPixel(ctx, x, y, w, h, fill, border) {
  if (border) {
    rect(ctx, x + 4, y, w - 8, h, border);
    rect(ctx, x, y + 4, w, h - 8, border);
    x += 2; y += 2; w -= 4; h -= 4;
  }
  rect(ctx, x + 4, y, w - 8, h, fill);
  rect(ctx, x, y + 4, w, h - 8, fill);
}

function makeLayout(floor) {
  const tables = [];
  const objects = [];
  const obstacles = [];
  const scoped = id => `floor-${floor}-${id}`;
  const addObject = object => {
    const result = { floor, ...object, id: scoped(object.id) };
    objects.push(result);
    return result;
  };
  const addTable = (id, label, x, y, w, h, count, orientation = 'horizontal') => {
    const table = { id: scoped(id), label, x, y, w, h, orientation, index: tables.length };
    tables.push(table);
    obstacles.push({ x, y, w, h });
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < count; i++) {
        const horizontal = orientation === 'horizontal';
        const cx = horizontal ? x + (i + 0.5) * w / count : x + (side ? w + 24 : -24);
        const cy = horizontal ? y + (side ? h + 24 : -24) : y + (i + 0.5) * h / count;
        addObject({
          type: 'chair', id: `${id}-chair-${side}-${i + 1}`,
          label: `${label} · seat ${side * count + i + 1}`,
          tableId: table.id, x: cx, y: cy, w: 25, h: 27,
          facing: horizontal ? (side ? 'up' : 'down') : (side ? 'left' : 'right'),
          action: 'Sit down', tint: (i + side + table.index) % 3 === 0 ? 'purple' : 'teal',
          approachX: horizontal ? cx : cx + (side ? 14 : -14),
          approachY: horizontal ? cy + (side ? 14 : -14) : cy,
        });
      }
    }
    return table;
  };

  addTable('west-1', 'Collaboration table A', 42, 112, 326, 40, 9);
  addTable('west-2', 'Collaboration table B', 42, 250, 326, 40, 9);
  addTable('center-1', 'Quiet desk A', 454, 44, 26, 102, 3, 'vertical');
  addTable('center-2', 'Quiet desk B', 564, 44, 26, 102, 3, 'vertical');
  addTable('east-1', 'Focus table A', 704, 104, 34, 170, 5, 'vertical');
  addTable('east-2', 'Focus table B', 858, 104, 34, 170, 5, 'vertical');
  addTable('east-3', 'Focus table C', 1020, 104, 34, 170, 5, 'vertical');
  addTable('east-4', 'Focus table D', 1204, 104, 34, 170, 5, 'vertical');
  addTable('east-lower-1', 'Project table A', 922, 436, 178, 38, 5);
  addTable('east-lower-2', 'Project table B', 922, 580, 178, 38, 5);
  addTable('east-lower-3', 'Project table C', 1204, 372, 36, 174, 5, 'vertical');
  addTable('relaxation', 'Window bar', 644, 44, 172, 16, 2);
  // The window bar has stools only on its aisle side.
  for (let i = objects.length - 1; i >= 0; i--) {
    if (objects[i].tableId === scoped('relaxation') && objects[i].facing === 'down') objects.splice(i, 1);
  }
  [[460, 211], [580, 211], [460, 270], [580, 270]].forEach(([x, y], i) => {
    addObject({ type: 'beanbag', id: `beanbag-${i + 1}`, label: `Commons beanbag ${i + 1}`,
      tableId: null, x, y, w: 42, h: 42, action: 'Sit down', tint: i % 2 ? 'teal' : 'purple',
      approachX: x, approachY: y + 28 });
  });
  addObject({ type: 'water', id: 'water', label: 'Water sink & dispenser',
    action: 'Get water', x: 731, y: 382, w: 178, h: 58, approachX: 731, approachY: 434 });
  obstacles.push({ x: 642, y: 353, w: 178, h: 59 });

  addObject({ type: 'stairs', id: 'stairs', label: floor === 1 ? 'Stairs to floor 2' : 'Stairs to floor 1',
    action: floor === 1 ? 'Go upstairs' : 'Go downstairs', targetFloor: floor === 1 ? 2 : 1,
    x: 513, y: 610, w: 148, h: 84, approachX: 513, approachY: 552 });
  obstacles.push({ x: 439, y: 568, w: 148, h: 84 });

  addObject({ type: 'mentor', id: 'mentor', label: 'Mr Jonathan · mentor corner', name: 'Mr Jonathan',
    npcId: scoped('npc-1'), action: 'Talk to Mr Jonathan', x: 105, y: 529, w: 56, h: 30,
    approachX: 105, approachY: 590 });
  MENTOR_HOMES.forEach(home => obstacles.push({ ...home.desk }));
  obstacles.push({ x: 139, y: 482, w: 4, h: 88 }, { x: 209, y: 482, w: 4, h: 88 });
  // Cubicle partitions leave the south-facing entrance open.
  obstacles.push({ x: 48, y: 470, w: 248, h: 8 }, { x: 48, y: 470, w: 8, h: 148 },
    { x: 288, y: 470, w: 8, h: 148 });
  // Restroom walls, including a real doorway in the west partition.
  obstacles.push({ x: 1150, y: 588, w: 154, h: 8 }, { x: 1296, y: 588, w: 8, h: 96 },
    { x: 1150, y: 676, w: 154, h: 8 }, { x: 1150, y: 588, w: 8, h: 32 },
    { x: 1150, y: 658, w: 8, h: 26 }, { x: 1264, y: 602, w: 20, h: 29 });
  addObject({ type: 'restroom', id: 'restroom', label: 'Restroom', action: 'Visit restroom',
    x: 1176, y: 638, w: 34, h: 34, approachX: 1176, approachY: 638 });

  const kayodeSeat = objects.find(object => object.id === scoped('west-1-chair-0-9'));
  kayodeSeat.occupantId = scoped('npc-5');
  kayodeSeat.occupantName = NPC_NAMES[4];
  kayodeSeat.label += ' · occupied by Kayode';
  kayodeSeat.action = 'Talk to Kayode';
  NPC_NAMES.forEach((name, i) => {
    const home = MENTOR_HOMES[i];
    const student = i === 4;
    const x = home ? home.x : student ? kayodeSeat.x : 1110;
    const y = home ? home.y : student ? kayodeSeat.y + 6 : 666;
    addObject({ type: 'npc', id: `npc-${i + 1}`, name, label: name, action: 'Say hello',
      x, y, w: 30, h: 42, seated: Boolean(home) || student,
      direction: home ? 'up' : student ? kayodeSeat.facing : 'down', step: 0, moving: false,
      idleType: home ? 'writing' : student ? 'typing' : 'manager', idlePhase: 613 + i * 1229,
      homeId: home ? scoped(`mentor-home-${i + 1}`) : null,
      seatId: student ? kayodeSeat.id : null, tableId: student ? kayodeSeat.tableId : null,
      approachX: home ? home.approachX : student ? kayodeSeat.approachX : x,
      approachY: home ? home.approachY : student ? kayodeSeat.approachY : y + 26,
      profile: {
        name, skin: ['#a66b49', '#70472f', '#b57c54', '#895337', '#8f5c3e'][i],
        hair: ['#332c30', '#24262d', '#34302b', '#4c3b32', '#282a32'][i],
        shirt: ['#638e87', '#886d9f', '#bd8458', '#677f9d', '#5c9b92'][i],
        wearId: i === 3 ? 'cap' : i === 1 ? 'glasses' : 'none',
      } });
  });
  return { floor, tables, objects, obstacles };
}

function makeNavigation(layout) {
  const blocked = new Uint8Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL + CELL / 2;
      const y = row * CELL + CELL / 2;
      blocked[row * COLS + col] = x < 25 || x > WIDTH - 25 || y < 29 || y > HEIGHT - 25 ||
        layout.obstacles.some(o => x > o.x - PLAYER_RADIUS && x < o.x + o.w + PLAYER_RADIUS &&
          y > o.y - PLAYER_RADIUS && y < o.y + o.h + PLAYER_RADIUS) ? 1 : 0;
    }
  }
  return blocked;
}

function cellAt(x, y) {
  return Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))) * COLS +
    Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
}

function cellPoint(index) {
  return { x: (index % COLS) * CELL + CELL / 2, y: Math.floor(index / COLS) * CELL + CELL / 2 };
}

function neighbors(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const result = [];
  if (col > 0) result.push(index - 1);
  if (col < COLS - 1) result.push(index + 1);
  if (row > 0) result.push(index - COLS);
  if (row < ROWS - 1) result.push(index + COLS);
  return result;
}

function nearestOpen(blocked, x, y) {
  const start = cellAt(x, y);
  if (!blocked[start]) return start;
  const seen = new Uint8Array(blocked.length);
  const queue = [start];
  seen[start] = 1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const next of neighbors(queue[cursor])) {
      if (seen[next]) continue;
      if (!blocked[next]) return next;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return -1;
}

function route(blocked, start, goal) {
  if (start < 0 || goal < 0 || blocked[start] || blocked[goal]) return null;
  const previous = new Int32Array(blocked.length).fill(-1);
  const queue = new Int32Array(blocked.length);
  let read = 0;
  let write = 1;
  queue[0] = start;
  previous[start] = start;
  while (read < write && previous[goal] === -1) {
    for (const next of neighbors(queue[read++])) {
      if (blocked[next] || previous[next] !== -1) continue;
      previous[next] = queue[read - 1];
      queue[write++] = next;
    }
  }
  if (previous[goal] === -1) return null;
  const result = [];
  for (let at = goal; at !== start; at = previous[at]) result.push(cellPoint(at));
  result.reverse();
  return result;
}

function drawPlant(ctx, x, y, large = false, time = 0, phase = 0, reducedMotion = true) {
  const s = large ? 1.5 : 1;
  shadow(ctx, x - 9 * s, y - 5 * s, 18 * s, 14 * s);
  rect(ctx, x - 8 * s, y - 3 * s, 16 * s, 12 * s, '#a97558');
  rect(ctx, x - 10 * s, y - 5 * s, 20 * s, 4 * s, '#ce9870');
  rect(ctx, x - 6 * s, y - 5 * s, 12 * s, 3 * s, '#57473a');
  rect(ctx, x - 2 * s, y - 24 * s, 4 * s, 20 * s, '#42644b');
  [[-13, -24, 12, 8], [1, -30, 11, 8], [-9, -36, 9, 10], [2, -19, 12, 7]].forEach(([dx, dy, w, h], i) => {
    const sway = reducedMotion ? 0 : Math.round(Math.sin((time + phase) / 1700 + i * 0.7));
    roundedPixel(ctx, x + dx * s + sway, y + dy * s, w * s, h * s, i % 2 ? '#75a67a' : '#4d865e');
  });
}

function drawPlants(ctx, time = 0, reducedMotion = true, zone = null) {
  PLANTS.forEach(plant => {
    if (!zone || plant.zone === zone) drawPlant(ctx, plant.x, plant.y, plant.large, time, plant.phase, reducedMotion);
  });
}

function drawLaptop(ctx, x, y, vertical = false, alternate = false) {
  rect(ctx, x - 10, y + 6, 24, 3, '#332e3033');
  rect(ctx, x - 10, y - 10, 20, 14, '#353e4b');
  rect(ctx, x - 8, y - 8, 16, 10, alternate ? '#adcbd0' : '#7bb7b7');
  rect(ctx, x - 6, y - 6, 8, 2, '#e0f0e0');
  rect(ctx, x - 6, y - 2, 12, 1, '#d3e5d4');
  rect(ctx, x - 12, y + 4, 24, 5, '#9aacae');
  rect(ctx, x - 8, y + 5, 16, 1, '#536a75');
  if (vertical) rect(ctx, x + 13, y - 4, 3, 6, '#dec7a1');
}

function drawBooks(ctx, x, y, seed = 0) {
  rect(ctx, x, y + 3, 17, 11, '#342f3325');
  rect(ctx, x, y, 16, 10, seed % 2 ? '#6c819b' : '#b47879');
  rect(ctx, x + 2, y + 2, 12, 6, '#eee2c8');
  rect(ctx, x - 2, y - 4, 15, 9, '#628c81');
  rect(ctx, x, y - 2, 9, 1, '#abc5a2');
  rect(ctx, x - 1, y - 4, 2, 9, '#426b64');
}

function drawTable(ctx, table) {
  const { x, y, w, h, orientation, index } = table;
  shadow(ctx, x, y, w, h + 3);
  rect(ctx, x + 5, y + h - 1, 6, 9, PALETTE.oakDark);
  rect(ctx, x + w - 11, y + h - 1, 6, 9, PALETTE.oakDark);
  rect(ctx, x, y, w, h, PALETTE.oakDark);
  rect(ctx, x + 2, y + 2, w - 4, h - 5, PALETTE.oak);
  rect(ctx, x + 3, y + 2, w - 6, 3, PALETTE.oakLight);
  rect(ctx, x + 3, y + h - 5, w - 6, 2, '#50362f');
  for (let k = 10; k < h - 5; k += 9) {
    rect(ctx, x + 5, y + k, w - 10, 1, '#ac765024');
  }
  if (h < 24) {
    rect(ctx, x + 20, y + 5, 8, 7, '#e7d0a3');
    rect(ctx, x + 23, y + 3, 2, 3, '#f6e9ca');
    drawBooks(ctx, x + w - 30, y + 5, index);
  } else if (orientation === 'vertical') {
    drawLaptop(ctx, x + w / 2, y + 23, true, index % 2);
    if (h > 130) drawLaptop(ctx, x + w / 2, y + h - 35, true, true);
    drawBooks(ctx, x + 7, y + h / 2 - 4, index);
  } else {
    const count = w > 250 ? 3 : 2;
    for (let i = 0; i < count; i++) drawLaptop(ctx, x + 34 + i * (w - 65) / Math.max(1, count - 1), y + 18, false, i % 2);
    drawBooks(ctx, x + w * 0.43, y + 15, index);
    rect(ctx, x + w - 59, y + 9, 7, 9, '#e9d7b7');
    rect(ctx, x + w - 58, y + 8, 5, 2, '#503c32');
  }
}

function drawChair(ctx, chair) {
  const { x, y, facing, tint } = chair;
  const fill = tint === 'purple' ? PALETTE.purple : PALETTE.teal;
  const dark = tint === 'purple' ? PALETTE.purpleDark : PALETTE.tealDark;
  shadow(ctx, x - 11, y - 9, 22, 23);
  rect(ctx, x - 9, y + 9, 3, 8, dark);
  rect(ctx, x + 6, y + 9, 3, 8, dark);
  roundedPixel(ctx, x - 12, y - 11, 24, 24, fill, dark);
  rect(ctx, x - 7, y - 6, 14, 2, '#ffffff30');
  if (facing === 'down' || facing === 'up') {
    const backY = facing === 'down' ? y - 15 : y + 8;
    roundedPixel(ctx, x - 13, backY, 26, 8, dark);
    rect(ctx, x - 9, backY + 2, 18, 3, fill);
  } else {
    const backX = facing === 'right' ? x - 15 : x + 7;
    roundedPixel(ctx, backX, y - 13, 8, 26, dark);
    rect(ctx, backX + 2, y - 9, 3, 18, fill);
  }
}

function drawBeanbag(ctx, bag) {
  const purple = bag.tint === 'purple';
  const fill = purple ? '#9c83b2' : '#6ba79e';
  const dark = purple ? '#715b86' : '#487d78';
  shadow(ctx, bag.x - 20, bag.y - 14, 40, 34);
  roundedPixel(ctx, bag.x - 22, bag.y - 19, 44, 40, fill, dark);
  rect(ctx, bag.x - 15, bag.y - 13, 24, 4, purple ? '#b8a0c8' : '#94c1b0');
  rect(ctx, bag.x - 14, bag.y + 9, 28, 4, dark);
  rect(ctx, bag.x + 11, bag.y - 7, 3, 14, dark);
  rect(ctx, bag.x - 6, bag.y - 4, 12, 9, purple ? '#9177a5' : '#61988f');
}

function drawRug(ctx, x, y, w, h, fill, edge) {
  rect(ctx, x + 3, y + 3, w, h, '#6757430d');
  rect(ctx, x, y, w, h, edge);
  rect(ctx, x + 4, y + 4, w - 8, h - 8, fill);
  for (let i = x + 9; i < x + w - 6; i += 12) {
    rect(ctx, i, y + 8, 5, 2, edge);
    rect(ctx, i, y + h - 10, 5, 2, edge);
  }
  for (let i = y + 12; i < y + h - 10; i += 10) {
    rect(ctx, x + 9, i, w - 18, 1, '#ffffff12');
  }
}

function drawArchitecture(ctx, floor, { plants = true } = {}) {
  rect(ctx, 0, 0, WIDTH, HEIGHT, '#e0d6be');
  rect(ctx, 16, 16, WIDTH - 32, HEIGHT - 32, PALETTE.floor);
  for (let y = 18; y < HEIGHT - 16; y += 32) {
    for (let x = 18; x < WIDTH - 16; x += 32) {
      if ((x / 32 + y / 32) % 3 < 1) rect(ctx, x + 1, y + 1, 30, 30, '#fff9e516');
      rect(ctx, x, y, 1, 32, PALETTE.tile);
      rect(ctx, x, y, 32, 1, PALETTE.tile);
      rect(ctx, x + 2, y + 2, 1, 1, '#fffaf0');
    }
  }
  // Soft rectangular light shafts stay deliberately pixel-shaped.
  for (const x of [58, 224, 414, 850, 1054, 1222]) {
    rect(ctx, x - 20, 27, 82, 68, '#fff9d62e');
    rect(ctx, x - 12, 27, 66, 110, '#fff9d620');
    rect(ctx, x, 27, 42, 146, '#fff9d614');
  }
  drawRug(ctx, 409, 176, 221, 135, floor === 1 ? '#dcccd1' : '#c7d7cb', '#b6a4b3');
  drawRug(ctx, 58, 482, 228, 128, '#c8d6cc', '#9ab6ad');
  drawRug(ctx, 604, 465, 280, 103, '#e3d7b8', '#caba98');
  drawRug(ctx, 439, 328, 148, 50, '#78a09a', '#4e7a78');
  text(ctx, 'WELCOME IN', 513, 352, 11, '#f6efd7');
  rect(ctx, 0, 0, WIDTH, 16, PALETTE.wall);
  rect(ctx, 0, 0, WIDTH, 5, '#183f49');
  rect(ctx, 0, 16, WIDTH, 5, PALETTE.trim);
  rect(ctx, 0, 0, 16, HEIGHT, PALETTE.wall);
  rect(ctx, WIDTH - 16, 0, 16, HEIGHT, PALETTE.wall);
  rect(ctx, 16, 21, 5, HEIGHT - 37, '#4d8c841f');
  rect(ctx, 0, HEIGHT - 16, 618, 16, PALETTE.wall);
  rect(ctx, 704, HEIGHT - 16, WIDTH - 704, 16, PALETTE.wall);
  rect(ctx, 618, HEIGHT - 16, 86, 16, '#c5b694');
  rect(ctx, 620, HEIGHT - 15, 82, 3, PALETTE.gold);
  rect(ctx, 620, HEIGHT - 5, 82, 2, PALETTE.gold);
  for (const [x, w] of [[45, 300], [405, 198], [850, 254], [1158, 125]]) {
    rect(ctx, x - 3, 4, w + 6, 24, '#17434e');
    rect(ctx, x, 5, w, 18, '#99d4cb');
    rect(ctx, x + 3, 7, w - 6, 5, '#ddf5dc');
    rect(ctx, x + 3, 15, w - 6, 6, '#b9e1cd');
    for (let bar = x + 30; bar < x + w; bar += 44) rect(ctx, bar, 5, 4, 18, '#427c7e');
    rect(ctx, x - 4, 24, w + 8, 4, '#cfb893');
  }
  text(ctx, 'COLLABORATION', 203, 52, 13, '#66847e');
  text(ctx, 'FOCUS STUDIO', 958, 60, 13, '#66847e');
  text(ctx, 'THE COMMONS', 735, 456, 13, '#8c8067');
  text(ctx, 'MENTOR CORNER', 175, 451, 12, '#66847e');
  text(ctx, 'QUIET NOOK', 519, 163, 9, '#7a8072');
  text(ctx, `PIERPLACE / ${floor === 1 ? 'GROUND FLOOR' : 'UPPER FLOOR'}`, 174, 653, 10, '#8f8b74');
  text(ctx, 'MAKE ROOM FOR GOOD IDEAS', 739, 550, 8, '#9b8c6f');
  if (plants) drawPlants(ctx, 0, true, 'floor');
  // Small wall art, pinboard, and a clock personalize the open south-west wing.
  rect(ctx, 74, 374, 104, 51, '#84705b');
  rect(ctx, 78, 378, 96, 43, '#cfb78c');
  [[84, 385, '#f4e4b8'], [110, 391, '#bed5cd'], [142, 382, '#e5bcc0']].forEach(([x, y, c]) => {
    rect(ctx, x, y, 22, 25, c);
    rect(ctx, x + 9, y + 1, 3, 3, '#a3645b');
    rect(ctx, x + 4, y + 9, 14, 1, '#8e947b');
    rect(ctx, x + 4, y + 13, 10, 1, '#8e947b');
  });
  text(ctx, 'COMMUNITY BOARD', 126, 434, 8, '#958872');
  roundedPixel(ctx, 305, 381, 26, 26, '#fff4d9', '#749590');
  rect(ctx, 317, 386, 2, 10, '#536e70');
  rect(ctx, 318, 394, 7, 2, '#536e70');
  rect(ctx, 330, 570, 61, 24, '#d9c6a6');
  rect(ctx, 333, 573, 55, 18, '#f4e4c6');
  text(ctx, 'be kind.', 360, 582, 9, '#90786a');
}

function drawUtilities(ctx, layout, { plants = true } = {}) {
  shadow(ctx, 642, 353, 178, 59);
  rect(ctx, 642, 353, 178, 59, '#688a84');
  rect(ctx, 645, 356, 172, 18, '#e2dcca');
  rect(ctx, 646, 378, 112, 29, '#83a19a');
  rect(ctx, 650, 381, 49, 22, '#a8bcb0');
  rect(ctx, 706, 381, 48, 22, '#a8bcb0');
  rect(ctx, 691, 391, 3, 3, '#647b77');
  rect(ctx, 709, 391, 3, 3, '#647b77');
  roundedPixel(ctx, 661, 359, 51, 17, '#a7beb8', '#5c807f');
  rect(ctx, 665, 361, 43, 10, '#668e95');
  rect(ctx, 684, 350, 5, 12, '#536b74');
  rect(ctx, 687, 350, 10, 4, '#bfd5cf');
  rect(ctx, 768, 352, 33, 51, '#e2e6da');
  roundedPixel(ctx, 774, 333, 21, 23, '#b4d6dc', '#79a7b2');
  rect(ctx, 777, 336, 6, 16, '#d4ece5');
  rect(ctx, 772, 367, 25, 19, '#526e7c');
  rect(ctx, 777, 370, 4, 4, '#90c5d0');
  rect(ctx, 787, 370, 4, 4, '#cc9a8d');
  rect(ctx, 781, 380, 8, 8, '#f1e9d5');
  text(ctx, 'REFILL & REFRESH', 731, 421, 9, '#73887d');

  shadow(ctx, 439, 568, 148, 84);
  rect(ctx, 439, 568, 148, 84, '#496c72');
  for (let i = 0; i < 7; i++) {
    rect(ctx, 447 + i * 2, 574 + i * 10, 128 - i * 4, 8, '#b5bcb0');
    rect(ctx, 447 + i * 2, 574 + i * 10, 128 - i * 4, 2, '#e2deca');
    rect(ctx, 447 + i * 2, 580 + i * 10, 128 - i * 4, 2, '#778d8a');
  }
  rect(ctx, 439, 568, 5, 84, '#31565d');
  rect(ctx, 582, 568, 5, 84, '#31565d');
  text(ctx, layout.floor === 1 ? '↑ UPSTAIRS' : '↓ DOWNSTAIRS', 513, 665, 10, '#67827d');

  rect(ctx, 48, 470, 248, 8, PALETTE.wall);
  rect(ctx, 48, 470, 8, 148, PALETTE.wall);
  rect(ctx, 288, 470, 8, 148, PALETTE.wall);
  rect(ctx, 56, 476, 230, 3, PALETTE.trim);
  for (const x of [139, 209]) {
    rect(ctx, x, 482, 4, 88, PALETTE.wall);
    rect(ctx, x, 482, 4, 3, PALETTE.trim);
  }
  MENTOR_HOMES.forEach((home, i) => {
    const { x, y, w, h } = home.desk;
    shadow(ctx, x, y, w, h);
    rect(ctx, x + 4, y + h, 4, 5, PALETTE.oakDark);
    rect(ctx, x + w - 8, y + h, 4, 5, PALETTE.oakDark);
    rect(ctx, x, y, w, h, PALETTE.oakDark);
    rect(ctx, x + 2, y + 2, w - 4, h - 5, PALETTE.oak);
    rect(ctx, x + 3, y + 2, w - 6, 2, PALETTE.oakLight);
    rect(ctx, x + 8, y + 9, 22, 12, '#f3e7cd');
    rect(ctx, x + 11, y + 12, 14, 1, '#a8b29b');
    rect(ctx, x + 11, y + 16, 10, 1, '#a8b29b');
    rect(ctx, x + 31, y + 10, 2, 13, '#d0aa71');
    rect(ctx, x + 41, y + 8, 6, 8, '#d9c6a6');
    rect(ctx, x + 42, y + 8, 4, 2, '#4c3932');
    drawChair(ctx, { x: home.x, y: home.chairY, facing: 'up', tint: i === 1 ? 'teal' : 'purple' });
    text(ctx, home.name.replace('Mr ', '').toUpperCase(), home.x, 490, 7, '#64837a');
  });
  if (plants) drawPlants(ctx, 0, true, 'mentor');

  rect(ctx, 1150, 588, 154, 96, '#dbe4d8');
  for (let y = 597; y < 677; y += 16) {
    for (let x = 1159; x < 1296; x += 16) {
      rect(ctx, x, y, 14, 14, (x + y) % 32 ? '#e9ece0' : '#c8d7ce');
    }
  }
  rect(ctx, 1150, 588, 154, 8, PALETTE.wall);
  rect(ctx, 1296, 588, 8, 96, PALETTE.wall);
  rect(ctx, 1150, 676, 154, 8, PALETTE.wall);
  rect(ctx, 1150, 588, 8, 32, PALETTE.wall);
  rect(ctx, 1150, 658, 8, 26, PALETTE.wall);
  rect(ctx, 1152, 618, 30, 4, '#9e8665');
  rect(ctx, 1177, 622, 3, 3, '#d4bd77');
  roundedPixel(ctx, 1262, 600, 24, 34, '#fff8e6', '#9cafa5');
  roundedPixel(ctx, 1266, 610, 16, 18, '#c9d7cf', '#b2c6bf');
  rect(ctx, 1264, 602, 20, 6, '#f6f3e6');
  rect(ctx, 1190, 600, 35, 10, '#92b5af');
  rect(ctx, 1193, 602, 29, 6, '#d4e8dc');
  roundedPixel(ctx, 1190, 612, 35, 17, '#eef0e3', '#92aaa3');
  rect(ctx, 1204, 609, 4, 8, '#6f8a8b');
  text(ctx, 'RESTROOM', 1225, 654, 9, '#748e84');
}

function drawStatic(ctx, layout, { plants = true } = {}) {
  drawArchitecture(ctx, layout.floor, { plants });
  layout.tables.forEach(table => drawTable(ctx, table));
  layout.objects.forEach(object => {
    if (object.type === 'chair') drawChair(ctx, object);
    if (object.type === 'beanbag') drawBeanbag(ctx, object);
  });
  drawUtilities(ctx, layout, { plants });
}

function drawSprite(ctx, x, y, profile = {}, {
  seated = false, direction = 'down', step = 0, time = 0, moving = false,
  idleType = 'player', idlePhase = 0, reducedMotion = false,
} = {}) {
  const skin = color(profile.skin, '#b87d55');
  const hair = color(profile.hair, '#342b30');
  const shirt = color(profile.shirt, '#548e8b');
  const wear = String(profile.wearId || '').toLowerCase();
  const localTime = time + idlePhase;
  const idle = !moving && !reducedMotion;
  const breath = idle && Math.sin(localTime / (1750 + idlePhase % 500)) > 0.65 ? 1 : 0;
  const weightShift = idle && idleType === 'manager' && localTime % 12000 > 10500 ? 1 : 0;
  const stretch = idle && !seated && idleType === 'player' && localTime % 17000 > 14600 && localTime % 17000 < 15100;
  const glance = idle && localTime % (11000 + idlePhase % 1800) > 10000;
  const faceDirection = glance && direction === 'up' ? (idlePhase % 2 ? 'left' : 'right') : direction;
  const working = idle && seated && (idleType === 'writing' || idleType === 'typing');
  const workBeat = Math.floor(localTime / (idleType === 'writing' ? 360 : 150)) % 4;
  const leftLift = working ? (idleType === 'writing' ? 1 : (workBeat % 2) * 2) : 0;
  const rightLift = working ? (idleType === 'writing' ? 2 + (workBeat === 2 ? 1 : 0) : ((workBeat + 1) % 2) * 2) : 0;
  const bob = moving && !seated && Math.abs(Math.sin(step)) > 0.6 ? 1 : 0;
  const px = Math.round(x) + weightShift;
  const py = Math.round(y) - bob - breath;
  const legSwing = moving && !seated ? Math.round(Math.sin(step) * 2) : 0;
  roundedPixel(ctx, Math.round(x) - 12, Math.round(y) - 2, 24, 7, '#3c393326');
  rect(ctx, px - 8, py - 13, 6, seated ? 9 : 12, '#485267');
  rect(ctx, px + 2, py - 13, 6, seated ? 9 : 12, '#3a465d');
  rect(ctx, px - 9, py - 3 + legSwing, 7, 4, '#343847');
  rect(ctx, px + 2, py - 3 - legSwing, 7, 4, '#343847');
  roundedPixel(ctx, px - 10, py - 29, 20, 19, shirt);
  rect(ctx, px - 7, py - 26, 4, 12, shade(shirt, 24));
  rect(ctx, px + 7, py - 24, 3, 13, shade(shirt, -24));
  rect(ctx, px - 13, stretch ? py - 31 : py - 24, 4, stretch ? 12 : 10 - leftLift, shirt);
  rect(ctx, px + 9, stretch ? py - 30 : py - 24, 4, stretch ? 12 : 10 - rightLift, shirt);
  rect(ctx, px - 13, stretch ? py - 34 : py - 14 - leftLift, 4, 5, skin);
  rect(ctx, px + 9, stretch ? py - 33 : py - 14 - rightLift, 4, 5, skin);
  rect(ctx, px - 3, py - 33, 6, 6, shade(skin, -15));
  roundedPixel(ctx, px - 9, py - 46, 18, 18, skin);
  rect(ctx, px + 6, py - 40, 3, 9, shade(skin, -20));
  roundedPixel(ctx, px - 10, py - 49, 20, 10, hair);
  rect(ctx, px - 10, py - 43, 4, 10, hair);
  rect(ctx, px + 7, py - 43, 3, 8, hair);
  rect(ctx, px - 6, py - 48, 8, 2, shade(hair, 18));
  if (faceDirection === 'up') {
    rect(ctx, px - 7, py - 40, 14, 9, hair);
  } else {
    const offset = faceDirection === 'left' ? -2 : faceDirection === 'right' ? 2 : glance ? (idlePhase % 2 ? -1 : 1) : 0;
    const blinking = !reducedMotion && localTime % (3200 + idlePhase % 1700) < 115;
    if (!blinking) {
      rect(ctx, px - 5 + offset, py - 38, 3, 3, '#f9efdc');
      rect(ctx, px + 3 + offset, py - 38, 3, 3, '#f9efdc');
      rect(ctx, px - 4 + offset, py - 37, 2, 2, '#2f3035');
      rect(ctx, px + 4 + offset, py - 37, 2, 2, '#2f3035');
    } else {
      rect(ctx, px - 5 + offset, py - 37, 3, 1, '#453331');
      rect(ctx, px + 3 + offset, py - 37, 3, 1, '#453331');
    }
    rect(ctx, px + offset, py - 32, 3, 1, '#754936');
  }
  if (/glass|spec/.test(wear) && faceDirection !== 'up') {
    rect(ctx, px - 7, py - 39, 6, 1, '#36394b');
    rect(ctx, px + 2, py - 39, 6, 1, '#36394b');
    rect(ctx, px - 7, py - 39, 1, 5, '#36394b');
    rect(ctx, px + 7, py - 39, 1, 5, '#36394b');
    rect(ctx, px - 1, py - 38, 3, 1, '#36394b');
  }
  if (/cap|hat|beanie/.test(wear)) {
    rect(ctx, px - 10, py - 51, 20, 8, /beanie/.test(wear) ? '#c59675' : shade(shirt, -12));
    rect(ctx, px - 8, py - 52, 16, 3, shade(shirt, 20));
    rect(ctx, px - 10, py - 44, 25, 3, shade(shirt, -25));
  }
  if (/headphone/.test(wear)) {
    rect(ctx, px - 11, py - 48, 22, 3, '#424556');
    rect(ctx, px - 12, py - 44, 4, 10, '#d9b67d');
    rect(ctx, px + 8, py - 44, 4, 10, '#d9b67d');
  }
  if (/hood/.test(wear)) {
    rect(ctx, px - 8, py - 28, 16, 3, shade(shirt, -25));
    rect(ctx, px - 3, py - 24, 1, 6, '#e5dec8');
    rect(ctx, px + 3, py - 24, 1, 6, '#e5dec8');
  }
  if (/scarf/.test(wear)) {
    rect(ctx, px - 7, py - 29, 14, 4, '#d2a262');
    rect(ctx, px + 3, py - 25, 4, 10, '#d2a262');
  }
  if (/backpack/.test(wear) && direction === 'up') {
    roundedPixel(ctx, px - 7, py - 27, 14, 14, '#b88b58', '#775b42');
  }
  // Player profiles use a boolean ID toggle; NPCs keep their string accessories.
  if (profile.wearId === true && direction !== 'up') {
    const offset = direction === 'left' ? -3 : direction === 'right' ? 3 : 0;
    rect(ctx, px - 5 + offset, py - 29, 2, 6, '#d7b56a');
    rect(ctx, px + 3 + offset, py - 29, 2, 6, '#d7b56a');
    rect(ctx, px - 3 + offset, py - 24, 2, 3, '#d7b56a');
    rect(ctx, px + 1 + offset, py - 24, 2, 3, '#d7b56a');
    rect(ctx, px - 1 + offset, py - 22, 2, 3, '#d7b56a');
    rect(ctx, px - 5 + offset, py - 21, 10, 11, '#c7a15a');
    rect(ctx, px - 4 + offset, py - 20, 8, 9, '#fff6df');
    rect(ctx, px - 3 + offset, py - 18, 4, 6, '#98b9ae');
    rect(ctx, px - 2 + offset, py - 18, 2, 1, hair);
    rect(ctx, px - 2 + offset, py - 17, 2, 2, skin);
    rect(ctx, px - 3 + offset, py - 14, 4, 2, shirt);
    rect(ctx, px + 2 + offset, py - 17, 1, 1, '#c7a15a');
    rect(ctx, px + 2 + offset, py - 14, 1, 2, '#c7a15a');
  }
}

function drawName(ctx, name, x, y, player = false) {
  const safeName = String(name || (player ? 'You' : '')).slice(0, 32);
  if (!safeName) return;
  ctx.font = `${player ? 'bold ' : ''}9px monospace`;
  const width = Math.ceil(ctx.measureText(safeName).width) + 14;
  const cx = Math.max(width / 2 + 20, Math.min(WIDTH - width / 2 - 20, x));
  const cy = Math.max(35, y - 62);
  roundedPixel(ctx, cx - width / 2, cy - 9, width, 18, player ? '#285f64ed' : '#fff8e7e8');
  text(ctx, safeName, cx, cy, 9, player ? '#fff5df' : '#586b68');
  if (player) rect(ctx, cx - 2, cy + 9, 4, 3, '#285f64');
}

function drawSelection(ctx, object, time, hovered = false) {
  if (!object) return;
  const w = object.w + 10;
  const h = object.h + 10;
  const x = object.x - w / 2;
  const y = object.type === 'npc' ? object.y - object.h - 4 : object.y - h / 2;
  const c = hovered ? '#e7ba6a' : '#e7c988';
  for (const [dx, dy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]) {
    rect(ctx, x + dx - (sx < 0 ? 9 : 0), y + dy - (sy < 0 ? 2 : 0), 9, 2, c);
    rect(ctx, x + dx - (sx < 0 ? 2 : 0), y + dy - (sy < 0 ? 9 : 0), 2, 9, c);
  }
  if (!hovered) {
    const bob = Math.floor(Math.sin(time / 240) * 2);
    rect(ctx, object.x - 4, y - 9 + bob, 8, 3, c);
    rect(ctx, object.x - 2, y - 6 + bob, 4, 3, c);
  }
}

function fitCanvas(canvas, ctx, dpr) {
  const ratio = Math.max(1, Math.min(3, Number(dpr) || 1));
  const width = Math.round(WIDTH * ratio);
  const height = Math.round(HEIGHT * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ratio;
}

function editingOrModal(doc) {
  const active = doc.activeElement;
  if (active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable ||
    active.closest?.('[contenteditable="true"], [role="textbox"], [role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]'))) return true;
  if (doc.querySelector('dialog[open]')) return true;
  return Array.from(doc.querySelectorAll('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')).some(element =>
    !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
}

const KEY_DIRECTIONS = {
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
};

/**
 * Canvas campus controller. Clicking selects an object; interact(object) executes
 * the selection after walking to it. All coordinates and callback positions are
 * logical 1320 × 700 pixels. Object/table IDs are stable and floor-scoped.
 */
export class PixelWorld {
  constructor(canvas, { onInteract, onMove, camera = false, onCameraChange } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('PixelWorld requires a canvas.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('A 2D canvas context is required.');
    this.doc = canvas.ownerDocument;
    this.win = this.doc.defaultView;
    this.onInteract = typeof onInteract === 'function' ? onInteract : null;
    this.onMove = typeof onMove === 'function' ? onMove : null;
    this.cameraEnabled = camera === true;
    this.onCameraChange = typeof onCameraChange === 'function' ? onCameraChange : null;
    this.cameraX = this.cameraY = 0;
    this.zoom = this.cameraEnabled ? 1.35 : 1;
    this.scale = 1;
    this.viewWidth = WIDTH;
    this.viewHeight = HEIGHT;
    this.cameraWidth = WIDTH;
    this.cameraHeight = HEIGHT;
    this.cameraInitialized = false;
    this.lastCamera = null;
    this.pointerPosition = null;
    this.gesture = null;
    this.floor = 1;
    this.active = false;
    this.destroyed = false;
    this.profile = { name: 'You', skin: '#b87d55', hair: '#342b30', shirt: '#548e8b', wearId: 'none' };
    this.player = { x: 655, y: 635, seated: false, tableId: null, direction: 'up', step: 0 };
    this.path = [];
    this.pending = null;
    this.seat = null;
    this.selected = null;
    this.hovered = null;
    this.keys = new Set();
    this.raf = null;
    this.lastTime = null;
    this.lastMove = null;
    this.marker = null;
    this.originalCursor = canvas.style.cursor;
    this.originalTouchAction = canvas.style.touchAction;
    if (this.cameraEnabled) canvas.style.touchAction = 'none';
    this.layout = makeLayout(this.floor);
    this.blocked = makeNavigation(this.layout);
    this.ambientTime = 0;
    this._resetActors();
    this.motionQuery = this.win.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
    this.reducedMotion = Boolean(this.motionQuery?.matches);
    this.background = this.doc.createElement('canvas');
    this.background.width = WIDTH;
    this.background.height = HEIGHT;
    this.backgroundCtx = this.background.getContext('2d');
    drawStatic(this.backgroundCtx, this.layout, { plants: false });
    this.dpr = 1;

    this.handlePointer = event => this.cameraEnabled ? this._cameraPointerDown(event) : this._pointer(event);
    this.handleHover = event => this.cameraEnabled ? this._cameraPointerMove(event) : this._hover(event);
    this.handleLeave = () => {
      this.pointerPosition = null;
      this.hovered = null;
      this.canvas.style.cursor = this.originalCursor;
    };
    this.handlePointerUp = event => this._cameraPointerEnd(event);
    this.handlePointerCancel = event => this._cameraPointerEnd(event, true);
    this.handleWheel = event => this._wheel(event);
    this.handleKeyDown = event => {
      const key = event.key.toLowerCase();
      if (!this.active || this.destroyed || !KEY_DIRECTIONS[key] || event.ctrlKey || event.metaKey || event.altKey || editingOrModal(this.doc)) return;
      event.preventDefault();
      this.keys.add(key);
      this.path = [];
      this.pending = null;
      this.marker = null;
      this.stand();
    };
    this.handleKeyUp = event => this.keys.delete(event.key.toLowerCase());
    this.handleBlur = () => { this.keys.clear(); this._resetCameraInput(); };
    this.handleResize = () => { if (!this.destroyed) this._render(this.win.performance.now()); };
    this.handleMotionChange = event => {
      this.reducedMotion = Boolean(event.matches);
      if (!this.destroyed) this._render(this.win.performance.now());
    };
    this.tick = time => {
      this.raf = null;
      if (!this.active || this.destroyed) return;
      const dt = this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, 0.05);
      this.lastTime = time;
      if (this.cameraEnabled) this._updateCamera(dt);
      this._update(dt, time);
      if (!this.active || this.destroyed) return;
      this._render(time);
      this.raf = this.win.requestAnimationFrame(this.tick);
    };
    canvas.addEventListener('pointerdown', this.handlePointer);
    canvas.addEventListener('pointermove', this.handleHover);
    canvas.addEventListener('pointerleave', this.handleLeave);
    if (this.cameraEnabled) {
      canvas.addEventListener('pointerup', this.handlePointerUp);
      canvas.addEventListener('pointercancel', this.handlePointerCancel);
      canvas.addEventListener('lostpointercapture', this.handlePointerCancel);
      canvas.addEventListener('wheel', this.handleWheel, { passive: false });
      if (this.win.ResizeObserver) {
        this.resizeObserver = new this.win.ResizeObserver(this.handleResize);
        this.resizeObserver.observe(canvas);
      }
    }
    this.win.addEventListener('keydown', this.handleKeyDown);
    this.win.addEventListener('keyup', this.handleKeyUp);
    this.win.addEventListener('blur', this.handleBlur);
    this.win.addEventListener('resize', this.handleResize);
    if (this.motionQuery?.addEventListener) this.motionQuery.addEventListener('change', this.handleMotionChange);
    else this.motionQuery?.addListener?.(this.handleMotionChange);
    this._render(0);
  }

  /** Camera x/y and viewport width/height are logical world units; scale is CSS pixels per world unit. */
  getCamera() {
    const x = this.cameraEnabled ? this.cameraX : 0;
    const y = this.cameraEnabled ? this.cameraY : 0;
    const width = this.cameraEnabled ? this.cameraWidth : WIDTH;
    const height = this.cameraEnabled ? this.cameraHeight : HEIGHT;
    return { x, y, width, height, zoom: this.zoom, scale: this.scale,
      playerVisible: this.player.x >= x && this.player.x <= x + width &&
        this.player.y >= y && this.player.y <= y + height };
  }

  /** Projects to viewport/client CSS pixels (including the canvas's left/top), never DPR pixels. */
  worldToScreen(x, y) {
    const bounds = this.canvas.getBoundingClientRect();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0, visible: false };
    const screenX = this.cameraEnabled ? (x - this.cameraX) * this.scale : x * bounds.width / WIDTH;
    const screenY = this.cameraEnabled ? (y - this.cameraY) * this.scale : y * bounds.height / HEIGHT;
    return { x: bounds.left + screenX, y: bounds.top + screenY,
      visible: !this.destroyed && bounds.width > 0 && bounds.height > 0 && x >= 0 && x <= WIDTH && y >= 0 && y <= HEIGHT &&
        screenX >= 0 && screenX <= bounds.width && screenY >= 0 && screenY <= bounds.height };
  }

  /** A popup anchor twelve logical pixels above the object's live hit area; unknown IDs return null. */
  getObjectScreenPosition(id) {
    if (this.destroyed) return null;
    const object = this.layout.objects.find(item => item.id === id);
    if (!object) return null;
    const top = object.type === 'npc' ? object.y - object.h : object.y - object.h / 2;
    return this.worldToScreen(object.x, top - 12);
  }

  /** Release conversation targets. An interaction still being approached remains pinned until arrival. */
  clearSelection() {
    if (this.destroyed) return;
    this.selected = this.hovered = null;
    this.pointerPosition = null;
    this.canvas.style.cursor = this.originalCursor;
    this._render(this.win.performance.now());
  }

  centerOnPlayer() {
    if (this._cameraControlsAllowed()) {
      this._fitCamera();
      this._centerCamera();
      this._render(this.win.performance.now());
    }
    return this.getCamera();
  }

  setZoom(value) {
    if (this._cameraControlsAllowed() && Number.isFinite(value)) {
      this._fitCamera();
      this._zoomTo(value, this.viewWidth / 2, this.viewHeight / 2);
    }
    return this.getCamera();
  }

  zoomBy(delta) {
    return Number.isFinite(delta) ? this.setZoom(this.zoom + delta) : this.getCamera();
  }

  /** Positive dx/dy moves the view right/down, without moving the player. */
  panCamera(dx, dy) {
    if (this._cameraControlsAllowed() && Number.isFinite(dx) && Number.isFinite(dy)) {
      this._fitCamera();
      this.cameraX += dx;
      this.cameraY += dy;
      this._clampCamera();
      this._render(this.win.performance.now());
    }
    return this.getCamera();
  }

  setPlayer(profile = {}) {
    if (this.destroyed) return;
    this.profile = { ...this.profile, ...profile };
    this._render(this.win.performance.now());
  }

  setFloor(floor) {
    if (floor !== 1 && floor !== 2) throw new RangeError('Floor must be 1 or 2.');
    if (this.destroyed) return;
    this.floor = floor;
    this.layout = makeLayout(floor);
    this.blocked = makeNavigation(this.layout);
    this.ambientTime = 0;
    this._resetActors();
    this.path = [];
    this.keys.clear();
    this.pending = this.seat = this.selected = this.hovered = this.marker = null;
    this.player = { x: 655, y: 635, seated: false, tableId: null, direction: 'up', step: 0 };
    if (this.cameraEnabled) {
      this._resetCameraInput();
      this._fitCamera();
      this._centerCamera();
    }
    drawStatic(this.backgroundCtx, this.layout, { plants: false });
    this.lastMove = null;
    this._emitMove();
    this._render(this.win.performance.now());
  }

  setActive(active) {
    if (this.destroyed) return;
    const next = Boolean(active);
    if (next === this.active) return;
    this.active = next;
    this.lastTime = null;
    if (next) {
      this._emitMove();
      if (!this.active || this.destroyed) return;
      this.raf = this.win.requestAnimationFrame(this.tick);
    } else {
      if (this.raf !== null) this.win.cancelAnimationFrame(this.raf);
      this.raf = null;
      this.keys.clear();
      this._resetCameraInput();
      this._render(this.win.performance.now());
    }
  }

  /** Release the seat and return to the adjacent, collision-free aisle. */
  stand() {
    if (this.destroyed || !this.player.seated) return;
    if (this.seat) {
      const open = nearestOpen(this.blocked, this.seat.approachX, this.seat.approachY);
      if (open >= 0) Object.assign(this.player, cellPoint(open));
    }
    this.player.seated = false;
    this.player.tableId = null;
    this.seat = null;
    this.path = [];
    this.pending = null;
    this._emitMove();
    this._render(this.win.performance.now());
  }

  /** Returns false for a stale/unknown object or an unreachable destination. */
  interact(object) {
    if (this.destroyed) return false;
    const id = typeof object === 'string' ? object : object?.id;
    const target = this.layout.objects.find(item => item.id === id);
    if (!target || target.occupantId) return false;
    this.stand();
    this.keys.clear();
    this.selected = target;
    const conversationTarget = target.npcId ? this.layout.objects.find(item => item.id === target.npcId) : target;
    const goal = nearestOpen(this.blocked, conversationTarget.approachX, conversationTarget.approachY);
    const points = this._routeTo(goal);
    if (!points) return false;
    this.path = points;
    this.pending = target;
    this.marker = null;
    if (!points.length) this._arrive();
    this._render(this.win.performance.now());
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.active = false;
    if (this.raf !== null) this.win.cancelAnimationFrame(this.raf);
    this.raf = null;
    this.canvas.removeEventListener('pointerdown', this.handlePointer);
    this.canvas.removeEventListener('pointermove', this.handleHover);
    this.canvas.removeEventListener('pointerleave', this.handleLeave);
    if (this.cameraEnabled) {
      this.canvas.removeEventListener('pointerup', this.handlePointerUp);
      this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
      this.canvas.removeEventListener('lostpointercapture', this.handlePointerCancel);
      this.canvas.removeEventListener('wheel', this.handleWheel);
      this.resizeObserver?.disconnect();
      this.canvas.style.touchAction = this.originalTouchAction;
    }
    this._resetCameraInput();
    this.win.removeEventListener('keydown', this.handleKeyDown);
    this.win.removeEventListener('keyup', this.handleKeyUp);
    this.win.removeEventListener('blur', this.handleBlur);
    this.win.removeEventListener('resize', this.handleResize);
    if (this.motionQuery?.removeEventListener) this.motionQuery.removeEventListener('change', this.handleMotionChange);
    else this.motionQuery?.removeListener?.(this.handleMotionChange);
    this.actors = [];
    this.inspectionStops = this.commonStops = [];
    this.canvas.style.cursor = this.originalCursor;
    this.keys.clear();
    this.path = [];
    this.pending = this.seat = this.selected = this.hovered = this.marker = null;
    this.onInteract = this.onMove = this.onCameraChange = null;
    this.background.width = this.background.height = 0;
  }

  _resetActors() {
    this.actors = this.layout.objects.filter(object => object.type === 'npc').map((object, i) => ({
      object, kind: i < 3 ? 'mentor' : i === 3 ? 'manager' : 'student', home: MENTOR_HOMES[i] || null,
      speed: i < 3 ? 48 + i * 7 : 48, path: [], destination: null, lastTableId: null,
      state: i < 3 ? 'home' : i === 3 ? 'pause' : 'student',
      wait: i < 3 ? 5 + i * 1.5 + randomBetween(0, 1.5) : randomBetween(3, 6),
    }));
    // Cache aisle candidates once per floor. BFS runs only when an actor starts a new route.
    this.inspectionStops = this.layout.objects.filter(object => object.type === 'chair' && !object.occupantId).map(chair => {
      const table = this.layout.tables.find(item => item.id === chair.tableId);
      const cell = nearestOpen(this.blocked, chair.approachX, chair.approachY);
      return { ...cellPoint(cell), faceX: table.x + table.w / 2, faceY: table.y + table.h / 2, tableId: table.id };
    });
    this.commonStops = COMMON_AISLES.map(([x, y]) => cellPoint(nearestOpen(this.blocked, x, y)));
    this.actors.forEach(actor => this._syncActorApproach(actor));
  }

  _actorPaused(actor) {
    return [this.selected, this.pending].some(target => target &&
      (target.id === actor.object.id || target.npcId === actor.object.id));
  }

  _syncActorApproach(actor) {
    const object = actor.object;
    if (actor.kind === 'student') return;
    if (actor.home && object.seated) {
      object.approachX = actor.home.approachX;
      object.approachY = actor.home.approachY;
      return;
    }
    const offsets = { down: [0, 28], up: [0, -28], left: [-28, 0], right: [28, 0] };
    const preferred = offsets[object.direction];
    const candidates = [preferred, [0, 28], [-28, 0], [28, 0], [0, -28]];
    const offset = candidates.find(([dx, dy]) => this._walkable(object.x + dx, object.y + dy)) || [0, 0];
    object.approachX = object.x + offset[0];
    object.approachY = object.y + offset[1];
  }

  _faceActor(object, dx, dy) {
    if (Math.hypot(dx, dy) < 0.01) return;
    object.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }

  _startActorRoute(actor, destination, state) {
    if (!destination) return false;
    const object = actor.object;
    const start = nearestOpen(this.blocked, object.x, object.y);
    const goal = nearestOpen(this.blocked, destination.x, destination.y);
    const points = route(this.blocked, start, goal);
    if (!points) return false;
    const center = cellPoint(start);
    if (Math.hypot(center.x - object.x, center.y - object.y) > 0.01) points.unshift(center);
    actor.path = points;
    actor.destination = destination;
    actor.state = state;
    object.seated = false;
    object.moving = points.length > 0;
    if (!points.length) this._actorArrive(actor);
    return true;
  }

  _actorArrive(actor) {
    const object = actor.object;
    object.moving = false;
    object.step = 0;
    if (actor.state === 'returning') {
      object.x = actor.home.x;
      object.y = actor.home.y;
      object.seated = true;
      object.direction = 'up';
      actor.state = 'home';
      actor.wait = randomBetween(8, 15);
    } else {
      actor.state = actor.kind === 'mentor' ? 'inspect' : 'pause';
      actor.wait = actor.kind === 'mentor' ? randomBetween(2, 5) : randomBetween(3, 7);
      if (actor.destination.faceX !== undefined) {
        this._faceActor(object, actor.destination.faceX - object.x, actor.destination.faceY - object.y);
      }
    }
  }

  _updateActors(dt) {
    this.actors.forEach(actor => {
      const object = actor.object;
      object.moving = false;
      if (actor.kind === 'student' || this._actorPaused(actor)) return;
      if (actor.path.length) {
        let distance = actor.speed * dt;
        while (distance > 0 && actor.path.length) {
          const next = actor.path[0];
          const dx = next.x - object.x;
          const dy = next.y - object.y;
          const length = Math.hypot(dx, dy);
          this._faceActor(object, dx, dy);
          const travel = Math.min(length, distance);
          object.moving ||= travel > 0;
          object.step += travel / 8;
          if (length <= distance) {
            object.x = next.x;
            object.y = next.y;
            actor.path.shift();
          } else {
            object.x += dx / length * travel;
            object.y += dy / length * travel;
          }
          distance -= travel;
        }
        if (!actor.path.length) this._actorArrive(actor);
      } else {
        actor.wait = Math.max(0, actor.wait - dt);
        if (actor.wait === 0) {
          let destination;
          let nextState;
          if (actor.state === 'home') {
            destination = choose(this.inspectionStops.filter(stop => stop.tableId !== actor.lastTableId)) || choose(this.inspectionStops);
            actor.lastTableId = destination?.tableId;
            nextState = 'outbound';
          } else if (actor.state === 'inspect') {
            destination = actor.home;
            nextState = 'returning';
          } else {
            destination = choose(this.commonStops.filter(stop => Math.hypot(stop.x - object.x, stop.y - object.y) > 40));
            nextState = 'roaming';
          }
          if (!this._startActorRoute(actor, destination, nextState)) actor.wait = 2;
        }
      }
      this._syncActorApproach(actor);
    });
  }

  _cameraControlsAllowed() {
    return this.cameraEnabled && this.active && !this.destroyed && !editingOrModal(this.doc);
  }

  _clampCamera() {
    this.cameraX = Math.max(0, Math.min(Math.max(0, WIDTH - this.cameraWidth), this.cameraX));
    this.cameraY = Math.max(0, Math.min(Math.max(0, HEIGHT - this.cameraHeight), this.cameraY));
  }

  _centerCamera() {
    this.cameraX = this.player.x - this.cameraWidth / 2;
    this.cameraY = this.player.y - this.cameraHeight / 2;
    this._clampCamera();
  }

  _fitCamera() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = bounds.width > 0 ? bounds.width : this.viewWidth;
    const height = bounds.height > 0 ? bounds.height : this.viewHeight;
    const centerX = this.cameraX + this.cameraWidth / 2;
    const centerY = this.cameraY + this.cameraHeight / 2;
    const resized = width !== this.viewWidth || height !== this.viewHeight;
    this.viewWidth = width;
    this.viewHeight = height;
    this.scale = Math.max(width / WIDTH, height / HEIGHT) * this.zoom;
    this.cameraWidth = width / this.scale;
    this.cameraHeight = height / this.scale;
    this.dpr = Math.max(1, Math.min(2, Number(this.win.devicePixelRatio) || 1));
    const physicalWidth = Math.max(1, Math.round(width * this.dpr));
    const physicalHeight = Math.max(1, Math.round(height * this.dpr));
    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
    }
    this.ctx.imageSmoothingEnabled = false;
    if (!this.cameraInitialized) {
      this._centerCamera();
      this.cameraInitialized = true;
    } else if (resized) {
      // Resize preserves the viewed center, not the player's current position.
      this.cameraX = centerX - this.cameraWidth / 2;
      this.cameraY = centerY - this.cameraHeight / 2;
    }
    this._clampCamera();
  }

  _zoomTo(value, screenX, screenY) {
    const worldX = this.cameraX + screenX / this.scale;
    const worldY = this.cameraY + screenY / this.scale;
    this.zoom = Math.max(1, Math.min(2.5, value));
    this._fitCamera();
    this.cameraX = worldX - screenX / this.scale;
    this.cameraY = worldY - screenY / this.scale;
    this._clampCamera();
    this._render(this.win.performance.now());
  }

  _emitCamera() {
    const state = this.getCamera();
    if (this.lastCamera && Object.keys(state).every(key => state[key] === this.lastCamera[key])) return;
    this.lastCamera = state;
    this.onCameraChange?.({ ...state });
  }

  _releaseGesture() {
    const gesture = this.gesture;
    this.gesture = null;
    if (gesture && this.canvas.hasPointerCapture?.(gesture.id)) {
      this.canvas.releasePointerCapture(gesture.id);
    }
  }

  _resetCameraInput() {
    this._releaseGesture();
    this.pointerPosition = null;
    this.hovered = null;
    this.canvas.style.cursor = this.originalCursor;
  }

  _trackMouse(event) {
    this.pointerPosition = event.pointerType === 'mouse' ?
      { clientX: event.clientX, clientY: event.clientY, pointerType: 'mouse' } : null;
  }

  _refreshHover() {
    if (!this._cameraControlsAllowed() || !this.pointerPosition || this.gesture) {
      this.hovered = null;
      this.canvas.style.cursor = this.gesture?.dragged ? 'grabbing' : this.originalCursor;
      return;
    }
    const bounds = this.canvas.getBoundingClientRect();
    const { clientX, clientY } = this.pointerPosition;
    if (clientX < bounds.left || clientX > bounds.left + bounds.width ||
      clientY < bounds.top || clientY > bounds.top + bounds.height) {
      this.hovered = null;
      this.canvas.style.cursor = this.originalCursor;
      return;
    }
    this.hovered = this._hit(this._point(this.pointerPosition));
    this.canvas.style.cursor = this.hovered ? 'pointer' : 'crosshair';
  }

  _cameraPointerDown(event) {
    if (!this._cameraControlsAllowed()) return;
    if (this.gesture || event.isPrimary === false) return;
    this._fitCamera();
    this._trackMouse(event);
    const touch = event.pointerType === 'touch';
    const mouseDrag = event.pointerType === 'mouse' &&
      (event.button === 1 || (event.button === 0 && event.shiftKey));
    if ((touch && (event.button === 0 || event.button === undefined)) || mouseDrag) {
      event.preventDefault();
      this.gesture = { id: event.pointerId, type: event.pointerType,
        startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, dragged: false };
      // Synthetic events or a disconnected canvas may not have an active pointer.
      try { this.canvas.setPointerCapture?.(event.pointerId); } catch { /* No active pointer to capture. */ }
      this._refreshHover();
      return;
    }
    this._pointer(event);
  }

  _cameraPointerMove(event) {
    if (!this._cameraControlsAllowed()) {
      this._resetCameraInput();
      return;
    }
    const gesture = this.gesture;
    if (gesture && event.pointerId !== gesture.id) return;
    this._trackMouse(event);
    if (gesture) {
      const dragged = gesture.dragged;
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 8) gesture.dragged = true;
      if (gesture.dragged) {
        event.preventDefault();
        const previousX = dragged ? gesture.lastX : gesture.startX;
        const previousY = dragged ? gesture.lastY : gesture.startY;
        this.panCamera((previousX - event.clientX) / this.scale, (previousY - event.clientY) / this.scale);
      }
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
    }
    this._refreshHover();
  }

  _cameraPointerEnd(event, cancelled = false) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!cancelled && this._cameraControlsAllowed()) this._cameraPointerMove(event);
    const tap = !cancelled && !gesture.dragged && gesture.type === 'touch' && this._cameraControlsAllowed();
    this._releaseGesture();
    if (cancelled || gesture.type === 'touch') this.pointerPosition = null;
    if (tap) this._pointer(event);
    this._refreshHover();
    if (!this.destroyed) this._render(this.win.performance.now());
  }

  _wheel(event) {
    if (!this._cameraControlsAllowed()) return;
    event.preventDefault();
    this._fitCamera();
    const bounds = this.canvas.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewHeight : 1;
    const delta = Number(event.deltaY) * units;
    if (!Number.isFinite(delta)) return;
    this._zoomTo(this.zoom * Math.exp(-delta * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top);
  }

  _updateCamera(dt) {
    if (!this._cameraControlsAllowed()) {
      this._resetCameraInput();
      return;
    }
    if (!this.pointerPosition || this.gesture) return;
    const bounds = this.canvas.getBoundingClientRect();
    const x = this.pointerPosition.clientX - bounds.left;
    const y = this.pointerPosition.clientY - bounds.top;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;
    const edgeVelocity = (position, size) => {
      const edge = Math.min(64, size / 2);
      if (edge <= 0) return 0;
      return position < edge ? -(edge - position) / edge :
        position > size - edge ? (position - size + edge) / edge : 0;
    };
    // Edge velocity is measured in screen pixels/second, independent of zoom.
    this.cameraX += edgeVelocity(x, bounds.width) * 520 * dt / this.scale;
    this.cameraY += edgeVelocity(y, bounds.height) * 520 * dt / this.scale;
    this._clampCamera();
  }

  _point(event) {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    if (this.cameraEnabled) {
      return { x: this.cameraX + (event.clientX - bounds.left) / this.scale,
        y: this.cameraY + (event.clientY - bounds.top) / this.scale };
    }
    return { x: (event.clientX - bounds.left) * WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * HEIGHT / bounds.height };
  }

  _hit(point) {
    if (!point) return null;
    // Chairs win over large desk/cubicle hit areas, so every seat remains selectable.
    for (const type of ['chair', 'beanbag', 'npc', 'mentor', 'water', 'stairs', 'restroom']) {
      const found = this.layout.objects.find(object => {
        if (object.type !== type || (type === 'chair' && object.occupantId)) return false;
        const top = type === 'npc' ? object.y - object.h : object.y - object.h / 2;
        return Math.abs(point.x - object.x) <= object.w / 2 + 3 &&
          point.y >= top - 3 && point.y <= top + object.h + 3;
      });
      if (found) return found;
    }
    return null;
  }

  _pointer(event) {
    if (!this.active || this.destroyed || (event.button !== undefined && event.button !== 0) || editingOrModal(this.doc)) return;
    const point = this._point(event);
    if (!point) return;
    const object = this._hit(point);
    if (object) {
      this.selected = object;
      this._render(this.win.performance.now());
      // Hand out a copy: consumer changes cannot corrupt collision/layout data.
      this.onInteract?.({ ...object, ...(object.profile ? { profile: { ...object.profile } } : {}) });
      return;
    }
    if (point.x < 21 || point.x > WIDTH - 21 || point.y < 25 || point.y > HEIGHT - 21 ||
      this.layout.obstacles.some(o => point.x >= o.x && point.x <= o.x + o.w && point.y >= o.y && point.y <= o.y + o.h)) return;
    this.stand();
    this.keys.clear();
    const goal = nearestOpen(this.blocked, point.x, point.y);
    const points = this._routeTo(goal);
    if (!points) return;
    this.path = points;
    this.pending = this.selected = null;
    this.marker = { ...cellPoint(goal), time: this.win.performance.now() };
  }

  _hover(event) {
    if (!this.active || this.destroyed || editingOrModal(this.doc)) {
      this.handleLeave();
      return;
    }
    this.pointerPosition = { clientX: event.clientX, clientY: event.clientY };
    this.hovered = this._hit(this._point(event));
    this.canvas.style.cursor = this.hovered ? 'pointer' : 'crosshair';
  }

  _routeTo(goal) {
    const start = nearestOpen(this.blocked, this.player.x, this.player.y);
    const points = route(this.blocked, start, goal);
    if (!points) return null;
    const center = cellPoint(start);
    // Center the starting cell first; otherwise a turn could clip a desk corner.
    if (Math.hypot(center.x - this.player.x, center.y - this.player.y) > 0.5) points.unshift(center);
    return points;
  }

  _walkable(x, y) {
    if (x < 25 || x > WIDTH - 25 || y < 29 || y > HEIGHT - 25) return false;
    return !this.blocked[cellAt(x, y)] && !this.layout.obstacles.some(o =>
      x > o.x - PLAYER_RADIUS && x < o.x + o.w + PLAYER_RADIUS &&
      y > o.y - PLAYER_RADIUS && y < o.y + o.h + PLAYER_RADIUS);
  }

  _face(dx, dy) {
    this.player.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }

  _update(dt, time) {
    if (editingOrModal(this.doc)) {
      this.keys.clear();
      this.player.moving = false;
      this.actors.forEach(actor => { actor.object.moving = false; });
      return;
    }
    this.ambientTime += dt * 1000;
    this._updateActors(dt);
    const beforeX = this.player.x;
    const beforeY = this.player.y;
    let dx = 0;
    let dy = 0;
    this.keys.forEach(key => { dx += KEY_DIRECTIONS[key][0]; dy += KEY_DIRECTIONS[key][1]; });
    if ((dx || dy) && !this.player.seated) {
      const length = Math.hypot(dx, dy);
      dx /= length; dy /= length;
      this._face(dx, dy);
      // Small substeps prevent tunneling through narrow partitions at low FPS.
      const steps = Math.max(1, Math.ceil(SPEED * dt / 3));
      for (let i = 0; i < steps; i++) {
        const nx = this.player.x + dx * SPEED * dt / steps;
        if (this._walkable(nx, this.player.y)) this.player.x = nx;
        const ny = this.player.y + dy * SPEED * dt / steps;
        if (this._walkable(this.player.x, ny)) this.player.y = ny;
      }
    } else if (this.path.length && !this.player.seated) {
      let distance = SPEED * dt;
      while (distance > 0 && this.path.length) {
        const next = this.path[0];
        const vx = next.x - this.player.x;
        const vy = next.y - this.player.y;
        const length = Math.hypot(vx, vy);
        if (length > 0.01) this._face(vx, vy);
        if (length <= distance) {
          this.player.x = next.x;
          this.player.y = next.y;
          distance -= length;
          this.path.shift();
        } else {
          this.player.x += vx / length * distance;
          this.player.y += vy / length * distance;
          distance = 0;
        }
      }
      if (!this.path.length) this._arrive();
    }
    const walked = Math.hypot(this.player.x - beforeX, this.player.y - beforeY);
    this.player.moving = walked > 0 && !this.player.seated;
    if (walked) this.player.step += walked / 8;
    if (this.marker && time - this.marker.time > 1700) this.marker = null;
    this._emitMove();
  }

  _arrive() {
    const target = this.pending;
    this.pending = null;
    this.marker = null;
    if (!target) return;
    if (target.type === 'chair' || target.type === 'beanbag') {
      if (target.occupantId) return;
      this.seat = target;
      this.player.x = target.x;
      this.player.y = target.y + 6;
      this.player.seated = true;
      this.player.tableId = target.tableId ?? null;
      this.player.direction = target.facing || 'down';
      this.player.step = 0;
    } else if (target.type === 'stairs') {
      this.setFloor(target.targetFloor);
      return;
    } else {
      const conversationTarget = target.npcId ? this.layout.objects.find(item => item.id === target.npcId) : target;
      this._face(conversationTarget.x - this.player.x, conversationTarget.y - this.player.y);
    }
    this._emitMove();
  }

  _emitMove() {
    const state = { x: Math.round(this.player.x * 100) / 100, y: Math.round(this.player.y * 100) / 100,
      seated: this.player.seated, tableId: this.player.tableId };
    if (this.lastMove && Object.keys(state).every(key => state[key] === this.lastMove[key])) return;
    this.lastMove = state;
    this.onMove?.({ ...state });
  }

  _render(time) {
    if (this.destroyed) return;
    const ctx = this.ctx;
    if (this.cameraEnabled) {
      this._fitCamera();
      this._refreshHover();
      // Clear the physical viewport before applying the world-to-screen camera transform.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const scale = this.dpr * this.scale;
      ctx.setTransform(scale, 0, 0, scale, -this.cameraX * scale, -this.cameraY * scale);
    } else {
      this.dpr = fitCanvas(this.canvas, ctx, this.win.devicePixelRatio);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.drawImage(this.background, 0, 0, WIDTH, HEIGHT);
    drawPlants(ctx, this.ambientTime, this.reducedMotion);
    if (!this.cameraEnabled && this.pointerPosition && this.active && !editingOrModal(this.doc)) {
      this.hovered = this._hit(this._point(this.pointerPosition));
    }
    if (this.path.length > 1) {
      ctx.fillStyle = '#52988b55';
      this.path.forEach((point, i) => { if (i % 4 === 0) ctx.fillRect(point.x - 1, point.y - 1, 3, 3); });
    }
    if (this.marker) {
      const size = 9 + Math.round(Math.sin(time / 130) * 2);
      rect(ctx, this.marker.x - size, this.marker.y, size * 2, 2, '#b1945f');
      rect(ctx, this.marker.x, this.marker.y - size, 2, size * 2, '#b1945f');
    }
    drawSelection(ctx, this.selected, this.reducedMotion ? 0 : time);
    if (this.hovered?.id !== this.selected?.id) drawSelection(ctx, this.hovered, time, true);
    const people = this.layout.objects.filter(object => object.type === 'npc').map(object => ({ ...object, player: false }));
    people.push({ ...this.player, profile: this.profile, player: true, idleType: 'player', idlePhase: 337 });
    people.sort((a, b) => a.y - b.y).forEach(person => {
      drawSprite(ctx, person.x, person.y, person.profile, {
        ...person, time: this.ambientTime, reducedMotion: this.reducedMotion, moving: Boolean(person.moving && this.active),
      });
      drawName(ctx, person.profile.name, person.x, person.y, person.player);
    });
    if (this.hovered) {
      const label = this.hovered.label;
      const x = Math.max(125, Math.min(WIDTH - 125, this.hovered.x));
      const y = Math.min(HEIGHT - 35, this.hovered.y + (this.hovered.type === 'npc' ? 23 : this.hovered.h / 2 + 20));
      ctx.font = '10px monospace';
      const width = Math.min(330, ctx.measureText(label).width + 20);
      roundedPixel(ctx, x - width / 2, y - 11, width, 22, '#284e56ed');
      text(ctx, label, x, y, 10, '#fff2d7');
    }
    if (this.cameraEnabled) this._emitCamera();
  }
}

/** Static landing illustration: no controller, listeners, animation, or cleanup. */
export function drawPreview(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('drawPreview requires a canvas.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas context is required.');
  const win = canvas.ownerDocument?.defaultView;
  fitCanvas(canvas, ctx, win?.devicePixelRatio || 1);
  const layout = makeLayout(1);
  drawStatic(ctx, layout);
  const npc = layout.objects.filter(object => object.type === 'npc');
  const students = [
    { x: 132, y: 94, profile: { skin: '#a06b48', hair: '#342c30', shirt: '#be8c68', wearId: 'glasses' }, direction: 'down' },
    { x: 241, y: 180, profile: { skin: '#704a36', hair: '#272830', shirt: '#788ead' }, direction: 'up' },
    { x: 460, y: 217, profile: { skin: '#c08b64', hair: '#483632', shirt: '#a57591' }, direction: 'down' },
    { x: 682, y: 195, profile: { skin: '#976747', hair: '#292a30', shirt: '#6a9990', wearId: 'headphones' }, direction: 'right' },
    { x: 973, y: 418, profile: { skin: '#b98056', hair: '#332c31', shirt: '#ab9270' }, direction: 'down' },
  ];
  const people = [...npc.map(object => ({ ...object, profile: object.profile })), ...students.map(person => ({ ...person, seated: true }))];
  people.sort((a, b) => a.y - b.y).forEach(person => drawSprite(ctx, person.x, person.y, person.profile, { ...person, reducedMotion: true }));
  drawSprite(ctx, 657, 607, { skin: '#986a49', hair: '#292a32', shirt: '#508f8b', wearId: 'backpack' }, { direction: 'up', reducedMotion: true });
  drawName(ctx, 'Your next chapter starts here', 657, 607, true);
}
