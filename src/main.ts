import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main class="game-shell">
    <canvas id="game" aria-label="Territory strategy game"></canvas>
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">T</div>
        <span>TERITORIAL</span>
      </div>
      <div class="match-stats">
        <div><span class="dot player-dot"></span><strong id="playerLand">0%</strong><small>Land</small></div>
        <div><strong id="population">0</strong><small>Population</small></div>
        <div><strong id="timer">0:00</strong><small>Time</small></div>
      </div>
    </header>
    <aside class="leaderboard">
      <div class="panel-title">Leaderboard</div>
      <div id="leaderRows"></div>
    </aside>
    <div class="mode-pill" id="modePill"><span></span> Click or drag to attack</div>
    <div class="action-bar">
      <button id="attackMode" class="action active" title="Attack">
        <svg viewBox="0 0 24 24"><path d="M15 3h6v6M21 3l-7.5 7.5M9 21H3v-6M3 21l7.5-7.5"/></svg>
      </button>
      <button id="defendMode" class="action" title="Defend">
        <svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3z"/></svg>
      </button>
      <button id="pauseButton" class="action" title="Pause">
        <svg class="pause-icon" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>
      </button>
      <button id="restartButton" class="action" title="Restart">
        <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></svg>
      </button>
    </div>
    <div class="army-panel">
      <div class="army-icon">
        <svg viewBox="0 0 24 24"><path d="M12 3l2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2L12 3z"/></svg>
      </div>
      <div><strong id="armyCount">0</strong><small>Your army</small></div>
    </div>
    <div id="toast" class="toast"></div>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;

const COLS = 90;
const ROWS = 56;
const COLORS = ['#4d96ff', '#ff5d68', '#ffc857', '#55b86a', '#a86de0', '#f58a45'];
const NAMES = ['You', 'Nova', 'Atlas', 'Coral', 'Violet', 'Amber'];

let owner = new Int8Array(COLS * ROWS);
let army = new Float32Array(COLS * ROWS);
let land = new Uint8Array(COLS * ROWS);
let selected = -1;
let hovered = -1;
let dragStart = -1;
let dragFrom: { x: number; y: number } | null = null;
let paused = false;
let elapsed = 0;
let lastTime = performance.now();
let lastGrowth = 0;
let lastAi = 0;
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;

function index(x: number, y: number): number {
  return y * COLS + x;
}

function pseudoRandom(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function createWorld(): void {
  owner.fill(-1);
  army.fill(0);
  land.fill(0);
  selected = -1;
  elapsed = 0;

  const blobs = [
    [0.50, 0.50, 0.24],
    [0.28, 0.34, 0.17],
    [0.73, 0.34, 0.16],
    [0.24, 0.69, 0.12],
    [0.71, 0.70, 0.13],
  ];

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const nx = x / (COLS - 1);
      const ny = y / (ROWS - 1);
      let score = 0;
      for (const [bx, by, br] of blobs) {
        const dx = nx - bx!;
        const dy = (ny - by!) * 1.12;
        const d = Math.sqrt(dx * dx + dy * dy);
        score = Math.max(score, br! - d);
      }
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
      const noise = (pseudoRandom(x, y) - 0.5) * 0.11;
      if (edge > 0.025 && score + noise > 0.005) land[index(x, y)] = 1;
    }
  }

  const seeds: Array<[number, number]> = [
    [COLS * 0.50, ROWS * 0.50],
    [COLS * 0.20, ROWS * 0.27],
    [COLS * 0.78, ROWS * 0.28],
    [COLS * 0.16, ROWS * 0.72],
    [COLS * 0.78, ROWS * 0.72],
  ];

  seeds.forEach(([sx, sy], i) => {
    let cx = Math.round(sx);
    let cy = Math.round(sy);
    while (land[index(cx, cy)] === 0) {
      cx = Math.max(2, Math.min(COLS - 3, cx + Math.round(Math.random() * 8 - 4)));
      cy = Math.max(2, Math.min(ROWS - 3, cy + Math.round(Math.random() * 8 - 4)));
    }
    owner[index(cx, cy)] = i;
    army[index(cx, cy)] = i === 0 ? 80 : 35;

    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      for (let r = 1; r < 4; r++) {
        const x = Math.round(cx + Math.cos(angle) * r);
        const y = Math.round(cy + Math.sin(angle) * r);
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
          const id = index(x, y);
          if (land[id]) {
            owner[id] = i;
            army[id] = i === 0 ? 30 : 18;
          }
        }
      }
    }
  });

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = index(x, y);
      if (land[id] && owner[id] === -1) army[id] = 8 + Math.floor(pseudoRandom(x + 40, y + 12) * 24);
    }
  }
  updateHud();
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewScale = Math.max(rect.width / COLS, rect.height / ROWS);
  viewOffsetX = (rect.width - COLS * viewScale) / 2;
  viewOffsetY = (rect.height - ROWS * viewScale) / 2;
}

