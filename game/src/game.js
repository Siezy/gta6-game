// Vice Heat's simulation: the player on foot and behind the wheel, car
// physics and collisions, gunfire, the wanted level and the police who
// answer it, busted and wasted, and the camera. Rendering lives in
// render.js; this file is only rules, stepped at a fixed 60 Hz.

import {
  CRIME, ECONOMY, GUN, PEDS, PLAYER, SAVE_KEY, STEP, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { buildCity, collideCircle, pointInBuilding } from './city.js';
import { createMissions } from './missions.js';
import {
  knockDownPed, makePed, scarePed, spawnParkedCar, spawnPoliceCar,
  spawnTrafficCar, updatePed, updateTrafficCar,
} from './entities.js';
import { angleDelta, clamp, distance, makeRng } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_HELP = 'help';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.cash !== 'number' || typeof parsed.completed !== 'number') return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function storeSave(game) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.round(game.player.cash),
      completed: game.missions.completed,
    }));
  } catch (error) { /* a private window is not a bug */ }
}

export function createGame(seed) {
  const rng = makeRng(seed);
  const city = buildCity(makeRng(seed * 7 + 11));
  const saved = loadSave();
  const game = {
    seed,
    rng,
    city,
    screen: SCREEN_TITLE,
    returnScreen: SCREEN_PLAY,
    time: 0,
    view: { w: 1280, h: 800 },
    camera: { x: 2900, y: 1100 },
    player: {
      x: city.spawnPoint.x, y: city.spawnPoint.y, angle: -Math.PI / 2,
      health: PLAYER.maxHealth, cash: saved ? saved.cash : 60,
      car: null, invuln: 0, lastHurt: -99, gunCooldown: 0,
    },
    cars: [],
    peds: [],
    effects: [],
    skids: [],
    popups: [],
    wanted: 0,
    peakWanted: 0,
    lastCrime: -99,
    bustMeter: 0,
    bustNear: false,
    milestones: {},
    trafficTimer: 0,
    pedTimer: 0,
    policeTimer: 0,
    smokeTimer: 0,
    savedGame: saved,
    endTimer: 0,
  };
  game.missions = createMissions(city, makeRng(seed * 13 + 5));
  if (saved) game.missions.completed = saved.completed;
  // Opening traffic and parked cars, so the city is alive from the title.
  for (const lot of city.parkingLots) {
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i += 1) game.cars.push(spawnParkedCar(rng, lot));
  }
  for (let i = 0; i < 10; i += 1) {
    const car = spawnTrafficCar(rng, game.player.x, game.player.y);
    if (car) game.cars.push(car);
  }
  for (let i = 0; i < 16; i += 1) game.peds.push(makePed(rng, city));
  return game;
}

export function pushPopup(game, text, color = '#ffd166') {
  game.popups.push({ text, color, t: 0, life: 3.4 });
  if (game.popups.length > 3) game.popups.shift();
}

function awardMilestone(game, id, amount, text) {
  if (game.milestones[id]) return;
  game.milestones[id] = true;
  game.player.cash += amount;
  pushPopup(game, `${text} +$${amount}`, '#7bf1a8');
}

function addEffect(game, effect) {
  game.effects.push(effect);
  if (game.effects.length > 240) game.effects.splice(0, game.effects.length - 240);
}

function burst(game, x, y, kind, count, color) {
  for (let i = 0; i < count; i += 1) {
    const a = game.rng.range(0, Math.PI * 2);
    const sp = game.rng.range(30, 150);
    addEffect(game, {
      kind, x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      t: 0, life: game.rng.range(0.25, 0.6), color,
    });
  }
}

/** Who could see a crime at (x, y): a pedestrian or a cop close enough. */
function witnessed(game, x, y) {
  for (const ped of game.peds) {
    if (distance(ped.x, ped.y, x, y) < WANTED.witnessRadius) return true;
  }
  for (const car of game.cars) {
    if (car.mode === 'police' && distance(car.x, car.y, x, y) < WANTED.copSightRadius) return true;
  }
  return false;
}

