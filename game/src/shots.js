// The staged scenes behind ?shot=title|drive|chase|mission. Each one builds
// the real game from the shot's seed, arranges a moment the judge should
// see, and plays the real rules forward for a fixed number of steps — so a
// screenshot is the game itself, never a mock-up, and the same seed always
// gives the same frame.

import { WORLD } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, stepGame } from './game.js';
import { blankInput } from './input.js';
import { makeCar, makePed, spawnPoliceCar } from './entities.js';

function runSteps(game, audio, steps, input) {
  for (let i = 0; i < steps; i += 1) stepGame(game, input ?? blankInput(), audio);
}

/** Put the player behind the wheel of a fresh car on a road, already moving. */
function putPlayerInCar(game, type, x, y, angle, speed) {
  const car = makeCar(game.rng, type, 'player');
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.vx = Math.cos(angle) * speed;
  car.vy = Math.sin(angle) * speed;
  car.speed = speed;
  game.cars.push(car);
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  game.camera.x = x;
  game.camera.y = y;
  return car;
}

/** Park a traffic car on a vertical road, rolling with the flow. */
function placeTraffic(game, roadIndex, dir, along, type) {
  const car = makeCar(game.rng, type, 'traffic');
  car.axis = 'y';
  car.roadIndex = roadIndex;
  car.dir = dir;
  car.x = WORLD.roadsX[roadIndex] + (dir > 0 ? -24 : 24);
  car.y = along;
  car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  car.speed = car.cruise * 0.8;
  game.cars.push(car);
  return car;
}

export function stageShot(name, game, audio) {
  const player = game.player;
  if (name === 'drive') {
    game.screen = SCREEN_PLAY;
    // East on the coast road in a red sports car, timed so the run ends
    // mid-intersection at the last cross street before the beach: a car
    // is crossing in front of the hero and a pedestrian is stepping
    // onto the crosswalk at the corner.
    const car = putPlayerInCar(game, 'sport', 2631, WORLD.roadsY[3] + 24, 0, 320);
    car.paint = '#d90429';
    placeTraffic(game, 6, 1, 1335, 'sedan'); // southbound, entering the crossing
    const ped = makePed(game.rng, game.city);
    let anchor = null;
    let bestGap = Infinity;
    for (const b of game.city.buildings) {
      if (b.y + b.h > WORLD.roadsY[3] || b.x + b.w > WORLD.roadsX[6]) continue;
      const gap = (WORLD.roadsY[3] - (b.y + b.h)) + (WORLD.roadsX[6] - (b.x + b.w));
      if (gap < bestGap) { bestGap = gap; anchor = b; }
    }
    if (anchor) {
      ped.anchor = anchor;
      ped.corner = 2; // its south-east corner, the one by the intersection
      ped.x = anchor.x + anchor.w + 15;
      ped.y = anchor.y + anchor.h + 41;
      game.peds.push(ped);
    }
    const input = blankInput();
    input.up = true;
    runSteps(game, audio, 46, input);
    return;
  }
  if (name === 'chase') {
    game.screen = SCREEN_PLAY;
    // Four stars on the east-west drag: the hero car out front in red,
    // four units strung out behind and to the sides — close enough to
    // read as a hunt, far enough back that the hero stays the subject.
    const hero = putPlayerInCar(game, 'sedan', 1330, WORLD.roadsY[2] + 24, 0, 330);
    hero.paint = '#d90429';
    game.wanted = 4.2;
    game.peakWanted = 4.2;
    game.lastCrime = 0;
    game.milestones.heat3 = true; // already earned before this frame
    game.milestones.sticky = true;
    const spots = [[-290, -54], [-345, 16], [-455, -48], [-540, 20]];
    for (const [dx, dy] of spots) {
      const cop = spawnPoliceCar(game.rng, player.x, player.y);
      cop.x = player.x + dx;
      cop.y = player.y + dy;
      cop.angle = 0;
      cop.vx = 300;
      cop.vy = 0;
      if (!game.cars.includes(cop)) game.cars.push(cop);
    }
    placeTraffic(game, 3, -1, 900, 'sedan');
    const input = blankInput();
    input.up = true;
    runSteps(game, audio, 30, input);
    return;
  }
  if (name === 'mission') {
    game.screen = SCREEN_PLAY;
    // Pulled up at the beacon in a car, the warehouse filling the frame
    // behind it, traffic rolling past on the harbour road, the objective
    // bar up: the delivery loop in one picture. The car stops just
    // outside the pickup radius so the beacon stays on the package.
    const target = game.missions.target();
    const car = putPlayerInCar(game, 'sedan', target.x - 72, WORLD.roadsY[4] + 24, 0, 0);
    car.paint = '#3f88c5';
    const passing = makeCar(game.rng, 'sedan', 'traffic');
    passing.axis = 'x';
    passing.roadIndex = 4;
    passing.dir = -1;
    passing.x = target.x + 300;
    passing.y = WORLD.roadsY[4] - 24;
    passing.angle = Math.PI;
    passing.speed = passing.cruise * 0.8;
    game.cars.push(passing);
    placeTraffic(game, 3, -1, 1700, 'taxi');
    runSteps(game, audio, 24, blankInput());
    return;
  }
  // title (and anything else): the boulevard at drift, traffic rolling by.
  game.screen = SCREEN_TITLE;
  game.time = 14;
  runSteps(game, audio, 50, blankInput());
}
