// Boot and the frame loop. One canvas, a fixed 60 Hz simulation stepped
// from an accumulator (frame time clamped, so a slow tab slows the game
// instead of teleporting it), and the renderer drawn after each batch of
// steps. With ?shot=<name> in the URL it stages that screenshot scene
// instead of starting the title screen, and flags when the frame is ready.

import { STEP } from './config.js';
import { createGame, stepGame } from './game.js';
import { buildStaticLayer, drawScene } from './render.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : (Date.now() % 90000) + 7;

const game = createGame(seed);
const staticLayer = buildStaticLayer(game.city);
const audio = createAudio();
const input = createInput(canvas);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  game.view.w = canvas.width;
  game.view.h = canvas.height;
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', () => audio.unlock(), { once: true });
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// Exposed for the play-test harness and the curious.
window.__viceHeat = { game, stepGame };

const shotName = params.get('shot');
if (shotName) {
  stageShot(shotName, game, audio);
  drawScene(ctx, game, staticLayer);
  requestAnimationFrame(() => {
    drawScene(ctx, game, staticLayer);
    window.__shotReady = true;
  });
} else {
  let last = performance.now();
  let accumulator = 0;
  let statusTick = 0;
  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += elapsed;
    const frameInput = input.sample();
    let first = true;
    while (accumulator >= STEP) {
      const stepInput = first
        ? frameInput
        : { ...frameInput, enter: false, start: false, pause: false, help: false, mute: false, clicked: false, restart: false };
      stepGame(game, stepInput, audio);
      first = false;
      accumulator -= STEP;
    }
    drawScene(ctx, game, staticLayer);
    statusTick += 1;
    if (status !== null && statusTick % 45 === 0) {
      status.textContent = game.screen === 'title'
        ? 'Vice Heat title screen. Press Enter to play.'
        : `${game.missions.objectiveText()}. Cash $${Math.round(game.player.cash)}. Wanted level ${Math.ceil(game.wanted)}.`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