export function commitCrime(game, amount, x, y) {
  if (amount <= 0) return;
  if (!witnessed(game, x, y)) return;
  game.wanted = clamp(game.wanted + amount, 0, WANTED.max);
  game.lastCrime = game.time;
  if (game.wanted > game.peakWanted) game.peakWanted = game.wanted;
  if (game.wanted >= 3) awardMilestone(game, 'heat3', 50, 'Three stars — the whole bay is watching');
}

function hurtPlayer(game, amount, audio) {
  const player = game.player;
  if (player.invuln > 0 || game.screen !== SCREEN_PLAY) return;
  player.health -= amount;
  player.lastHurt = game.time;
  player.invuln = 0.7;
  burst(game, player.x, player.y, 'spark', 6, '#ef476f');
  if (player.health <= 0) {
    player.health = 0;
    game.screen = SCREEN_WASTED;
    game.endTimer = 0;
    audio.wasted();
  }
}

/** Arcade car physics: throttle and steer in, velocity and facing out. */
export function driveCar(car, dt, throttle, steer, handbrake) {
  const spec = car.spec;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let forward = car.vx * cos + car.vy * sin;
  let lateral = -car.vx * sin + car.vy * cos;
  if (car.dead) throttle = 0;
  // A shunt can knock a car past its top speed; the engine pulls it back fast.
  if (forward > spec.topSpeed) forward = Math.max(spec.topSpeed, forward - 900 * dt);
  if (throttle > 0) {
    forward += spec.accel * dt;
    if (forward > spec.topSpeed) forward = spec.topSpeed;
  } else if (throttle < 0) {
    if (forward > 12) forward -= spec.brake * dt;
    else forward = Math.max(-spec.reverseSpeed, forward - spec.accel * 0.7 * dt);
  } else {
    forward -= forward * 0.55 * dt;
    if (Math.abs(forward) < 4) forward = 0;
  }
  if (handbrake) forward -= forward * 1.9 * dt;
  const grip = handbrake ? spec.grip * 0.22 : spec.grip;
  lateral -= lateral * Math.min(1, grip * dt);
  const steerAuthority = clamp(forward / 150, -1, 1);
  car.angle += steer * spec.turn * steerAuthority * dt * (handbrake ? 1.35 : 1);
  const ncos = Math.cos(car.angle);
  const nsin = Math.sin(car.angle);
  car.vx = ncos * forward - nsin * lateral;
  car.vy = nsin * forward + ncos * lateral;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = forward;
  car.drifting = Math.abs(lateral) > 55 || (handbrake && Math.abs(forward) > 60);
}

/** Keep a car out of the buildings; returns the impact speed if it hit. */
function collideCarBuildings(game, car) {
  const spec = car.spec;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let impact = 0;
  for (const sign of [1, -1]) {
    const bx = car.x + cos * spec.length * 0.32 * sign;
    const by = car.y + sin * spec.length * 0.32 * sign;
    const resolved = collideCircle(game.city, bx, by, spec.width * 0.6);
    if (resolved.hit) {
      car.x += resolved.x - bx;
      car.y += resolved.y - by;
      const into = car.vx * (resolved.x - bx) + car.vy * (resolved.y - by);
      impact = Math.max(impact, Math.hypot(car.vx, car.vy));
      car.vx *= 0.35;
      car.vy *= 0.35;
      if (into > 0) { /* pushed out along the wall */ }
    }
  }
  const clamped = collideCircle(game.city, car.x, car.y, spec.width * 0.6);
  car.x = clamped.x;
  car.y = clamped.y;
  return impact;
}

function damageCar(game, car, amount, audio) {
  car.health -= amount;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    burst(game, car.x, car.y, 'smoke', 14, '#555');
    if (car === game.player.car) pushPopup(game, 'The car is wrecked — find another', '#ef476f');
  }
  if (audio && amount > 4) audio.crash(amount > 10);
}

