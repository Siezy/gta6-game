# Vice Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Siezy/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Siezy/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Vice Heat** is a complete little open-world crime game, built by an AI agent
for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01), where
agents compete for real prize money. It plays offline in a desktop browser
from static files — no build step, no network requests, no libraries.

Welcome to **Coral Bay**: a sun-soaked grid of pastel hotels, banks, diners
and warehouses between the boulevard and the beach. You arrive with $60 and a
phone number. Marina Vale, who runs packages out of the Marina Diner, always
has another envelope that needs to be somewhere else — fast, quiet, and
preferably without the Coral Bay PD noticing.

## What's in the world

- **A city, on foot and by car** — a seeded road grid with named landmarks
  (Ocean Palms Hotel, Vice National Bank, Palm Court Mall, Neon Nights Club,
  Coral Bay PD, the hospital, the harbor), a park, parking lots, a beach and
  the sea, all wrapped in a scrolling camera.
- **Cars to steal and drive** — sedans, taxis, sports cars and vans, each
  with its own pace and manners, plus parked cars waiting in lots. Traffic
  drives the grid, turns at intersections and brakes for whoever is ahead;
  drivers bail out and run when you take their car.
- **Pedestrians** who stroll the sidewalks, flee from danger and get up
  again after a knock.
- **A wanted level and police who answer it** — crimes raise stars only when
  witnessed; units spawn, pursue, and try to pin you. Lie low and unseen to
  cool the heat. Get pinned and you're **BUSTED** (the PD fines you); get
  flattened and you're **WASTED** (the hospital bills you).
- **Missions and a story** — Marina's delivery loop: pick the package up at
  the gold beacon, drop it across town, earn by distance with a bonus for
  beating the clock, plus mayhem milestones (first lift, three stars, the
  clean getaway) that pay out as you play.
- **Combat** — a pistol on foot, mouse-aimed, with tracers, muzzle flash and
  consequences.
- **A HUD with a minimap** — cash, health, car condition, wanted stars, a
  bust meter under pressure, speedometer, objective bar with Marina's brief,
  an off-screen objective arrow, and a live minimap with the target and the
  police on it.
- **Sound** — tiny WebAudio bleeps: engine hum, a two-tone siren that swells
  as a unit closes in, crashes, shots, and the cash register of a clean run.
- **A save** — cash and deliveries persist between visits (localStorage).

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | walk and drive |
| SHIFT | run |
| E or F | enter / exit a car |
| Mouse + click | aim and shoot on foot |
| SPACE | handbrake |
| H | help |
| P / ESC | pause |
| M | mute |

## Play it

```sh
node serve.ts            # then open http://localhost:8080
```

Any static file server pointed at `game/` works just as well.

## How the entry is put together

- `main.ts` — the hand-in program (Node 22, standard library only): copies
  `game/` and `screenshots/` to the output directory and writes
  `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.
- `vendor/makefun-game.ts` — the kit's dossier library, copied unchanged.
- `game/` — the game itself, plain static files:
  - `src/config.js` — tuning: the world, the player, the cars, the law.
  - `src/city.js` — the seeded Coral Bay generator and its spatial rules.
  - `src/entities.js` — traffic cars, pedestrians, and how they behave.
  - `src/missions.js` — Marina's delivery loop and her brief.
  - `src/game.js` — the simulation: driving, collisions, gunfire, wanted,
    police, busted and wasted, the camera.
  - `src/render.js` — the pre-rendered city, the HUD and minimap, screens.
  - `src/audio.js` — the WebAudio bleeps.
  - `src/input.js` — keyboard and mouse, sampled per frame.
  - `src/shots.js` — the staged scenes behind the screenshots.
  - `src/main.js` — boot and the fixed-step frame loop.
- `screenshots/` — real renders of the game, staged deterministically with
  `shots.json`: the coast-road drive (cover), a four-star chase, a mission
  pickup, and the title screen.

Every street, car, name and line in Coral Bay is original to this game.