function canvasPoint(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function cellFromPoint(point: { x: number; y: number }): number {
  const x = Math.floor((point.x - viewOffsetX) / viewScale);
  const y = Math.floor((point.y - viewOffsetY) / viewScale);
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return -1;
  const id = index(x, y);
  return land[id] ? id : -1;
}

function neighbors(id: number): number[] {
  const x = id % COLS;
  const y = Math.floor(id / COLS);
  const result: number[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx!;
    const ny = y + dy!;
    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
      const nid = index(nx, ny);
      if (land[nid]) result.push(nid);
    }
  }
  return result;
}

function attack(from: number, to: number, fraction = 0.5): void {
  if (from < 0 || to < 0 || owner[from] === -1) return;
  if (!neighbors(from).includes(to)) return;
  const attackingOwner = owner[from];
  const amount = Math.floor(army[from] * fraction);
  if (amount < 1) return;

  if (owner[to] === attackingOwner) {
    army[from] -= amount;
    army[to] += amount;
    return;
  }

  army[from] -= amount;
  if (amount > army[to]) {
    army[to] = amount - army[to];
    owner[to] = attackingOwner;
  } else {
    army[to] -= amount;
  }
  updateHud();
}

function runGrowth(): void {
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] >= 0) {
      army[i] += owner[i] === 0 ? 0.75 : 0.55;
      if (army[i] > 999) army[i] = 999;
    }
  }
}

function runAi(): void {
  for (let bot = 1; bot < 5; bot++) {
    let source = -1;
    let target = -1;
    let best = -1;
    for (let i = 0; i < owner.length; i++) {
      if (owner[i] !== bot || army[i] < 15) continue;
      for (const nid of neighbors(i)) {
        if (owner[nid] === bot) continue;
        const risk = owner[nid] === -1 ? army[nid] : army[nid] * 1.15;
        const score = army[i] - risk + pseudoRandom(i, bot) * 8;
        if (score > best) {
          best = score;
          source = i;
          target = nid;
        }
      }
    }
    if (source >= 0 && target >= 0 && best > 4) attack(source, target, 0.45);
  }
}

