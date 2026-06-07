# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open `index.html` directly or serve with any static server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`.

## Architecture

Single-page vanilla JS game — three files, no framework, no bundler.

- `index.html` — DOM structure: two `<canvas>` elements (`#board` 300×600, `#next-canvas` 120×120), HUD panel, and `#overlay` for pause/game-over states.
- `style.css` — dark/retro aesthetic; overlay uses `backdrop-filter`.
- `game.js` — all game logic (~300 lines, `'use strict'`).

### game.js internals

**State**: module-level `let` variables — `board` (2D array, 0 = empty, 1–7 = piece color index), `current`/`next` (piece objects with `{ type, shape, x, y }`), and timing/score vars.

**Game loop**: `requestAnimationFrame`-based `loop(ts)` accumulates delta time into `dropAccum`; when it exceeds `dropInterval` the piece drops one row or locks.

**Key functions**:
- `collide(shape, ox, oy)` — bounds + overlap check against `board`
- `rotateCW(shape)` — transpose + reverse for clockwise rotation
- `tryRotate()` — attempts rotation with wall kicks `[0, -1, 1, -2, 2]`
- `ghostY()` — projects landing row for ghost piece rendering
- `clearLines()` — scans bottom-up, splices full rows, recalculates level and `dropInterval`
- `lockPiece()` → `merge()` → `clearLines()` → `spawn()`
- `init()` — full reset, called on load and restart

**Speed formula**: `dropInterval = max(100, 1000 − (level − 1) × 90)` ms; level increments every 10 lines.

**Canvas dimensions must match constants**: if `COLS`, `ROWS`, or `BLOCK` change, update `width`/`height` on `<canvas id="board">` in `index.html` accordingly (`COLS × BLOCK` and `ROWS × BLOCK`).
