// Marina's delivery loop: the game's spine. Marina Vale runs "errands" out of
// the Marina Diner — pick a package up at one Coral Bay landmark, drop it at
// another, get paid by distance with a bonus for beating the clock. The first
// run is scripted as an introduction; after that the city deals the pairs.

import { ECONOMY } from './config.js';
import { distance } from './random.js';

const INTRO_LINES = [
  'Marina: You look like someone who drives. Take this to the Ocean Palms — no questions.',
  'Marina: Good hands. There is always another package, always another door.',
  'Marina: The city pays people who do not get caught. Remember that.',
  'Marina: Half of Coral Bay owes me a favour. You are how I collect.',
];

const RUN_LINES = [
  'Marina: Quick one. In and out, nobody sees a thing.',
  'Marina: This one is warm. Do not let it cool down.',
  'Marina: Different door, same rules: fast, quiet, paid.',
  'Marina: A friend of a friend needs this across town.',
  'Marina: Clock is running, sweetheart.',
];

export function createMissions(city, rng) {
  const missions = {
    stage: 'pickup', // 'pickup' | 'deliver'
    from: null,
    to: null,
    pay: 0,
    par: 60,
    elapsed: 0,
    completed: 0,
    brief: INTRO_LINES[0],
    lastPayout: 0,
    lastBonus: 0,
  };

  function deal(first) {
    const spots = city.locations;
    if (first) {
      missions.from = spots.find((s) => s.name === 'Harbor Warehouse') ?? spots[0];
      missions.to = spots.find((s) => s.name === 'Ocean Palms Hotel') ?? spots[1];
    } else {
      let a = rng.pick(spots);
      let b = rng.pick(spots);
      let guard = 0;
      while ((b === a || distance(a.x, a.y, b.x, b.y) < 620) && guard < 12) {
        b = rng.pick(spots);
        guard += 1;
      }
      missions.from = a;
      missions.to = b;
      missions.brief = missions.completed < INTRO_LINES.length
        ? INTRO_LINES[missions.completed]
        : rng.pick(RUN_LINES);
    }
    const trip = distance(missions.from.x, missions.from.y, missions.to.x, missions.to.y);
    missions.pay = Math.round(ECONOMY.deliveryBase + trip * ECONOMY.deliveryPerPixel);
    missions.par = Math.round(trip / 195 + 34);
    missions.elapsed = 0;
    missions.stage = 'pickup';
  }

  missions.deal = () => deal(false);
  deal(true);

  /** The point the HUD and the beacon point at right now. */
  missions.target = () => (missions.stage === 'pickup' ? missions.from : missions.to);

  missions.objectiveText = () => {
    const target = missions.target();
    if (missions.stage === 'pickup') return `Pick up the package at ${target.name}`;
    return `Deliver to ${target.name} — $${missions.pay} (+bonus under ${missions.par}s)`;
  };

  /** Called when the player reaches the current target. Returns a result to announce, or null. */
  missions.reachTarget = () => {
    if (missions.stage === 'pickup') {
      missions.stage = 'deliver';
      missions.elapsed = 0;
      return { kind: 'pickup', text: `Package collected — get it to ${missions.to.name}` };
    }
    const inTime = missions.elapsed <= missions.par;
    const bonus = inTime ? Math.round(missions.pay * ECONOMY.timedBonusRate) : 0;
    const total = missions.pay + bonus;
    missions.lastPayout = total;
    missions.lastBonus = bonus;
    missions.completed += 1;
    deal(false);
    return {
      kind: 'delivered',
      text: bonus > 0 ? `Delivered in time — $${total} (bonus $${bonus})` : `Delivered — $${total}`,
      amount: total,
    };
  };

  missions.update = (dt) => {
    if (missions.stage === 'deliver') missions.elapsed += dt;
  };

  return missions;
}