function collideCars(game, audio) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const ra = a.spec.length * 0.44;
      const rb = b.spec.length * 0.44;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= ra + rb) continue;
      const push = (ra + rb - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const relVx = b.vx - a.vx;
      const relVy = b.vy - a.vy;
      const closing = -(relVx * nx + relVy * ny);
      if (closing > 0) {
        const bounce = closing * 0.42;
        a.vx -= nx * bounce;
        a.vy -= ny * bounce;
        b.vx += nx * bounce;
        b.vy += ny * bounce;
        if (closing > 130) {
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          burst(game, midX, midY, 'spark', 10, '#ffd166');
          damageCar(game, a, closing / 22, audio);
          damageCar(game, b, closing / 22, audio);
          if (a === game.player.car || b === game.player.car) {
            commitCrime(game, CRIME.hitCar, midX, midY);
            if (closing > 300) hurtPlayer(game, 9, audio);
          }
        }
      }
    }
  }
}

function carHitsPeds(game, audio) {
  for (const car of game.cars) {
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 46) continue;
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      if (distance(car.x, car.y, ped.x, ped.y) > car.spec.length * 0.55 + 12) continue;
      knockDownPed(ped);
      burst(game, ped.x, ped.y, 'spark', 8, '#ef476f');
      if (car === game.player.car) {
        commitCrime(game, CRIME.hitPedestrian + (speed > 235 ? CRIME.killPedestrian : 0), ped.x, ped.y);
        audio.crash(false);
      }
      // Bystanders run from the noise.
      for (const other of game.peds) {
        if (other !== ped && distance(other.x, other.y, ped.x, ped.y) < 190) scarePed(other, ped.x, ped.y);
      }
    }
  }
}

function carRunsOverPlayer(game, audio) {
  const player = game.player;
  if (player.car || player.invuln > 0) return;
  for (const car of game.cars) {
    if (car.mode === 'player') continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 60) continue;
    if (distance(car.x, car.y, player.x, player.y) > car.spec.length * 0.55 + 12) continue;
    const away = Math.atan2(player.y - car.y, player.x - car.x);
    player.x += Math.cos(away) * 30;
    player.y += Math.sin(away) * 30;
    hurtPlayer(game, 20, audio);
    audio.crash(false);
  }
}

