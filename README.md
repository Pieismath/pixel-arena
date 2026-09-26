# Rucker Park — pickup basketball

A playable voxel streetball world with the sand/charcoal direction of Rucker Park’s 2021 court and a dense, art-directed Harlem neighborhood, built with Vite, TypeScript and three.js. Fictional brands can appear on crowd shirts and cards, fence banners, wall murals, the big screen and the court name. Every sellable surface is repainted from runtime data.

This is a frontend preview. Checkout does not take payment or save ownership, and this build has not been published to a production domain. Demo brands, activity and preview prices are labeled in the interface, trailer and downloaded spot cards.

| Spot | Intended purchase model | Preview starting price |
|---|---|---|
| Seat | One-time; a fan wears the brand's colors and holds its card. Blocks of cards can spell a logo. | $5 |
| Banner | Vinyl banner on a sideline barrier or end fence; takeover at 1.25× its last price. | $25 |
| Mural | Painted brand mural on the handball or corner-store wall; takeover at 1.25×. | $50 |
| Big screen | A daily ad rotation between game scores. | $29/day |
| Court name | Featured sponsor on center court, sidelines and scoreboard header; Rucker Park remains the location; takeover at 1.25×. | $100 |

Prices and takeover rounding live in `src/config.ts`. The purchase model is illustrative until a backend and payments are implemented.

## Run locally

```bash
npm ci
npm run dev        # http://localhost:5190
npm run typecheck  # TypeScript checks without bundling
npm run build      # TypeScript checks + production files in dist/
npm run preview    # serves dist/ at http://localhost:5191
```

Blender is needed only to regenerate the included models, not to run the browser app. The local preview URL is not a public deployment. A production host would serve the generated `dist/` directory.

## Explore and capture

Drag the court to orbit, use the wheel or pinch to zoom, and click or tap a sellable spot. The Brand spots button opens the spot dock; the Spot holders panel offer another way to select seats, banners, murals, the screen and naming rights. On narrow screens, the bottom spot buttons scroll horizontally.

| Control | Behavior |
|---|---|
| Overview / `1` | Return to the wide court view. |
| Courtside / `2` | Follow the active player; dragging stops camera following. |
| Crowd / `3` | Move to the north bleachers. |
| Play a highlight / `H` | Start a repeatable drive-and-dunk sequence and follow the action. |
| Trailer / `T` | Run the cinematic camera sequence with the main interface hidden. A preview disclosure and exit control remain visible. |
| Exit trailer / `T` / `Esc` | Leave the cinematic view. Outside trailer mode, `Esc` closes panels. |
| Take the ball | Switch from autoplay to controlling the player with possession. |
| WASD / arrows | Move the ball handler in court coordinates. Touch uses the direction pad. |
| Space / Shoot | Shoot, or dunk when near the rim. |
| E / Pass | Pass to a teammate. |
| Q / Crossover | Change hands. |
| `W` outside manual play | Start a crowd wave. |
| Record 12s | Record live WebGL gameplay locally and preview/save the video. Hiding the page stops the recording. |
| Demo button | Switch between fictional occupied spots and the empty preview court. |
| Download spot card | Open a PNG preview for the selected spot, then choose Save PNG or long-press on mobile. Uses a dedicated camera, brand details and preview disclosure. |
| Preview a court takeover | In the court-name panel, temporarily rename the court to a fictional brand and celebrate. The original state returns after eight seconds. |

Spot cards use the current viewport orientation: landscape cards are 1600×1000 and portrait cards are 1080×1350. They capture the 3D scene without the interface or selection highlight; screen cards show the ad rather than whichever score frame happens to be playing. Exports happen locally. Record 12s encodes a browser-supported WebM or MP4 clip from the actual renderer with a baked-in fictional-game label. It never uploads footage.

The takeover preview makes no purchase or persistent state change. Only the Demo preference is stored locally when storage is available.

## URL options

Options can be combined, for example `http://localhost:5190/?demo=1&view=courtside&highlight=1`.

| Option | Behavior |
|---|---|
| `demo=1` / `demo=0` | Start with fictional demo brands or the empty preview. Overrides the saved Demo preference for that load. |
| `quality=high` / `quality=low` | Force a graphics tier and disable automatic quality reduction. |
| `view=overview` / `view=courtside` / `view=crowd` | Choose the initial camera view. Desktop starts in Overview; portrait screens start Courtside. |
| `highlight=1` | Start a highlight on load. |
| `trailer=1` | Start in cinematic mode. |
| `inspect=1` | Show a 30-second frame-time sample after warm-up: FPS, median/p95 time, draw calls, triangles, viewport and quality. Use a forced quality tier for comparisons. |
| `audit=1` | Expose visible controls for pass/make/miss/dunk/rebound/reset/crossover and the authoritative ball-state snapshot. |
| `preview=1` | Open a labeled static preview with a link back to lighter interactive graphics. |
| `still=<seconds>` | Development server only: stop simulation time at a positive number of seconds for repeatable screenshots. Ignored in production builds. |

A development screenshot example is `http://localhost:5190/?demo=1&highlight=1&trailer=1&still=2.3`. Camera settling, asynchronous artwork/font loading and viewport dimensions still affect the final image.

## Rendering and mobile behavior

The court follows the sand/charcoal 2021 palette, close dark bleachers, central ochre stair, compact supported scoreboard, glass goals, tubular rims, rope nets, black fencing, mature branching trees and open Harlem streetscape. The surrounding blocks are now deliberately denser than the original reconstruction, with modeled sash windows, storefronts, fire escapes, roof services and lofted cars. This is an artistic setting, not a surveyed replica. See [reference notes](work/rucker-reference.md).

