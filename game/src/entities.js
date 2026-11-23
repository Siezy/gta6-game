// The people and cars of Coral Bay. Traffic cars drive the road grid — along
// one road, turning at intersections, braking for whoever is ahead — and
// pedestrians walk the sidewalks around the buildings, flee danger and get
// back up after a knock. Police cars are made here too; their pursuit is
// steered by game.js, which knows where the player is.

import { CAR_PAINTS, CAR_TYPES, PEDS, TRAFFIC, WORLD } from './config.js';
import { collideCircle } from './city.js';
import { angleDelta, clamp, distance } from './random.js';

const LANE = 24; // lane offset from a road centre line, right-hand traffic

export function headingAngle(axis, dir) {
  if (axis === 'y') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function laneOffset(axis, dir) {
  // Right-hand traffic in screen space (y down): southbound keeps west,
  // eastbound keeps south.
  if (axis === 'y') return dir > 0 ? -LANE : LANE;
  return dir > 0 ? LANE : -LANE;
}

/** Snap a fresh traffic car onto its lane on the given road. */
function placeOnRoad(car, axis, roadIndex, dir, along) {
  car.axis = axis;
  car.roadIndex = roadIndex;
  car.dir = dir;
  const offset = laneOffset(axis, dir);
  if (axis === 'y') {
    car.x = WORLD.roadsX[roadIndex] + offset;
    car.y = along;
  } else {
    car.x = along;
    car.y = WORLD.roadsY[roadIndex] + offset;
  }
  car.angle = headingAngle(axis, dir);
  car.lastCross = '';
}

export function makeCar(rng, type, mode) {
  const spec = CAR_TYPES[type];
  return {
    x: 0, y: 0, angle: 0, speed: 0, vx: 0, vy: 0, dead: false,
    type, spec, mode,
    paint: mode === 'police' ? '#f4f6f8' : type === 'taxi' ? '#f2b134' : rng.pick(CAR_PAINTS),
    health: 100,
    axis: 'y', roadIndex: 0, dir: 1, lastCross: '',
    cruise: rng.range(TRAFFIC.cruiseMin, TRAFFIC.cruiseMax),
    brakeLight: false,
    stuckTime: 0,
    sirenPhase: rng.range(0, 6),
  };
}

/** A traffic car appearing on a road in the ring around (x, y), or null. */
export function spawnTrafficCar(rng, x, y) {
  for (let tries = 0; tries < 20; tries += 1) {
    const vertical = rng.chance(0.5);
    const roadIndex = vertical ? rng.int(0, WORLD.roadsX.length - 1) : rng.int(0, WORLD.roadsY.length - 1);
    const along = vertical ? rng.range(90, WORLD.height - 90) : rng.range(90, WORLD.beachX - 60);
    const px = vertical ? WORLD.roadsX[roadIndex] : along;
    const py = vertical ? along : WORLD.roadsY[roadIndex];
    const d = distance(px, py, x, y);
    if (d < TRAFFIC.spawnFar || d > TRAFFIC.spawnNear) continue;
    const type = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'van']);
    const car = makeCar(rng, type, 'traffic');
    placeOnRoad(car, vertical ? 'y' : 'x', roadIndex, rng.chance(0.5) ? 1 : -1, along);
    car.speed = car.cruise * 0.7;
    return car;
  }
  return null;
}

/** A parked car for a parking lot or a street edge. */
export function spawnParkedCar(rng, lot) {
  const type = rng.pick(['sedan', 'sedan', 'taxi', 'sport', 'van']);
  const car = makeCar(rng, type, 'parked');
  car.x = lot.x + rng.range(30, Math.max(31, lot.w - 30));
  car.y = lot.y + rng.range(26, Math.max(27, lot.h - 26));
  car.angle = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + rng.range(-0.06, 0.06);
  return car;
}

export function spawnPoliceCar(rng, x, y) {
  for (let tries = 0; tries < 20; tries += 1) {
    const vertical = rng.chance(0.5);
    const roadIndex = vertical ? rng.int(0, WORLD.roadsX.length - 1) : rng.int(0, WORLD.roadsY.length - 1);
    const along = vertical ? rng.range(90, WORLD.height - 90) : rng.range(90, WORLD.beachX - 60);
    const px = vertical ? WORLD.roadsX[roadIndex] : along;
    const py = vertical ? along : WORLD.roadsY[roadIndex];
    const d = distance(px, py, x, y);
    if (d < 430 || d > 760) continue;
    const car = makeCar(rng, 'police', 'police');
    placeOnRoad(car, vertical ? 'y' : 'x', roadIndex, rng.chance(0.5) ? 1 : -1, along);
    return car;
  }
  // Fallback: the far corner of the grid from the player.
  const car = makeCar(rng, 'police', 'police');
  placeOnRoad(car, 'y', x < WORLD.width / 2 ? WORLD.roadsX.length - 1 : 0, 1, y < WORLD.height / 2 ? WORLD.height - 200 : 200);
  return car;
}