function enterExitCar(game, audio) {
  const player = game.player;
  if (player.car) {
    const car = player.car;
    const side = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * (car.spec.width / 2 + 17);
    player.y = car.y + Math.sin(side) * (car.spec.width / 2 + 17);
    const resolved = collideCircle(game.city, player.x, player.y, PLAYER.radius);
    player.x = resolved.x;
    player.y = resolved.y;
    player.car = null;
    car.mode = 'empty';
    car.vx = 0;
    car.vy = 0;
    car.speed = 0;
    audio.door();
    return;
  }
  let best = null;
  let bestD = PLAYER.enterCarRange;
  for (const car of game.cars) {
    if (car.mode === 'police' || car.dead) continue;
    const d = distance(car.x, car.y, player.x, player.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  if (!best) return;
  if (best.mode === 'traffic') {
    // The driver bails out and runs.
    const ped = makePed(game.rng, game.city);
    ped.x = best.x + game.rng.range(-16, 16);
    ped.y = best.y + game.rng.range(-16, 16);
    scarePed(ped, player.x, player.y, 5);
    game.peds.push(ped);
    commitCrime(game, CRIME.stealCar, best.x, best.y);
    awardMilestone(game, 'sticky', 25, 'Sticky fingers — first car lifted');
  } else if (best.mode === 'parked') {
    commitCrime(game, CRIME.stealCar, best.x, best.y);
    awardMilestone(game, 'sticky', 25, 'Sticky fingers — first car lifted');
  }
  best.mode = 'player';
  player.car = best;
  audio.door();
}

function shoot(game, input, audio) {
  const player = game.player;
  player.gunCooldown -= STEP;
  if (!input.fire || player.car || player.gunCooldown > 0) return;
  player.gunCooldown = GUN.cooldown;
  const aimWorldX = game.camera.x - game.view.w / 2 + input.aimX;
  const aimWorldY = game.camera.y - game.view.h / 2 + input.aimY;
  const angle = Math.atan2(aimWorldY - player.y, aimWorldX - player.x) + game.rng.range(-GUN.spread, GUN.spread);
  player.angle = angle;
  audio.shot();
  commitCrime(game, CRIME.shotFired, player.x, player.y);
  for (const ped of game.peds) {
    if (distance(ped.x, ped.y, player.x, player.y) < 260) scarePed(ped, player.x, player.y);
  }
  const stepSize = 9;
  let hx = player.x;
  let hy = player.y;
  let hitKind = null;
  for (let d = stepSize; d < GUN.range; d += stepSize) {
    hx = player.x + Math.cos(angle) * d;
    hy = player.y + Math.sin(angle) * d;
    if (pointInBuilding(game.city, hx, hy, 0)) { hitKind = 'wall'; break; }
    let done = false;
    for (const ped of game.peds) {
      if (ped.state !== 'down' && distance(ped.x, ped.y, hx, hy) < 13) {
        knockDownPed(ped);
        commitCrime(game, CRIME.shotHitsPedestrian, ped.x, ped.y);
        hitKind = 'ped';
        done = true;
        break;
      }
    }
    if (done) break;
    for (const car of game.cars) {
      if (car !== player.car && distance(car.x, car.y, hx, hy) < car.spec.length * 0.5) {
        damageCar(game, car, 7, audio);
        commitCrime(game, CRIME.shotHitsCar, car.x, car.y);
        hitKind = 'car';
        done = true;
        break;
      }
    }
    if (done) break;
  }
  addEffect(game, {
    kind: 'tracer', x: player.x + Math.cos(angle) * 18, y: player.y + Math.sin(angle) * 18,
    x2: hx, y2: hy, t: 0, life: 0.07,
  });
  addEffect(game, {
    kind: 'muzzle', x: player.x + Math.cos(angle) * 20, y: player.y + Math.sin(angle) * 20,
    t: 0, life: 0.05,
  });
  if (hitKind) burst(game, hx, hy, 'spark', 5, hitKind === 'ped' ? '#ef476f' : '#ffd166');
}

function updatePolice(game, dt, audio) {
  const player = game.player;
  const targetX = player.car ? player.car.x : player.x;
  const targetY = player.car ? player.car.y : player.y;
  let nearestCop = Infinity;
  for (const car of game.cars) {
    if (car.mode !== 'police') continue;
    const d = distance(car.x, car.y, targetX, targetY);
    nearestCop = Math.min(nearestCop, d);
    const toTarget = Math.atan2(targetY - car.y, targetX - car.x);
    let steer = clamp(angleDelta(car.angle, toTarget) / 0.45, -1, 1);
    let throttle = 1;
    // Do not charge straight through a building: aim at its corner instead.
    const probeX = car.x + Math.cos(car.angle) * 74;
    const probeY = car.y + Math.sin(car.angle) * 74;
    if (pointInBuilding(game.city, probeX, probeY, 6)) {
      steer = steer >= 0 ? 1 : -1;
      throttle = 0.7;
    }
    if (d < 60 && Math.abs(angleDelta(car.angle, toTarget)) > 2.2) throttle = -1;
    // Close on a suspect who is stopped or on foot, a unit pulls up and
    // holds position instead of orbiting at speed — that is what pins them.
    const targetSpeed = player.car ? Math.abs(player.car.speed) : 0;
    if (d < 115 && targetSpeed < 42) {
      if (car.speed > 64) throttle = -1;
      else throttle = d < 54 ? 0 : 0.45;
    }
    driveCar(car, dt, throttle, steer, false);
    const impact = collideCarBuildings(game, car);
    if (impact > 240) damageCar(game, car, impact / 30, audio);
    if (Math.hypot(car.vx, car.vy) < 16) car.stuckTime += dt;
    else car.stuckTime = 0;
    if (car.stuckTime > 1.8) {
      // Wedged: quietly rejoin the hunt from a road the player cannot see.
      car.stuckTime = 0;
      if (d > 640) {
        const fresh = spawnPoliceCar(game.rng, targetX, targetY);
        car.x = fresh.x;
        car.y = fresh.y;
        car.angle = fresh.angle;
        car.vx = 0;
        car.vy = 0;
      }
    }
    car.sirenPhase += dt * 9;
  }
  return nearestCop;
}

function manageWanted(game, dt, audio) {
  const player = game.player;
  let copSees = false;
  for (const car of game.cars) {
    if (car.mode !== 'police') continue;
    const focus = player.car ?? player;
    if (distance(car.x, car.y, focus.x, focus.y) < WANTED.copSightRadius) copSees = true;
  }
  if (game.wanted > 0 && game.time - game.lastCrime > WANTED.quietSeconds && !copSees) {
    game.wanted = Math.max(0, game.wanted - dt / WANTED.starDecaySeconds);
    if (game.wanted === 0 && game.peakWanted >= 3) {
      awardMilestone(game, 'ghost', 75, 'Ghost — you shook a three-star hunt');
      game.peakWanted = 0;
    }
  }
  const desired = game.wanted < 0.5 ? 0
    : clamp(Math.round(game.wanted) + (game.wanted >= 2.5 ? 1 : 0), 1, 5);
  const cops = game.cars.filter((car) => car.mode === 'police');
  game.policeTimer -= dt;
  if (cops.length < desired && game.policeTimer <= 0) {
    game.policeTimer = 1.1;
    const focus = player.car ?? player;
    game.cars.push(spawnPoliceCar(game.rng, focus.x, focus.y));
  } else if (cops.length > desired) {
    // The farthest surplus unit drops out of the hunt.
    let far = null;
    let farD = 500;
    for (const cop of cops) {
      const d = distance(cop.x, cop.y, player.x, player.y);
      if (d > farD) { far = cop; farD = d; }
    }
    if (far) game.cars.splice(game.cars.indexOf(far), 1);
  }
  // Busted: pinned by a cop, on foot or crawling.
  const focus = player.car ?? player;
  let pinning = false;
  for (const car of game.cars) {
    if (car.mode !== 'police') continue;
    if (distance(car.x, car.y, focus.x, focus.y) < WANTED.bustRadius) pinning = true;
  }
  const slowEnough = player.car ? Math.abs(player.car.speed) < 26 : true;
  game.bustNear = pinning;
  if (pinning && slowEnough && game.wanted >= 1) {
    game.bustMeter += dt / (player.car ? WANTED.bustInCarSeconds : WANTED.bustOnFootSeconds);
  } else {
    game.bustMeter = Math.max(0, game.bustMeter - dt * 1.6);
  }
  if (game.bustMeter >= 1) {
    game.screen = SCREEN_BUSTED;
    game.endTimer = 0;
    audio.busted();
  }
  return copSees;
}

function updatePlayer(game, dt, input, audio) {
  const player = game.player;
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.health < PLAYER.maxHealth && game.time - player.lastHurt > PLAYER.regenDelay && game.wanted === 0) {
    player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.regenPerSecond * dt);
  }
  if (input.enter) enterExitCar(game, audio);
  if (player.car) {
    const car = player.car;
    const throttle = input.up ? 1 : input.down ? -1 : 0;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    driveCar(car, dt, throttle, steer, input.handbrake);
    const impact = collideCarBuildings(game, car);
    if (impact > 250) {
      damageCar(game, car, impact / 26, audio);
      hurtPlayer(game, impact / 55, audio);
      commitCrime(game, CRIME.hitCar, car.x, car.y);
      audio.crash(impact > 340);
    }
    if (car.drifting && Math.abs(car.speed) > 90) {
      const back = car.spec.length * 0.36;
      for (const sideSign of [1, -1]) {
        game.skids.push({
          x: car.x - Math.cos(car.angle) * back + Math.cos(car.angle + Math.PI / 2) * sideSign * car.spec.width * 0.36,
          y: car.y - Math.sin(car.angle) * back + Math.sin(car.angle + Math.PI / 2) * sideSign * car.spec.width * 0.36,
          t: 0,
        });
      }
      if (game.skids.length > 420) game.skids.splice(0, game.skids.length - 420);
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  } else {
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const resolved = collideCircle(game.city, player.x + mx * speed * dt, player.y + my * speed * dt, PLAYER.radius);
      player.x = resolved.x;
      player.y = resolved.y;
      player.angle = Math.atan2(my, mx);
    }
    shoot(game, input, audio);
  }
}

