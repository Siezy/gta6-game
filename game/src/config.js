// Vice Heat — tuning constants: the world, the player, the cars, the law.
// Everything gameplay-shaped lives here so the rest of the code reads as rules,
// not numbers.

export const WORLD = {
  width: 3680,
  height: 2480,
  beachX: 3160, // sand starts here
  waterX: 3400, // open water starts here; nobody drives or walks past it
  roadWidth: 96,
  // Road centre lines. Blocks of city sit between consecutive roads.
  roadsX: [200, 660, 1120, 1580, 2040, 2500, 2960],
  roadsY: [200, 640, 1080, 1520, 1960],
};

export const STEP = 1 / 60; // fixed simulation step, seconds

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  runSpeed: 262,
  maxHealth: 100,
  regenPerSecond: 5,
  regenDelay: 5, // seconds without damage before health comes back
  enterCarRange: 58, // how close to a car door E works from
};

export const GUN = {
  range: 340,
  cooldown: 0.19,
  spread: 0.035,
};

// Car archetypes: size, pace and manners. `score` is what the traffic spawner
// spends; police use their own row.
export const CAR_TYPES = {
  sedan: { length: 46, width: 23, topSpeed: 305, reverseSpeed: 95, accel: 205, brake: 430, turn: 2.6, grip: 7.5, weight: 1 },
  taxi: { length: 46, width: 23, topSpeed: 322, reverseSpeed: 95, accel: 220, brake: 430, turn: 2.6, grip: 7.5, weight: 1 },
  sport: { length: 44, width: 22, topSpeed: 478, reverseSpeed: 110, accel: 335, brake: 520, turn: 3.1, grip: 6.4, weight: 0.9 },
  van: { length: 56, width: 26, topSpeed: 252, reverseSpeed: 80, accel: 140, brake: 380, turn: 2.1, grip: 8.0, weight: 1.5 },
  police: { length: 47, width: 23, topSpeed: 438, reverseSpeed: 105, accel: 305, brake: 500, turn: 2.9, grip: 7.2, weight: 1.1 },
};

export const CAR_PAINTS = ['#e8e3d8', '#c94f6d', '#3f88c5', '#f2b134', '#57b8a2', '#7d5ba6', '#e07a3f', '#4a4e69', '#84a98c', '#d90429', '#118ab2', '#ffd166'];

export const TRAFFIC = {
  maxCars: 15,
  spawnNear: 980, // spawn on roads within this ring of the player
  spawnFar: 560,
  despawn: 1250,
  cruiseMin: 130,
  cruiseMax: 215,
};

export const PEDS = {
  max: 26,
  walkSpeed: 62,
  fleeSpeed: 168,
  spawnNear: 900,
  despawn: 1200,
};

export const WANTED = {
  max: 5,
  witnessRadius: 320, // a crime inside this ring of a ped or cop is seen
  copSightRadius: 470, // a cop inside this ring can see the player at all
  quietSeconds: 7, // no crime and unseen for this long starts the cooldown
  starDecaySeconds: 6.5, // per star, once cooling down
  bustOnFootSeconds: 1.15, // cop this close, this long, player on foot: busted
  bustInCarSeconds: 2.1, // player crawling with a cop alongside: busted
  bustRadius: 64,
};

// Crime weights, in stars.
export const CRIME = {
  stealCar: 1,
  hitPedestrian: 1,
  killPedestrian: 1, // on top of hitPedestrian when the hit is hard
  hitCar: 0.5,
  shotFired: 0.5,
  shotHitsCar: 0.5,
  shotHitsPedestrian: 1,
};

export const ECONOMY = {
  deliveryBase: 110,
  deliveryPerPixel: 0.055,
  timedBonusRate: 0.45,
  bustedFineRate: 0.15,
  bustedFineMin: 40,
  wastedFeeRate: 0.1,
};

export const SAVE_KEY = 'vice-heat-save-v1';