Athletes use original voxel meshes, stepped hairstyles, pixel faces and sneakers on the existing 55-bone basketball rig. Palettes and procedural skin/fabric detail differentiate skin, hair, cloth and rubber. Fans use lower-detail baked meshes in instanced batches; reactions have independent timing. A subset of branded fans raises cards while others watch and clap.

Coarse-pointer devices and devices reporting 4 GB or less memory start in low quality. Low quality uses direct rendering without ambient occlusion or bloom, capped pixel density and a cached static neighborhood shadow map. Moving players retain contact shadows. High quality adds contact shading, restrained bloom and a vignette. Unless a quality override is present, low measured frame rates can reduce quality further, lower render resolution and disable shadows. Animation pauses while the page is hidden. Reduced-motion preferences disable automatic courtside following and takeover confetti.

The three model downloads run together. Optional mural artwork loads after startup and leaves procedural murals usable if it fails; display fonts have system fallbacks. A graphics failure shows a static court preview with a lighter-graphics retry link.

These measures are not a smoothness guarantee. Physical iOS/Android phones, X's in-app browser, slow or unreliable networks, memory pressure, thermal throttling and download behavior still need profiling and testing before launch. Desktop viewport emulation does not replace those checks.

## Regenerate the 3D models

The park, characters and animations are authored in Python for Blender 5.2, then exported as glTF into `public/models/`:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_voxel_characters.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_park.py -- public/models/park.glb
```

`build_voxel_characters.py` produces `baller.glb` with Idle, Run, RunDribble, IdleDribble, Defend, Shuffle, Crossover, Pass, Catch, Shoot, Jump, Dunk, Land, Rebound and Celebrate clips, plus `fans.glb` with baked crowd poses. Region codes in vertex colors allow the browser to recolor players and each fan. Add `--preview work/character-previews` after the output directory to render character previews.

`build_park.py` produces `park.glb` with the court, bleachers, fences, hoops, buildings, lights and trees. Static geometry is merged by material; sellable areas remain separate named surfaces (`CourtSurface`, `BigScreen`, `NamingSign`, `Mural_0..4`, `Banner_0..23`). Add `--preview work/park-preview.png` after the output path for a park preview. The scripts and browser share dimensions in `src/world/park-layout.json`; units are feet.

## Code map

| File | Responsibility |
|---|---|
| `src/main.ts` | Startup, camera views, picking, trailer, temporary takeover, capture orchestration and quality adaptation. |
| `src/world/park.ts` | Material replacement, data-driven surfaces, capture preparation, sky and lighting. |
| `src/world/signs.ts` | Canvas painters for the court, banners, murals, screen and naming sign; optional mural underpainting. |
| `src/world/textures.ts` | Generated surface maps, bump textures, typography helpers and basketball texture. |
| `src/world/crowd.ts` | Instanced fan palettes, idle movement, card stunts, waves and cheers. |
| `src/world/players.ts` | Possession state machine, manual control, animation contacts and game choreography. |
| `src/world/ball.ts` | Regulation-size leather ball and contact shadow. |
| `src/ui/gameplay.ts`, `recording.ts`, `diagnostics.ts` | Keyboard/touch play, local video capture and visible regression/performance instrumentation. |
| `src/world/moments.ts` | Temporary takeover confetti. |
| `src/world/layout.ts` | Seat and panel positions derived from the shared park layout. |
| `src/render/postfx.ts` | Graphics tiers, ambient occlusion, bloom, tone mapping and lower-resolution fallback. |
| `src/data/api.ts` | Single entry point for arena state; currently returns local demo or empty data. |
| `src/ui/ui.ts`, `src/ui/styles.css`, `index.html` | Responsive controls, spot details, holders, preview disclosures and checkout stub. |
| `src/ui/share.ts` | Local PNG spot-card composition and download. |

## Assets and remaining work

See [athlete attribution](public/models/ATTRIBUTION.md), [Rucker reference notes](work/rucker-reference.md), and [ASSET_SOURCES.md](ASSET_SOURCES.md) for model, generated artwork, font and software provenance and licenses. Source photographs are not distributed. The location is real; shipped characters, teams and demo brands are fictional; the mural underpainting is original generated art, with live brand content painted over it. Font and three.js license copies are in `public/licenses/`.

Before accepting purchases: implement an authenticated backend, persistent ownership, authoritative takeover pricing and concurrency rules, logo uploads and moderation, and payment/webhook handling. Checkout remains deliberately disconnected from payments. The current share image and takeover celebration are previews, not receipts or proof of ownership.

Production hosting/domain setup has not been performed. Physical phone/network profiling and production asset delivery remain launch work. Local desktop and responsive-viewport measurements do not establish performance on a physical phone.

## Business preview workflow

Advertising inventory is visible on arrival. Choose Crowd seats, Banner, Mural, Screen or Court sponsor, then enter a business name, tagline and colors in **See your brand here**. Seats support 1-, 4- and 12-seat mock-ups. The preview repaints the actual live scene, including readable crowd cards. **Reset preview** restores the previous court. Download spot card captures the selected design. No preview reserves a spot, records a sale or takes payment.

The neighborhood GLB uses Meshopt compression (34.33 MB raw → 8.48 MB shipped). After regenerating the park, run:

```sh
npx gltf-transform meshopt public/models/park.glb work/park-compressed.glb --quantize-position 16 --quantize-texcoord 16
cp work/park-compressed.glb public/models/park.glb
```

`node tests/brand-preview.mjs` checks seat-block boundaries, repeat edits, sponsor surfaces and preservation of original state. `node tests/ball-regression.mjs` exercises the current voxel GLB and movement code.