function draw(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#79b7d5';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#a8d09e';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = index(x, y);
      if (!land[id]) continue;
      const px = viewOffsetX + x * viewScale;
      const py = viewOffsetY + y * viewScale;
      const o = owner[id];
      ctx.fillStyle = o >= 0 ? COLORS[o] : '#ece0bd';
      ctx.fillRect(px - 0.45, py - 0.45, viewScale + 0.9, viewScale + 0.9);
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = index(x, y);
      if (!land[id]) continue;
      const px = viewOffsetX + x * viewScale;
      const py = viewOffsetY + y * viewScale;
      ctx.moveTo(px, py);
      ctx.lineTo(px + viewScale, py);
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + viewScale);
    }
  }
  ctx.stroke();

  ctx.font = `700 ${Math.max(8, viewScale * 0.72)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = index(x, y);
      if (!land[id] || army[id] < 12) continue;
      const px = viewOffsetX + (x + 0.5) * viewScale;
      const py = viewOffsetY + (y + 0.5) * viewScale;
      ctx.fillText(Math.floor(army[id]).toString(), px, py);
    }
  }
  ctx.shadowColor = 'transparent';

  if (selected >= 0) {
    const x = selected % COLS;
    const y = Math.floor(selected / COLS);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(viewOffsetX + x * viewScale - 1, viewOffsetY + y * viewScale - 1, viewScale + 2, viewScale + 2);
  }

  if (dragStart >= 0 && dragFrom) {
    const sx = dragStart % COLS;
    const sy = Math.floor(dragStart / COLS);
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(viewOffsetX + (sx + 0.5) * viewScale, viewOffsetY + (sy + 0.5) * viewScale);
    ctx.lineTo(dragFrom.x, dragFrom.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function updateHud(): void {
  const counts = new Float64Array(6);
  const armies = new Float64Array(6);
  let landCount = 0;
  for (let i = 0; i < owner.length; i++) {
    if (!land[i]) continue;
    landCount++;
    if (owner[i] >= 0) {
      counts[owner[i]]++;
      armies[owner[i]] += army[i];
    }
  }
  const rows = [...NAMES.keys()].map(i => ({
    i,
    land: counts[i],
    army: armies[i],
  })).sort((a, b) => b.land - a.land);

  document.querySelector('#leaderRows')!.innerHTML = rows.map((row, rank) => `
    <div class="leader-row ${row.i === 0 ? 'you' : ''}">
      <span class="rank">${rank + 1}</span>
      <span class="nation-dot" style="background:${COLORS[row.i]}"></span>
      <span class="nation-name">${NAMES[row.i]}</span>
      <strong>${Math.floor(row.land)} <small>cells</small></strong>
    </div>
  `).join('');

  document.querySelector('#playerLand')!.textContent = `${Math.round((counts[0] / landCount) * 100)}%`;
  document.querySelector('#population')!.textContent = Math.floor(armies[0]).toLocaleString();
  document.querySelector('#armyCount')!.textContent = Math.floor(armies[0]).toLocaleString();

  if (counts[0] === 0) showToast('Your nation has fallen');
  if (counts[0] === landCount) showToast('Victory!');
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>('#toast')!;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function loop(now: number): void {
  const dt = now - lastTime;
  lastTime = now;
  if (!paused) {
    elapsed += dt;
    if (now - lastGrowth > 900) {
      runGrowth();
      lastGrowth = now;
      updateHud();
    }
    if (now - lastAi > 1700) {
      runAi();
      lastAi = now;
      updateHud();
    }
  }
  const seconds = Math.floor(elapsed / 1000);
  document.querySelector('#timer')!.textContent =
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  draw();
  requestAnimationFrame(loop);
}

canvas.addEventListener('pointerdown', event => {
  const point = canvasPoint(event);
  const id = cellFromPoint(point);
  if (id >= 0 && owner[id] === 0) {
    selected = id;
    dragStart = id;
    dragFrom = point;
    canvas.setPointerCapture(event.pointerId);
  }
});

canvas.addEventListener('pointermove', event => {
  const point = canvasPoint(event);
  hovered = cellFromPoint(point);
  if (dragStart >= 0) dragFrom = point;
});

canvas.addEventListener('pointerup', event => {
  if (dragStart >= 0) {
    const target = cellFromPoint(canvasPoint(event));
    if (target >= 0) attack(dragStart, target);
  }
  dragStart = -1;
  dragFrom = null;
});

canvas.addEventListener('pointerleave', () => {
  if (dragStart < 0) hovered = -1;
});

document.querySelector('#pauseButton')!.addEventListener('click', () => {
  paused = !paused;
  document.querySelector('#pauseButton')!.classList.toggle('active', paused);
  showToast(paused ? 'Paused' : 'Resumed');
});

document.querySelector('#restartButton')!.addEventListener('click', () => {
  createWorld();
  paused = false;
  document.querySelector('#pauseButton')!.classList.remove('active');
  showToast('New match');
});

document.querySelector('#defendMode')!.addEventListener('click', () => {
  document.querySelector('#defendMode')!.classList.toggle('active');
  document.querySelector('#attackMode')!.classList.remove('active');
  showToast('Defend mode');
});

document.querySelector('#attackMode')!.addEventListener('click', () => {
  document.querySelector('#attackMode')!.classList.toggle('active');
  document.querySelector('#defendMode')!.classList.remove('active');
});

window.addEventListener('resize', resize);
createWorld();
resize();
requestAnimationFrame(loop);
