// The staged scenes behind ?shot=title|drive|chase|mission. Each one builds
// the real game from the shot's seed, arranges a moment the judge should
// see, and plays the real rules forward for a fixed number of steps — so a
// screenshot is the game itself, never a mock-up, and the same seed always
// gives the same frame.

import { WORLD } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, stepGame } from './game.js';
import { blankInput } from './input.js';
import { makeCar, spawnPoliceCar } from './entities.js';

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
    // East on the coast road in a red sports car, the beach and the sea
    // coming into frame, traffic passing the other way.
    const car = putPlayerInCar(game, 'sport', 2520, WORLD.roadsY[3] + 24, 0, 320);
    car.paint = '#d90429';
    const oncoming = makeCar(game.rng, 'sedan', 'traffic');
    oncoming.axis = 'x';
    oncoming.roadIndex = 3;
    oncoming.dir = -1;
    oncoming.x = 3180;
    oncoming.y = WORLD.roadsY[3] - 24;
    oncoming.angle = Math.PI;
    oncoming.speed = oncoming.cruise * 0.8;
    game.cars.push(oncoming);
    placeTraffic(game, 5, 1, 1230, 'taxi');
    const input = blankInput();
    input.up = true;
    runSteps(game, audio, 46, input);
    return;
  }
  if (name === 'chase') {
    game.screen = SCREEN_PLAY;
    // Four stars on the east-west drag: three units already on the tail.
    putPlayerInCar(game, 'sedan', 1330, WORLD.roadsY[2] + 24, 0, 330);
    game.wanted = 4.2;
    game.peakWanted = 4.2;
    game.lastCrime = 0;
    game.milestones.heat3 = true; // already earned before this frame
    game.milestones.sticky = true;
    const spots = [[-185, -54], [-238, 42], [-335, -10]];
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
    runSteps(game, audio, 40, input);
    return;
  }
  if (name === 'mission') {
    game.screen = SCREEN_PLAY;
    // On foot, a short walk from the package, the beacon in plain sight.
    const target = game.missions.target();
    player.x = target.x - 128;
    player.y = target.y + 92;
    player.angle = Math.atan2(target.y - player.y, target.x - player.x);
    game.camera.x = player.x + 60;
    game.camera.y = player.y - 30;
    runSteps(game, audio, 24, blankInput());
    return;
  }
  // title (and anything else): the boulevard at drift, traffic rolling by.
  game.screen = SCREEN_TITLE;
  game.time = 14;
  runSteps(game, audio, 50, blankInput());
}
