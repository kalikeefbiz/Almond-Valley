# Almond Valley — Art Direction

A grounded industrial frontier settlement in a red desert canyon under twin suns. The Heartwell is the
landmark; everything else is weathered, hand-built and warm. Readability on a phone at the default camera
comes before detail.

## Palette

| Role | Colour | Used for |
|---|---|---|
| Sandstone | `#94492f` – `#c77a4f`, pale bands `#e0a875` | canyon walls, strata |
| Valley dirt | `#8a694f` – `#b38f6b` | buildable floor |
| Road dust | `#b39270` – `#d1b28a` | worn paths |
| Timber | `#8f5d38`, dark `#5c3a24`, plank `#a87748` | walls, frames, decks |
| Rust roof | `#7a4a36`, `#553a32`, tin `#8b8580` | corrugated roofs |
| Stone | `#9a8f80`, dark `#736a5e` | footings, chimneys, viaduct |
| Black alloy | `#2e2e33`, light `#4a4b52` | Heartwell, machinery, stacks |
| Brass / gold | `#b58a3e`, hazard yellow `#d69a22` | trim, bands, the Heartwell crown |
| Water / aether | `#2596b8` pools, `#62e8ff` glow | pools, sight glasses, coolant |
| Lamp | `#ffc266` | windows, lanterns, street lamps |
| Oxblood | `#6b1a12` with gold emblem | banners |

Cyan is reserved for water and aether, gold for the Heartwell and civic trim. Greenery appears only on the
canyon rim and in crops.

## Materials

Every procedural surface uses one shader (`src/surface.js`) and one 9-layer detail texture generated at
start-up (no downloads): plain, wood planks, stone blocks, corrugated iron, riveted plate, dirt, canyon
rock, cloth, banner emblem. A surface is vertex colour × detail layer, with bump from the layer's height,
grime toward the ground, a night glow channel for windows and lamps, and shared haze. Detail fades with
distance so roofs stay calm at the default zoom.

The five Meshy models and the Master Clicker keep their baked textures but join the same lighting, haze
and night window glow (`joinAtmosphere`).

## Lighting

- Key light always comes from the suns' side (north) and stays low, so shadows are long and fall toward
  the camera. Warm bounce fill from the opposite side; sky/ground hemisphere ambient.
- **Day**: warm white key, pale blue sky ambient, light haze on the valley floor.
- **Golden hour (about 17:00–19:00)**: the signature look. Orange key, lamps and windows come on, sky
  goes amber to violet.
- **Night**: blue moonlight, warm lamp pools on the ground, halo sprites on lanterns, cyan Heartwell glow.
- **Double Noon**: key swings overhead, exposure and haze rise, colours bleach.
- Glow is done without post-processing: emissive vertex channel, additive halo points, and lamp pools
  painted into the ground mask. A screen-space vignette frames the view (off on the low tier).

## Ground

One terrain mesh. Colour is computed per pixel: stepped strata on the cliffs, packed dirt on the floor,
dry scrub on the rim. A 256×256 settlement mask is redrawn when the settlement changes: roads (worn dirt
with soft edges), building aprons (trodden, darker ground that anchors each building), lamp light.

## Assets by category

| Category | Approach |
|---|---|
| Heartwell | Procedural, modular (`src/heartwell.js`): core, two turbines with wheels, silos, pump house, pool ring, banners. One material per simulated component so wear and breakdowns show where they happen. |
| Housing | Procedural, four tiers: lean-to shelter → timber home with porch → stone-footed insulated home → climate home with plant and tanks. |
| Industry / civic | Procedural from shared parts (shed, stack, tank, canopy, crates), plus the five existing Meshy models. |
| Terrain, roads | Shader. |
| Props | Instanced: street lamps, scrub, stones, pipes. |
| Viaduct | Procedural stone piers and arches with deck lamps. |

## Quality tiers

- **Low**: no bump detail, no clouds, no vignette, shadows off.
- **Medium**: full surface detail, 1024 shadow map.
- **High**: 2048 shadow map.