function updateAmbient(game, dt) {
  const focus = game.player.car ?? game.player;
  game.trafficTimer -= dt;
  if (game.trafficTimer <= 0) {
    game.trafficTimer = 0.7;
    const traffic = game.cars.filter((car) => car.mode === 'traffic');
    if (traffic.length < TRAFFIC.maxCars) {
      const car = spawnTrafficCar(game.rng, focus.x, focus.y);
      if (car) game.cars.push(car);
    }
  }
  game.pedTimer -= dt;
  if (game.pedTimer <= 0) {
    game.pedTimer = 0.9;
    if (game.peds.length < PEDS.max) game.peds.push(makePed(game.rng, game.city));
  }
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car.mode === 'traffic') {
      updateTrafficCar(car, dt, game.cars, game.peds, game.rng);
      collideCarBuildings(game, car);
      if (distance(car.x, car.y, focus.x, focus.y) > TRAFFIC.despawn && game.screen === SCREEN_PLAY) {
        game.cars.splice(i, 1);
      }
    }
  }
  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    const ped = game.peds[i];
    updatePed(ped, dt, game.city);
    if (distance(ped.x, ped.y, focus.x, focus.y) > PEDS.despawn && game.screen === SCREEN_PLAY) {
      game.peds.splice(i, 1);
    }
  }
}