/** Is something solid enough to brake for directly ahead of this car? */
function blockerAhead(car, cars, peds) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let slowest = Infinity;
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * cos + dy * sin;
    const lateral = -dx * sin + dy * cos;
    if (forward > 6 && forward < 84 && Math.abs(lateral) < 21) {
      slowest = Math.min(slowest, Math.max(0, other.speed));
      if (forward < 42) slowest = 0;
    }
  }
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const forward = dx * cos + dy * sin;
    const lateral = -dx * sin + dy * cos;
    if (forward > 4 && forward < 52 && Math.abs(lateral) < 17) slowest = 0;
  }
  return slowest;
}

export function updateTrafficCar(car, dt, cars, peds, rng) {
  const blocked = blockerAhead(car, cars, peds);
  const target = Math.min(car.cruise, blocked);
  car.brakeLight = target < car.speed - 6;
  if (car.speed < target) car.speed = Math.min(target, car.speed + car.spec.accel * 0.55 * dt);
  else car.speed = Math.max(target, car.speed - car.spec.brake * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;

  // Turning: crossing the centre line of a road on the other axis.
  const crossRoads = car.axis === 'y' ? WORLD.roadsY : WORLD.roadsX;
  const along = car.axis === 'y' ? car.y : car.x;
  for (let i = 0; i < crossRoads.length; i += 1) {
    if (Math.abs(along - crossRoads[i]) > car.spec.length * 0.4) continue;
    const key = `${car.axis}:${car.roadIndex}:${i}`;
    if (car.lastCross === key) return;
    car.lastCross = key;
    if (rng.chance(0.34)) {
      const crossIndex = i;
      const newDir = rng.chance(0.5) ? 1 : -1;
      if (car.axis === 'y') {
        const alongRoad = WORLD.roadsX[car.roadIndex];
        placeOnRoad(car, 'x', crossIndex, newDir, alongRoad);
      } else {
        const alongRoad = WORLD.roadsY[car.roadIndex];
        placeOnRoad(car, 'y', crossIndex, newDir, alongRoad);
      }
      car.speed *= 0.55;
    }
    return;
  }
  // Ran off the end of a road (the grid edges): turn around.
  if (car.x < 60 || car.x > WORLD.beachX - 20 || car.y < 60 || car.y > WORLD.height - 60) {
    car.dir *= -1;
    placeOnRoad(car, car.axis, car.roadIndex, car.dir, car.axis === 'y' ? clamp(car.y, 90, WORLD.height - 90) : clamp(car.x, 90, WORLD.beachX - 90));
  }
}

const PED_PAINTS = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#c8b6ff', '#8ac926', '#ffca3a'];

export function makePed(rng, city) {
  const anchor = rng.pick(city.buildings.length > 0 ? city.buildings : [{ x: 800, y: 800, w: 100, h: 100 }]);
  const ped = {
    x: 0, y: 0, angle: rng.range(0, Math.PI * 2),
    state: 'walk', stateTime: 0,
    anchor, corner: rng.int(0, 3),
    paint: rng.pick(PED_PAINTS),
    fleeX: 0, fleeY: 0,
    speed: PEDS.walkSpeed * rng.range(0.8, 1.2),
  };
  const target = pedCorner(ped);
  ped.x = target.x;
  ped.y = target.y;
  return ped;
}

/** The sidewalk corner a pedestrian is heading for, around its building. */
export function pedCorner(ped) {
  const b = ped.anchor;
  const out = 15;
  const corners = [
    { x: b.x - out, y: b.y - out },
    { x: b.x + b.w + out, y: b.y - out },
    { x: b.x + b.w + out, y: b.y + b.h + out },
    { x: b.x - out, y: b.y + b.h + out },
  ];
  return corners[ped.corner % 4];
}

export function scarePed(ped, fromX, fromY, seconds = 3.5) {
  if (ped.state === 'down') return;
  ped.state = 'flee';
  ped.stateTime = seconds;
  ped.fleeX = fromX;
  ped.fleeY = fromY;
}

export function knockDownPed(ped, seconds = 7) {
  ped.state = 'down';
  ped.stateTime = seconds;
}

export function updatePed(ped, dt, city) {
  ped.stateTime -= dt;
  if (ped.state === 'down') {
    if (ped.stateTime <= 0) {
      ped.state = 'flee';
      ped.stateTime = 2.2;
      ped.fleeX = ped.x + 60;
      ped.fleeY = ped.y;
    }
    return;
  }
  let targetX;
  let targetY;
  let speed;
  if (ped.state === 'flee') {
    const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
    targetX = ped.x + Math.cos(away) * 120;
    targetY = ped.y + Math.sin(away) * 120;
    speed = PEDS.fleeSpeed;
    if (ped.stateTime <= 0) ped.state = 'walk';
  } else {
    const corner = pedCorner(ped);
    targetX = corner.x;
    targetY = corner.y;
    speed = ped.speed;
    if (distance(ped.x, ped.y, targetX, targetY) < 7) {
      ped.corner = (ped.corner + 1) % 4;
      return;
    }
  }
  const wanted = Math.atan2(targetY - ped.y, targetX - ped.x);
  ped.angle += clamp(angleDelta(ped.angle, wanted), -7 * dt, 7 * dt);
  const nx = ped.x + Math.cos(ped.angle) * speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * speed * dt;
  const resolved = collideCircle(city, nx, ny, 11);
  ped.x = resolved.x;
  ped.y = resolved.y;
}
