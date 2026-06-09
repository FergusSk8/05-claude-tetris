'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#5b8dd9', // J - blue
  '#ffb74d', // L - orange
  '#90a4ae', // Tuerca - gris acero
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const HS_KEY = 'tetris-highscores';
const MAX_SCORES = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');

const startBox = document.querySelector('.overlay-start');
const startScoresCont = document.getElementById('start-scores-container');
const startBtn = document.getElementById('start-btn');
const startResetBtn = document.getElementById('start-reset-btn');

const gameoverBox = document.querySelector('.overlay-gameover');
const goScoreEl = document.getElementById('go-score');
const goNameBlock = document.getElementById('go-name-block');
const goNameInput = document.getElementById('go-name-input');
const goSaveBtn = document.getElementById('go-save-btn');
const goScoresCont = document.getElementById('go-scores-container');
const goResetBtn = document.getElementById('go-reset-btn');
const goNewBtn = document.getElementById('go-new-btn');

const pauseBox = document.querySelector('.overlay-pause');
const resumeBtn = document.getElementById('resume-btn');

let board, current, next, hold, holdUsed;
let score, lines, level, combo, maxCombo, maxLines;
let paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let scoreSaved;

// ---- High-scores helpers ----

function loadScores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

function saveScores(scores) {
  localStorage.setItem(HS_KEY, JSON.stringify(scores));
}

function qualifies(s) {
  const scores = loadScores();
  return scores.length < MAX_SCORES || s >= scores[scores.length - 1].score;
}

function addScore(name, s, l, mc, ml) {
  const scores = loadScores();
  scores.push({ name: name.trim() || 'Anónimo', score: s, lines: l, maxCombo: mc, maxLines: ml });
  scores.sort((a, b) => b.score - a.score);
  scores.splice(MAX_SCORES);
  saveScores(scores);
  return scores;
}

function buildScoresTable(scores, highlightIdx) {
  if (!scores.length) {
    const p = document.createElement('p');
    p.className = 'no-records';
    p.textContent = 'Sin records aún';
    return p;
  }
  const table = document.createElement('table');
  table.className = 'scores-table';
  const header = table.insertRow();
  ['#', 'Nombre', 'Puntos', 'Líneas', 'Combo', 'Max'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    header.appendChild(th);
  });
  scores.forEach((r, i) => {
    const row = table.insertRow();
    if (i === highlightIdx) row.classList.add('highlight-row');
    [i + 1, r.name, r.score.toLocaleString(), r.lines, r.maxCombo, r.maxLines].forEach(v => {
      const td = row.insertCell();
      td.textContent = v;
    });
  });
  return table;
}

function renderScores(container, highlightIdx) {
  container.innerHTML = '';
  container.appendChild(buildScoresTable(loadScores(), highlightIdx));
}

// ---- Overlay helpers ----

function showOverlay(box) {
  [startBox, gameoverBox, pauseBox].forEach(b => b.classList.add('hidden'));
  box.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  [startBox, gameoverBox, pauseBox].forEach(b => b.classList.add('hidden'));
}

function showStartScreen() {
  renderScores(startScoresCont, -1);
  showOverlay(startBox);
}

// ---- Board helpers ----

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 8) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (cleared > maxLines) maxLines = cleared;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    score += combo * 50 * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const prevCombo = combo;
  clearLines();
  if (combo === prevCombo) {
    combo = 0;
    updateHUD();
  }
  spawn();
}

function spawn() {
  holdUsed = false;
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  const NB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (hold === null) return;
  const shape = PIECES[hold].map(row => [...row]);
  const alpha = holdUsed ? 0.3 : 1;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB, shape[r][c] ? alpha : 0);
}

function holdPiece() {
  if (holdUsed) return;
  const currentType = current.type;
  if (hold === null) {
    hold = currentType;
    spawn();
  } else {
    current = makePiece(hold);
    hold = currentType;
  }
  holdUsed = true;
  drawHold();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  scoreSaved = false;
  goScoreEl.textContent = `Puntuación: ${score.toLocaleString()} | Líneas: ${lines} | Combo máx: ${maxCombo}`;
  goNameBlock.classList.add('hidden');
  goScoresCont.classList.add('hidden');
  goNameInput.value = '';

  if (qualifies(score)) {
    goNameBlock.classList.remove('hidden');
  } else {
    renderScores(goScoresCont, -1);
    goScoresCont.classList.remove('hidden');
  }

  showOverlay(gameoverBox);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    hideOverlay();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay(pauseBox);
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  maxLines = 0;
  scoreSaved = false;
  paused = false;
  gameOver = false;
  hold = null;
  holdUsed = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  drawHold();
  hideOverlay();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Event listeners ----

startBtn.addEventListener('click', init);

startResetBtn.addEventListener('click', () => {
  localStorage.removeItem(HS_KEY);
  renderScores(startScoresCont, -1);
});

goSaveBtn.addEventListener('click', () => {
  const name = goNameInput.value.trim() || 'Anónimo';
  const updated = addScore(name, score, lines, maxCombo, maxLines);
  scoreSaved = true;
  const idx = updated.findIndex(r => r.name === name && r.score === score);
  goNameBlock.classList.add('hidden');
  renderScores(goScoresCont, idx);
  goScoresCont.classList.remove('hidden');
});

goResetBtn.addEventListener('click', () => {
  localStorage.removeItem(HS_KEY);
  scoreSaved = false;
  goNameBlock.classList.add('hidden');
  renderScores(goScoresCont, -1);
  goScoresCont.classList.remove('hidden');
  if (qualifies(score)) {
    goNameBlock.classList.remove('hidden');
  }
});

goNewBtn.addEventListener('click', () => {
  showStartScreen();
});

resumeBtn.addEventListener('click', () => {
  togglePause();
});

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.getElementById('theme-toggle').addEventListener('change', e => {
  document.body.classList.toggle('theme-light', e.target.checked);
});

showStartScreen();