function checkMissionArrival(game, audio) {
  const target = game.missions.target();
  const focus = game.player.car ?? game.player;
  if (distance(focus.x, focus.y, target.x, target.y) > 52) return;
  const result = game.missions.reachTarget();
  if (!result) return;
  if (result.kind === 'pickup') {
    audio.pickup();
    pushPopup(game, result.text, '#ffd166');
  } else {
    game.player.cash += result.amount;
    audio.cash();
    pushPopup(game, result.text, '#7bf1a8');
    if (game.missions.completed === 5) awardMilestone(game, 'regular', 150, "Marina's regular — five clean runs");
    storeSave(game);
  }
}

function respawn(game, atPolice) {
  const player = game.player;
  if (player.car) {
    player.car.mode = 'empty';
    player.car = null;
  }
  game.cars = game.cars.filter((car) => car.mode !== 'police');
  const spot = atPolice ? game.city.policeStation : game.city.hospital;
  const fee = atPolice
    ? Math.max(ECONOMY.bustedFineMin, Math.round(player.cash * ECONOMY.bustedFineRate))
    : Math.round(player.cash * ECONOMY.wastedFeeRate);
  player.cash = Math.max(0, player.cash - fee);
  player.x = spot.x;
  player.y = spot.y;
  player.health = PLAYER.maxHealth;
  game.wanted = 0;
  game.peakWanted = 0;
  game.bustMeter = 0;
  game.screen = SCREEN_PLAY;
  pushPopup(game, atPolice ? `Bailed out — the fine was $${fee}` : `Patched up — the bill was $${fee}`, '#ffd166');
  storeSave(game);
}

