// Coral Bay: the city itself. A seeded generator lays a road grid over the
// world, fills the blocks between roads with pastel buildings (some of them
// named landmarks), leaves a park and parking lots open, and ends the east
// side in a beach and open water. It also answers the world's spatial
// questions: what is solid, what is road, where a car may appear.

import { WORLD } from './config.js';
import { clamp } from './random.js';

const ROOF_PAINTS = ['#e88bb0', '#57b8a2', '#ecd9a0', '#ef8354', '#9b8cd9', '#f4f1de', '#81b29a', '#e07a5f', '#6fb3d8', '#d9a05b'];
const WALL_SHADE = 0.82;

// Landmark cells, by (column, row) of the block grid: one named building each.
const LANDMARKS = {
  '5,1': { name: 'Ocean Palms Hotel', paint: '#f2cc8f', kind: 'hotel' },
  '2,1': { name: 'Vice National Bank', paint: '#c9d6df', kind: 'bank' },
  '1,2': { name: 'Marina Diner', paint: '#ef8354', kind: 'diner' },
  '3,2': { name: 'Palm Court Mall', paint: '#81b29a', kind: 'mall' },
  '4,3': { name: 'Neon Nights Club', paint: '#9b8cd9', kind: 'club' },
  '0,3': { name: 'Coral Bay PD', paint: '#8fa6c9', kind: 'police' },
  '2,4': { name: 'Harbor Warehouse', paint: '#a26769', kind: 'warehouse' },
  '4,0': { name: 'Sunset Auto Garage', paint: '#e07a5f', kind: 'garage' },
  '1,4': { name: 'Coral Bay Hospital', paint: '#f4f1de', kind: 'hospital' },
  '5,3': { name: 'Beachcomber Suites', paint: '#e88bb0', kind: 'hotel' },
};

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

/** The block cells between the roads: {x, y, w, h, col, row}. */
function blockCells() {
  const half = WORLD.roadWidth / 2;
  const inset = 16;
  const cells = [];
  const xEdges = [];
  for (let i = 0; i < WORLD.roadsX.length - 1; i += 1) {
    xEdges.push([WORLD.roadsX[i] + half + inset, WORLD.roadsX[i + 1] - half - inset]);
  }
  xEdges.push([WORLD.roadsX[WORLD.roadsX.length - 1] + half + inset, WORLD.beachX - 26]);
  const yEdges = [];
  for (let i = 0; i < WORLD.roadsY.length - 1; i += 1) {
    yEdges.push([WORLD.roadsY[i] + half + inset, WORLD.roadsY[i + 1] - half - inset]);
  }
  yEdges.push([WORLD.roadsY[WORLD.roadsY.length - 1] + half + inset, WORLD.height - 120]);
  for (let col = 0; col < xEdges.length; col += 1) {
    for (let row = 0; row < yEdges.length; row += 1) {
      cells.push({
        x: xEdges[col][0],
        y: yEdges[row][0],
        w: xEdges[col][1] - xEdges[col][0],
        h: yEdges[row][1] - yEdges[row][0],
        col,
        row,
      });
    }
  }
  return cells;
}

function fillCell(city, cell, rng) {
  const key = `${cell.col},${cell.row}`;
  const landmark = LANDMARKS[key];
  const pad = 12;
  if (landmark) {
    const building = {
      x: cell.x + pad, y: cell.y + pad,
      w: cell.w - pad * 2, h: cell.h - pad * 2,
      paint: landmark.paint, wall: shade(landmark.paint, WALL_SHADE),
      name: landmark.name, kind: landmark.kind, seed: rng.int(1, 99999),
    };
    city.buildings.push(building);
    city.landmarks.push(building);
    return;
  }
  const roll = rng.next();
  if (roll < 0.09) {
    city.parks.push({ x: cell.x, y: cell.y, w: cell.w, h: cell.h });
    const trees = rng.int(7, 12);
    for (let i = 0; i < trees; i += 1) {
      city.trees.push({
        x: cell.x + rng.range(24, cell.w - 24),
        y: cell.y + rng.range(24, cell.h - 24),
        r: rng.range(13, 22),
      });
    }
    return;
  }
  if (roll < 0.2) {
    city.parkingLots.push({ x: cell.x, y: cell.y, w: cell.w, h: cell.h });
    return;
  }
  const layout = rng.int(1, 3);
  const gap = 16;
  const plots = [];
  if (layout === 1) {
    plots.push([cell.x + pad, cell.y + pad, cell.w - pad * 2, cell.h - pad * 2]);
  } else if (layout === 2) {
    const w = (cell.w - pad * 2 - gap) / 2;
    plots.push([cell.x + pad, cell.y + pad, w, cell.h - pad * 2]);
    plots.push([cell.x + pad + w + gap, cell.y + pad, w, cell.h - pad * 2]);
  } else {
    const w = (cell.w - pad * 2 - gap) / 2;
    const h = (cell.h - pad * 2 - gap) / 2;
    plots.push([cell.x + pad, cell.y + pad, w, h]);
    plots.push([cell.x + pad + w + gap, cell.y + pad, w, h]);
    plots.push([cell.x + pad, cell.y + pad + h + gap, w, h]);
    plots.push([cell.x + pad + w + gap, cell.y + pad + h + gap, w, h]);
  }
  for (const [x, y, w, h] of plots) {
    if (w < 60 || h < 50) continue;
    const paint = rng.pick(ROOF_PAINTS);
    city.buildings.push({
      x, y, w, h,
      paint, wall: shade(paint, WALL_SHADE),
      name: null, kind: 'block', seed: rng.int(1, 99999),
    });
  }
}

