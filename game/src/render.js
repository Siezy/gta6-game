// Everything the player sees: the pre-rendered city, cars and pedestrians,
// effects, the HUD with its minimap, and the title / pause / busted / wasted
// screens. The city is painted once onto an offscreen canvas (it never
// changes); each frame blits the camera's slice of it and draws the moving
// world on top.

import { WORLD } from './config.js';
import {
  SCREEN_BUSTED, SCREEN_HELP, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
} from './game.js';
import { clamp, distance, makeRng } from './random.js';

function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function text(ctx, value, x, y, font, color, align = 'left', outline = 0) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline > 0) {
    ctx.lineWidth = outline;
    ctx.strokeStyle = 'rgba(10,8,18,0.85)';
    ctx.strokeText(value, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

/** Paint the whole city once: ground, roads, buildings, park, beach, sea. */
export function buildStaticLayer(city) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;
  const ctx = canvas.getContext('2d');

  // Ground: warm pavement everywhere the roads and buildings sit on.
  ctx.fillStyle = '#77705f';
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // The sea and the beach.
  const sea = ctx.createLinearGradient(WORLD.waterX, 0, WORLD.width, 0);
  sea.addColorStop(0, '#2ec4b6');
  sea.addColorStop(1, '#1266a0');
  ctx.fillStyle = sea;
  ctx.fillRect(WORLD.waterX, 0, WORLD.width - WORLD.waterX, WORLD.height);
  ctx.fillStyle = '#eed9a4';
  ctx.fillRect(WORLD.beachX, 0, WORLD.waterX - WORLD.beachX, WORLD.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  const foam = makeRng(99);
  for (let y = 30; y < WORLD.height; y += 46) {
    ctx.beginPath();
    ctx.arc(WORLD.waterX + 16 + foam.range(-6, 22), y, foam.range(10, 22), 0.4, Math.PI - 0.4);
    ctx.stroke();
  }

  // Parks.
  for (const park of city.parks) {
    ctx.fillStyle = '#5da464';
    ctx.fillRect(park.x - 8, park.y - 8, park.w + 16, park.h + 16);
    ctx.fillStyle = '#6fb877';
    ctx.fillRect(park.x + 10, park.y + 10, park.w - 20, park.h - 20);
  }

  // Roads: asphalt, edge lines, dashed centres, crosswalks at crossings.
  const half = WORLD.roadWidth / 2;
  ctx.fillStyle = '#37353f';
  for (const x of WORLD.roadsX) ctx.fillRect(x - half, 0, WORLD.roadWidth, WORLD.height);
  for (const y of WORLD.roadsY) ctx.fillRect(0, y - half, WORLD.beachX + 40, WORLD.roadWidth);
  ctx.strokeStyle = 'rgba(240,235,220,0.5)';
  ctx.lineWidth = 3;
  for (const x of WORLD.roadsX) {
    ctx.beginPath(); ctx.moveTo(x - half + 4, 0); ctx.lineTo(x - half + 4, WORLD.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + half - 4, 0); ctx.lineTo(x + half - 4, WORLD.height); ctx.stroke();
  }
  for (const y of WORLD.roadsY) {
    ctx.beginPath(); ctx.moveTo(0, y - half + 4); ctx.lineTo(WORLD.beachX + 40, y - half + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y + half - 4); ctx.lineTo(WORLD.beachX + 40, y + half - 4); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,217,77,0.4)';
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 30]);
  for (const x of WORLD.roadsX) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke();
  }
  for (const y of WORLD.roadsY) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.beachX + 40, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(245,242,230,0.55)';
  for (const x of WORLD.roadsX) {
    for (const y of WORLD.roadsY) {
      for (let s = -3; s <= 3; s += 1) {
        ctx.fillRect(x - half + 4, y + s * 13 - 3, 16, 6);
        ctx.fillRect(x + half - 20, y + s * 13 - 3, 16, 6);
      }
    }
  }

  // Parking lots.
  for (const lot of city.parkingLots) {
    ctx.fillStyle = '#514e59';
    ctx.fillRect(lot.x - 6, lot.y - 6, lot.w + 12, lot.h + 12);
    ctx.strokeStyle = 'rgba(240,235,220,0.4)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 16; x < lot.x + lot.w - 10; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, lot.y + 8); ctx.lineTo(x, lot.y + 34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, lot.y + lot.h - 34); ctx.lineTo(x, lot.y + lot.h - 8); ctx.stroke();
    }
  }

  // Buildings: a wall block, a pastel roof, a grid of windows, a roof box.
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(20,16,28,0.35)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    ctx.fillStyle = b.paint;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const rng = makeRng(b.seed);
    ctx.fillStyle = 'rgba(30,30,48,0.35)';
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (rng.chance(0.42)) continue;
        ctx.fillRect(b.x + 8 + cx * ((b.w - 16) / cols), b.y + 8 + cy * ((b.h - 16) / rows), 9, 7);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    const boxW = rng.range(18, Math.max(20, b.w * 0.3));
    const boxH = rng.range(14, Math.max(16, b.h * 0.3));
    ctx.fillRect(b.x + rng.range(6, Math.max(7, b.w - boxW - 6)), b.y + rng.range(6, Math.max(7, b.h - boxH - 6)), boxW, boxH);
    if (b.name) {
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(24,18,32,0.55)';
      ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2);
    }
  }

  // Palms and park trees.
  for (const tree of city.trees) {
    ctx.fillStyle = 'rgba(20,16,28,0.3)';
    ctx.beginPath(); ctx.ellipse(tree.x + 5, tree.y + 6, tree.r, tree.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3e8853';
    ctx.beginPath(); ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57a773';
    ctx.beginPath(); ctx.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.25, tree.r * 0.62, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}

function drawCar(ctx, car, time) {
  const { length: L, width: W } = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(15,12,24,0.35)';
  rr(ctx, -L / 2 + 3, -W / 2 + 5, L, W, 7);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#17171c';
  const wy = W / 2 - 1;
  for (const [wx, sy] of [[L * 0.3, -1], [L * 0.3, 1], [-L * 0.3, -1], [-L * 0.3, 1]]) {
    ctx.fillRect(wx - 6, sy * wy - 2.5, 12, 5);
  }
  // Body.
  ctx.fillStyle = car.dead ? '#5a565e' : car.paint;
  rr(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,12,24,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (car.type === 'sport' && !car.dead) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-L / 2 + 4, -2.5, L - 8, 5);
    ctx.fillStyle = '#26232e';
    ctx.fillRect(-L / 2 + 1, -W / 2 + 2, 5, W - 4);
  }
  if (car.type === 'van') {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    rr(ctx, -L / 2 + 6, -W / 2 + 3, L * 0.55, W - 6, 4);
    ctx.fill();
  }
  if (car.type === 'taxi' && !car.dead) {
    ctx.fillStyle = '#26232e';
    ctx.fillRect(-7, -5, 14, 10);
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(-5, -3, 10, 6);
  }
  if (car.mode === 'police') {
    ctx.fillStyle = '#2456a6';
    ctx.fillRect(-L * 0.18, -W / 2 + 1.5, L * 0.36, W - 3);
    const flash = Math.sin(car.sirenPhase) > 0;
    ctx.fillStyle = flash ? '#ff3b30' : 'rgba(255,59,48,0.35)';
    rr(ctx, -8, -W / 2 + 2, 8, W / 2 - 2, 2);
    ctx.fill();
    ctx.fillStyle = flash ? 'rgba(64,156,255,0.35)' : '#409cff';
    rr(ctx, 0, 0, 8, W / 2 - 2, 2);
    ctx.fill();
  }
  // Glasshouse.
  ctx.fillStyle = '#1d2733';
  rr(ctx, -L * 0.16, -W / 2 + 3.5, L * 0.34, W - 7, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,240,0.5)';
  rr(ctx, L * 0.08, -W / 2 + 4.5, L * 0.09, W - 9, 3);
  ctx.fill();
  // Lights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(L / 2 - 2.5, -W / 2 + 3, 2.5, 4.5);
  ctx.fillRect(L / 2 - 2.5, W / 2 - 7.5, 2.5, 4.5);
  ctx.fillStyle = car.brakeLight ? '#ff5040' : 'rgba(255,60,50,0.55)';
  ctx.fillRect(-L / 2, -W / 2 + 3, 2.5, 4.5);
  ctx.fillRect(-L / 2, W / 2 - 7.5, 2.5, 4.5);
  void time;
  ctx.restore();
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(15,12,24,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.paint;
    rr(ctx, -11, -5, 22, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#eec39a';
    ctx.beginPath(); ctx.arc(13, 0, 4.6, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = ped.paint;
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eec39a';
    ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 2.5, Math.sin(ped.angle) * 2.5, 4.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx, game) {
  const player = game.player;
  if (player.car) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(15,12,24,0.35)';
  ctx.beginPath(); ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (player.invuln > 0 && Math.sin(game.time * 30) > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#12c2a0';
  ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(10,40,36,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.rotate(player.angle);
  ctx.fillStyle = '#2b2b33';
  ctx.fillRect(6, -1.8, 9, 3.6); // the pistol, pointed where the mouse is
  ctx.fillStyle = '#eec39a';
  ctx.beginPath(); ctx.arc(1.5, 0, 4.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawEffects(ctx, game) {
  for (const skid of game.skids) {
    ctx.fillStyle = `rgba(18,16,22,${0.34 * (1 - skid.t / 7)})`;
    ctx.beginPath(); ctx.arc(skid.x, skid.y, 3.1, 0, Math.PI * 2); ctx.fill();
  }
  for (const e of game.effects) {
    const k = 1 - e.t / e.life;
    if (e.kind === 'tracer') {
      ctx.strokeStyle = `rgba(255,230,150,${k})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    } else if (e.kind === 'muzzle') {
      ctx.fillStyle = `rgba(255,190,60,${k})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, 7 * k + 2, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'spark') {
      ctx.fillStyle = e.color;
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.arc(e.x, e.y, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'smoke') {
      ctx.fillStyle = `rgba(90,88,96,${0.4 * k})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, 6 + e.t * 15, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawBeacon(ctx, game) {
  const target = game.missions.target();
  const pulse = 1 + Math.sin(game.time * 5) * 0.12;
  const gradient = ctx.createLinearGradient(0, target.y - 240, 0, target.y);
  gradient.addColorStop(0, 'rgba(255,209,102,0)');
  gradient.addColorStop(1, 'rgba(255,209,102,0.4)');
  ctx.fillStyle = gradient;
  ctx.fillRect(target.x - 13, target.y - 240, 26, 240);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(target.x, target.y, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.beginPath(); ctx.arc(target.x, target.y, 44 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.arc(target.x, target.y, 6, 0, Math.PI * 2); ctx.fill();
  text(ctx, target.name, target.x, target.y - 58, '700 15px system-ui, sans-serif', '#ffe9b0', 'center', 4);
}

function star(ctx, cx, cy, r, filled, flash) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = flash ? '#ffe066' : '#ffd23e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,0,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawMinimap(ctx, game, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,12,22,0.78)';
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  rr(ctx, x, y, w, h, 10);
  ctx.clip();
  const sx = w / WORLD.width;
  const sy = h / WORLD.height;
  ctx.fillStyle = '#1b6f9e';
  ctx.fillRect(x + WORLD.waterX * sx, y, (WORLD.width - WORLD.waterX) * sx, h);
  ctx.fillStyle = '#c9b078';
  ctx.fillRect(x + WORLD.beachX * sx, y, (WORLD.waterX - WORLD.beachX) * sx, h);
  ctx.strokeStyle = 'rgba(230,225,210,0.5)';
  ctx.lineWidth = 1.4;
  for (const rx of WORLD.roadsX) {
    ctx.beginPath(); ctx.moveTo(x + rx * sx, y); ctx.lineTo(x + rx * sx, y + h); ctx.stroke();
  }
  for (const ry of WORLD.roadsY) {
    ctx.beginPath(); ctx.moveTo(x, y + ry * sy); ctx.lineTo(x + WORLD.beachX * sx, y + ry * sy); ctx.stroke();
  }
  const target = game.missions.target();
  const pulse = 3.4 + Math.sin(game.time * 5) * 1.1;
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.arc(x + target.x * sx, y + target.y * sy, pulse, 0, Math.PI * 2); ctx.fill();
  for (const car of game.cars) {
    if (car.mode !== 'police') continue;
    ctx.fillStyle = Math.sin(car.sirenPhase) > 0 ? '#ff5040' : '#409cff';
    ctx.beginPath(); ctx.arc(x + car.x * sx, y + car.y * sy, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  const focus = game.player.car ?? game.player;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x + focus.x * sx, y + focus.y * sy, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(x + focus.x * sx, y + focus.y * sy);
  ctx.lineTo(x + (focus.x + Math.cos(focus.angle) * 90) * sx, y + (focus.y + Math.sin(focus.angle) * 90) * sy);
  ctx.stroke();
  ctx.restore();
  text(ctx, 'CORAL BAY', x + 8, y + 12, '700 10px system-ui, sans-serif', 'rgba(255,255,255,0.75)');
}

function drawHud(ctx, game) {
  const { w, h } = game.view;
  const player = game.player;

  // Cash and health, top-left.
  ctx.fillStyle = 'rgba(10,12,22,0.66)';
  rr(ctx, 14, 14, 218, player.car ? 92 : 70, 10);
  ctx.fill();
  text(ctx, `$ ${Math.round(player.cash).toLocaleString('en-US')}`, 28, 40, '800 24px system-ui, sans-serif', '#7bf1a8');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rr(ctx, 28, 56, 150, 10, 5);
  ctx.fill();
  ctx.fillStyle = player.health > 30 ? '#57cc5e' : '#ef476f';
  rr(ctx, 28, 56, 150 * clamp(player.health / 100, 0, 1), 10, 5);
  ctx.fill();
  text(ctx, 'HP', 190, 61, '700 11px system-ui, sans-serif', 'rgba(255,255,255,0.8)');
  if (player.car) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, 28, 78, 150, 8, 4);
    ctx.fill();
    ctx.fillStyle = player.car.health > 30 ? '#f2b134' : '#ef476f';
    rr(ctx, 28, 78, 150 * clamp(player.car.health / 100, 0, 1), 8, 4);
    ctx.fill();
    text(ctx, 'CAR', 190, 82, '700 11px system-ui, sans-serif', 'rgba(255,255,255,0.8)');
    const speed = Math.round(Math.abs(player.car.speed) * 0.24);
    text(ctx, `${speed} mph`, w - 26, h - 108, '800 26px system-ui, sans-serif', '#ffffff', 'right', 4);
  }

  // Wanted stars, top-right, with the bust meter under pressure.
  const flash = game.bustNear && Math.sin(game.time * 10) > 0;
  for (let i = 0; i < 5; i += 1) {
    star(ctx, w - 34 - (4 - i) * 40, 38, 15, i < Math.ceil(game.wanted - 0.001) && game.wanted > 0, flash);
  }
  if (game.bustMeter > 0.02) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    rr(ctx, w - 214, 58, 186, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = '#ff5040';
    rr(ctx, w - 214, 58, 186 * clamp(game.bustMeter, 0, 1), 9, 4.5);
    ctx.fill();
  }

  // Objective, bottom-centre: what to do, how far, and Marina's word on it.
  const target = game.missions.target();
  const focus = player.car ?? player;
  const metres = Math.round(distance(focus.x, focus.y, target.x, target.y) / 8);
  const label = `${game.missions.objectiveText()}  ·  ${metres} m`;
  ctx.font = '700 16px system-ui, sans-serif';
  const labelW = Math.min(w - 260, ctx.measureText(label).width + 44);
  ctx.fillStyle = 'rgba(10,12,22,0.7)';
  rr(ctx, (w - labelW) / 2, h - 66, labelW, 50, 12);
  ctx.fill();
  text(ctx, label, w / 2, h - 49, '700 16px system-ui, sans-serif', '#ffe9b0', 'center');
  text(ctx, game.missions.brief, w / 2, h - 27, 'italic 12.5px system-ui, sans-serif', 'rgba(255,255,255,0.75)', 'center');

  // Off-screen objective: an arrow on the screen edge, pointing the way.
  const screenX = target.x - (game.camera.x - w / 2);
  const screenY = target.y - (game.camera.y - h / 2);
  if (screenX < 20 || screenX > w - 20 || screenY < 20 || screenY > h - 20) {
    const angle = Math.atan2(target.y - focus.y, target.x - focus.x);
    const ax = clamp(screenX, 44, w - 44);
    const ay = clamp(screenY, 90, h - 100);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-9, -9);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawMinimap(ctx, game, 14, h - 148, 196, 132);

  // Popups.
  let py = 108;
  for (const popup of game.popups) {
    const fade = popup.t < 0.25 ? popup.t / 0.25 : popup.t > popup.life - 0.6 ? Math.max(0, (popup.life - popup.t) / 0.6) : 1;
    ctx.globalAlpha = fade;
    text(ctx, popup.text, w / 2, py, '800 21px system-ui, sans-serif', popup.color, 'center', 5);
    ctx.globalAlpha = 1;
    py += 30;
  }

  text(ctx, 'WASD drive · E enter car · mouse aim, click shoot · SPACE handbrake · H help · P pause', w - 16, h - 16, '600 11.5px system-ui, sans-serif', 'rgba(255,255,255,0.55)', 'right');
}

const CONTROLS = [
  ['W A S D / arrows', 'walk and drive'],
  ['SHIFT', 'run'],
  ['E or F', 'enter / exit a car'],
  ['Mouse + click', 'aim and shoot on foot'],
  ['SPACE', 'handbrake'],
  ['H', 'help'], ['P / ESC', 'pause'], ['M', 'mute'],
];

function drawTitle(ctx, game) {
  const { w, h } = game.view;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(16,10,28,0.62)');
  gradient.addColorStop(0.45, 'rgba(16,10,28,0.12)');
  gradient.addColorStop(1, 'rgba(16,10,28,0.66)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  const titleGradient = ctx.createLinearGradient(0, 120, 0, 230);
  titleGradient.addColorStop(0, '#ffd166');
  titleGradient.addColorStop(0.55, '#ef8354');
  titleGradient.addColorStop(1, '#e75480');
  ctx.font = '900 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(20,10,26,0.9)';
  ctx.strokeText('VICE HEAT', w / 2, 168);
  ctx.fillStyle = titleGradient;
  ctx.fillText('VICE HEAT', w / 2, 168);
  text(ctx, 'A tiny open-world crime caper in Coral Bay', w / 2, 232, '600 21px system-ui, sans-serif', '#ffe9b0', 'center', 4);
  text(ctx, 'Steal cars. Run Marina’s packages. Mind the Coral Bay PD.', w / 2, 262, '500 15.5px system-ui, sans-serif', 'rgba(255,255,255,0.9)', 'center', 4);

  const boxW = 520;
  const boxX = (w - boxW) / 2;
  ctx.fillStyle = 'rgba(10,12,22,0.72)';
  rr(ctx, boxX, 306, boxW, 218, 14);
  ctx.fill();
  let cy = 336;
  for (const [keys, what] of CONTROLS) {
    text(ctx, keys, boxX + 36, cy, '700 15px system-ui, sans-serif', '#ffd166');
    text(ctx, what, boxX + 210, cy, '500 15px system-ui, sans-serif', 'rgba(255,255,255,0.92)');
    cy += 26;
  }
  const pulse = 0.65 + Math.sin(game.time * 3.4) * 0.35;
  ctx.globalAlpha = pulse;
  text(ctx, 'PRESS ENTER TO PLAY', w / 2, 574, '800 24px system-ui, sans-serif', '#ffffff', 'center', 5);
  ctx.globalAlpha = 1;
  if (game.savedGame) {
    text(ctx, `Welcome back — $${Math.round(game.savedGame.cash).toLocaleString('en-US')} and ${game.savedGame.completed} deliveries on the books`, w / 2, 612, '600 14px system-ui, sans-serif', '#7bf1a8', 'center', 4);
  }
  text(ctx, 'An original game built by an AI agent — every street, car and name invented for Coral Bay', w / 2, h - 24, '500 12px system-ui, sans-serif', 'rgba(255,255,255,0.6)', 'center');
}

function drawEndScreen(ctx, game, busted) {
  const { w, h } = game.view;
  ctx.fillStyle = busted ? 'rgba(14,20,52,0.55)' : 'rgba(52,10,14,0.55)';
  ctx.fillRect(0, 0, w, h);
  if (busted) {
    const phase = Math.sin(game.time * 9) > 0;
    ctx.fillStyle = phase ? 'rgba(255,59,48,0.13)' : 'rgba(64,156,255,0.13)';
    ctx.fillRect(0, 0, w, h);
  }
  text(ctx, busted ? 'BUSTED' : 'WASTED', w / 2, h / 2 - 46, '900 84px system-ui, sans-serif', busted ? '#9ec2ff' : '#ff8a7a', 'center', 8);
  text(
    ctx,
    busted ? 'The Coral Bay PD walks you to the station.' : 'You wake up at Coral Bay Hospital, lighter one wallet.',
    w / 2, h / 2 + 16, '600 18px system-ui, sans-serif', '#ffffff', 'center', 4,
  );
  if (game.endTimer > 0.6) {
    text(ctx, 'PRESS ENTER', w / 2, h / 2 + 62, '800 20px system-ui, sans-serif', '#ffd166', 'center', 4);
  }
}

function drawPause(ctx, game, help) {
  const { w, h } = game.view;
  ctx.fillStyle = 'rgba(10,10,20,0.62)';
  ctx.fillRect(0, 0, w, h);
  text(ctx, help ? 'HOW TO PLAY' : 'PAUSED', w / 2, 150, '900 44px system-ui, sans-serif', '#ffffff', 'center', 5);
  let cy = 226;
  const lines = help
    ? [
        ...CONTROLS,
        ['', ''],
        ['The gold beacon', 'is your next package or drop-off'],
        ['Stars', 'rise when crimes are witnessed; lie low to cool them'],
        ['Busted', 'a cop pinning you still walks you in — keep moving'],
      ]
    : [['P / ESC', 'resume'], ['H', 'help'], ['M', 'mute']];
  for (const [keys, what] of lines) {
    if (keys) text(ctx, keys, w / 2 - 170, cy, '700 16px system-ui, sans-serif', '#ffd166');
    if (what) text(ctx, what, w / 2 - 30, cy, '500 16px system-ui, sans-serif', 'rgba(255,255,255,0.94)');
    cy += 30;
  }
}

/** Draw the whole frame: world, then HUD, then any screen on top. */
export function drawScene(ctx, game, staticLayer) {
  const { w, h } = game.view;
  const camX = game.camera.x - w / 2;
  const camY = game.camera.y - h / 2;
  ctx.fillStyle = '#1266a0';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(staticLayer, camX, camY, w, h, 0, 0, w, h);
  ctx.save();
  ctx.translate(-camX, -camY);
  if (game.screen !== SCREEN_TITLE) drawBeacon(ctx, game);
  for (const car of game.cars) drawCar(ctx, car, game.time);
  for (const ped of game.peds) drawPed(ctx, ped);
  drawPlayer(ctx, game);
  drawEffects(ctx, game);
  ctx.restore();

  if (game.screen === SCREEN_TITLE) {
    drawTitle(ctx, game);
    return;
  }
  drawHud(ctx, game);
  if (game.screen === SCREEN_PAUSED) drawPause(ctx, game, false);
  else if (game.screen === SCREEN_HELP) drawPause(ctx, game, true);
  else if (game.screen === SCREEN_BUSTED) drawEndScreen(ctx, game, true);
  else if (game.screen === SCREEN_WASTED) drawEndScreen(ctx, game, false);
}