function updateCamera(game, dt) {
  if (game.screen === SCREEN_TITLE) {
    game.camera.x = 2920 + Math.sin(game.time * 0.045) * 330;
    game.camera.y = 1120 + Math.cos(game.time * 0.03) * 300;
    return;
  }
  const focus = game.player.car ?? game.player;
  const lookX = clamp((focus.vx ?? 0) * 0.38, -130, 130);
  const lookY = clamp((focus.vy ?? 0) * 0.38, -130, 130);
  const targetX = focus.x + lookX;
  const targetY = focus.y + lookY;
  const ease = 1 - Math.exp(-5.2 * dt);
  game.camera.x += (targetX - game.camera.x) * ease;
  game.camera.y += (targetY - game.camera.y) * ease;
  game.camera.x = clamp(game.camera.x, game.view.w / 2 - 60, WORLD.width - game.view.w / 2 + 60);
  game.camera.y = clamp(game.camera.y, game.view.h / 2 - 60, WORLD.height - game.view.h / 2 + 60);
}

/** One fixed step. `audio` is the sound module (its methods are all safe). */
export function stepGame(game, input, audio) {
  const dt = STEP;
  game.time += dt;
  if (input.mute) audio.setMuted(!audio.isMuted());

  if (game.screen === SCREEN_TITLE) {
    updateAmbient(game, dt);
    updateCamera(game, dt);
    if (input.start || input.clicked) game.screen = SCREEN_PLAY;
    audio.update(dt, null, null);
    return;
  }
  if (game.screen === SCREEN_PAUSED || game.screen === SCREEN_HELP) {
    if (input.pause || input.help) game.screen = game.returnScreen;
    audio.update(dt, null, null);
    return;
  }
  if (game.screen === SCREEN_BUSTED || game.screen === SCREEN_WASTED) {
    game.endTimer += dt;
    updateAmbient(game, dt);
    updateCamera(game, dt);
    if ((input.start || input.restart) && game.endTimer > 0.6) {
      respawn(game, game.screen === SCREEN_BUSTED);
    }
    audio.update(dt, null, null);
    return;
  }

  // SCREEN_PLAY
  if (input.pause) {
    game.returnScreen = SCREEN_PLAY;
    game.screen = SCREEN_PAUSED;
    return;
  }
  if (input.help) {
    game.returnScreen = SCREEN_PLAY;
    game.screen = SCREEN_HELP;
    return;
  }
  updatePlayer(game, dt, input, audio);
  if (game.screen !== SCREEN_PLAY) return; // hurtPlayer may have ended the run
  const nearestCop = updatePolice(game, dt, audio);
  updateAmbient(game, dt);
  collideCars(game, audio);
  carHitsPeds(game, audio);
  carRunsOverPlayer(game, audio);
  manageWanted(game, dt, audio);
  game.missions.update(dt);
  checkMissionArrival(game, audio);
  updateCamera(game, dt);

  // Damaged cars smoke.
  game.smokeTimer -= dt;
  if (game.smokeTimer <= 0) {
    game.smokeTimer = 0.12;
    for (const car of game.cars) {
      if (car.health < 32) addEffect(game, { kind: 'smoke', x: car.x, y: car.y - 6, vx: 4, vy: -26, t: 0, life: 0.9, color: '#666' });
    }
  }
  for (let i = game.effects.length - 1; i >= 0; i -= 1) {
    const effect = game.effects[i];
    effect.t += dt;
    if (effect.x !== undefined && effect.vx !== undefined) {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
    }
    if (effect.t >= effect.life) game.effects.splice(i, 1);
  }
  for (let i = game.skids.length - 1; i >= 0; i -= 1) {
    game.skids[i].t += dt;
    if (game.skids[i].t > 7) game.skids.splice(i, 1);
  }
  for (let i = game.popups.length - 1; i >= 0; i -= 1) {
    game.popups[i].t += dt;
    if (game.popups[i].t >= game.popups[i].life) game.popups.splice(i, 1);
  }
  const focus = game.player.car ?? game.player;
  audio.update(
    dt,
    game.player.car ? game.player.car.speed : null,
    game.wanted > 0 ? nearestCop : null,
  );
  void focus;
}