export function buildCity(rng) {
  const city = {
    buildings: [],
    landmarks: [],
    parks: [],
    parkingLots: [],
    trees: [],
    locations: [],
  };
  for (const cell of blockCells()) fillCell(city, cell, rng);

  // Beach palms along the sand.
  for (let y = 140; y < WORLD.height - 120; y += rng.range(120, 210)) {
    city.trees.push({ x: WORLD.beachX + rng.range(30, 130), y, r: rng.range(12, 18) });
  }

  // Mission locations: street corners and open ground a car can reach.
  const named = (kind) => city.landmarks.find((b) => b.kind === kind);
  const corner = (building, dx, dy) => ({ x: building.x + dx, y: building.y + dy });
  const spots = [
    { name: 'Ocean Palms Hotel', at: corner(named('hotel'), -26, 40) },
    { name: 'Vice National Bank', at: corner(named('bank'), 60, -26) },
    { name: 'Marina Diner', at: corner(named('diner'), -26, 60) },
    { name: 'Palm Court Mall', at: corner(named('mall'), 80, -26) },
    { name: 'Neon Nights Club', at: corner(named('club'), -26, 50) },
    { name: 'Harbor Warehouse', at: corner(named('warehouse'), 70, -26) },
    { name: 'Sunset Auto Garage', at: corner(named('garage'), -26, 60) },
    { name: 'Beachcomber Suites', at: { x: 2992, y: 1620 } },
    { name: 'Coral Bay Marina', at: { x: 3020, y: WORLD.height - 170 } },
    { name: 'Palm Park', at: city.parks.length > 0
      ? { x: city.parks[0].x + 30, y: city.parks[0].y + 30 }
      : { x: 900, y: 900 } },
  ];
  city.locations = spots.map((spot, index) => ({ id: index, name: spot.name, x: spot.at.x, y: spot.at.y }));

  const pd = named('police');
  city.policeStation = { x: pd.x - 30, y: pd.y + 40 };
  const hospital = named('hospital');
  city.hospital = { x: hospital.x - 30, y: hospital.y + 40 };
  city.spawnPoint = { x: 2720, y: 1140 }; // on the boulevard by the beach
  return city;
}

/** True when the point is inside any building (with a margin). */
export function pointInBuilding(city, x, y, margin = 0) {
  for (const b of city.buildings) {
    if (x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + b.h + margin) {
      return b;
    }
  }
  return null;
}

/**
 * Push a circle at (x, y) out of every building and keep it inside the world
 * and out of the water. Returns the corrected position and whether it hit.
 */
export function collideCircle(city, x, y, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const nearX = clamp(x, b.x, b.x + b.w);
    const nearY = clamp(y, b.y, b.y + b.h);
    const dx = x - nearX;
    const dy = y - nearY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nearX + (dx / d) * radius;
      y = nearY + (dy / d) * radius;
    } else {
      // Centre inside the building: leave by the shallowest side.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const shallowest = Math.min(left, right, top, bottom);
      if (shallowest === left) x = b.x - radius;
      else if (shallowest === right) x = b.x + b.w + radius;
      else if (shallowest === top) y = b.y - radius;
      else y = b.y + b.h + radius;
    }
  }
  const maxX = WORLD.waterX - radius;
  if (x > maxX) { x = maxX; hit = true; }
  if (x < radius) { x = radius; hit = true; }
  if (y < radius) { y = radius; hit = true; }
  if (y > WORLD.height - radius) { y = WORLD.height - radius; hit = true; }
  return { x, y, hit };
}

/** True when the point is on a road surface. */
export function onRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  for (const rx of WORLD.roadsX) if (Math.abs(x - rx) <= half) return true;
  for (const ry of WORLD.roadsY) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** A random point on a road within [minD, maxD] of (x, y), or null. */
export function roadPointNear(rng, x, y, minD, maxD) {
  for (let tries = 0; tries < 24; tries += 1) {
    const vertical = rng.chance(0.5);
    const along = rng.range(80, vertical ? WORLD.height - 160 : WORLD.beachX - 80);
    const across = rng.range(-26, 26);
    const px = vertical ? rng.pick(WORLD.roadsX) + across : along;
    const py = vertical ? along : rng.pick(WORLD.roadsY) + across;
    const d = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
    if (d >= minD && d <= maxD) return { x: px, y: py };
  }
  return null;
}

/** Every intersection of the road grid. */
export function intersections() {
  const points = [];
  for (const x of WORLD.roadsX) {
    for (const y of WORLD.roadsY) points.push({ x, y });
  }
  return points;
}
