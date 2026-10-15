# Current ball and motion verification

The current investigation uses the source and shipped voxel GLB from commit `6906d600daef31be80655c2d011eee9616781196`, captured **before this implementation**. It does not use the older historical teleport fix as proof that the current complaint was reproduced.

## What was reproduced before changing the current build

`node tests/ball-current-baseline.mjs` reconstructs that exact commit in `work/ball-current-before/` without replacing the active project. `tests/evidence/ball-current-before.json` records 600 seconds of autoplay plus ten independent reset cases (40,800 simulation frames).

* The ball remained one visible, attached, opaque mesh with finite coordinates throughout. No current deletion, visibility-toggle, or nonfinite-position failure was reproduced. Normal desktop overview projection stayed inside the frustum. These numerical facts do not establish rendered visibility through player/scenery occlusion.
* **Camera framing:** applying the then-current portrait courtside formula and its actual smoothing at 390×844 projected the ball outside the frame in 888 of 7,079 measured frames during a separate 120-second trajectory. At 9.733 seconds a pass ball was `(38.681, 4.866, -3.576)` feet, projected x `-1.007`; the camera was still aimed toward the passer. The portrait overview preset also cropped play. `tests/evidence/motion-current-before.json` preserves examples. This is a mathematical reproduction of offscreen disappearance, not a physical-phone performance measurement.
* **Unreachable pickup after reset:** a reset cancels flight correctly, but the old pickup decision checked only x/z distance. Starting from a new GameSim, invoke `shot-make`, advance 65 frames at 60 Hz (ball y22.064 feet), reset, then advance 42 frames: possession was granted while the ball remained y14.282 feet. For a dunk, invoke `dunk`, advance 246 frames, reset, and advance one frame: possession was granted at y10.140 feet. The gather then dragged that airborne ball into a grounded player's hand.

For a live visual check, the same old build is preserved under `work/current-before-playable` and can be served with `node node_modules/vite/bin/vite.js work/current-before-playable --host 127.0.0.1 --port 5192`. Open `?demo=1&audit=1`; use the visible `shot-make` or `dunk` diagnostic button, read the displayed ball height during flight, and press `reset` while it is overhead. UI timing changes the exact frame, so use the deterministic test above for the exact values. Diagnostic controls invoke the same GameSim paths as production play.

## Implemented behavior

* The camera fit includes both the action subject and the live ball, with an aspect-aware margin. `tests/camera-framing.mjs` imports the actual `src/render/camera-framing.ts`, applies the running camera smoothing and free-orbit street bounds; fitted action cameras retain their required retreat, and checks desktop, portrait390×844 and narrow360×800 views.
* Loose-ball pickup requires reachable height. Reset preserves the current ball position, clears score/clock state, releases into ordinary loose physics, and cannot assign an overhead ball to a nearby grounded player.
* A single ball state and persistent depth-tested mesh still own every held, pre-release, flight, score, rebound and loose transition. Pass endpoints are the animated palm sockets. Existing release and catch continuity remains tested.
* Interrupting a catch gather with a crossover or other one-shot action restarts the blend from the visible ball position. The mixed120Hz regression caught a1.882-foot one-frame jump in this path before that guard was added.
* The imported athlete is uniformly scaled by stature rather than stretched independently on each axis. Outline meshes are removed. The shader is supplied by `athlete-material.ts` and uses the authored material assets documented in `public/models/ATTRIBUTION.md`.
* Run cadence follows actual travel speed without the old sprint cap. Players turn into travel before accelerating; slow defensive movement can remain lateral. Two-bone support-foot IK holds the current stance, with eased release when a cut exceeds the usable planting range. The knees and sole orientation retain the authored pose.
* Dribbling arms are layered independently from the lower-body stride. The pushing hand and ball retain a one-second cycle while sprinting. The ball follows a parabolic bounce with exact animated-palm contact at the apex; switching gait no longer accelerates the bounce to multiple cycles per second.

## Run the current checks

```sh
node tests/ball-current-baseline.mjs --current
node tests/ball-regression.mjs
node tests/motion-contact.mjs
node tests/camera-framing.mjs
npm run typecheck
```

All Node checks load the actual current `baller.glb`, GLTFLoader, animation mixers and skeletons. Canvas painting and image decoding are stubbed; they do not render pixels, measure GPU speed, or validate a physical phone. The base URL is replaced only in the Node test bundler.

* `ball-current-after.json`: fresh 600-second autoplay and reset matrix; fails on lost/duplicated mesh, numerical jumps, unreachable pickups, or reset relocation.
* `ball-after.json`: 60 Hz,30 Hz,mixed20–120 Hz, parent transforms, every authored clip and manual move/pass/shot paths. The palm check samples the pre-update state, so a reset that canceled a pass is not misclassified as a completed pass.
* `motion-contact-after.json`: actual runtime stance-bone velocity through turns and gathers, plus measured dribble-to-palm error. This does not claim shoe-surface contact or full biomechanical validation.
* `camera-framing-after.json`: actual new camera function on the current trajectory, with explicit bounds and aspect ratios. Scenery occlusion still requires the delivered game recording.

An additional120-second torso test resolves a2.5-foot clearance scaled by stature, with zero torso-envelope penetration and a2.4438-foot minimum root distance. The old response allowed1.373-foot root spacing when athletes converged; the new iterative solve weights possession actors and derives gait from resolved travel. Arms are allowed to reach across that envelope.

Final adult measurements:47,565 mixed-rate simulation frames,112 exact pass catches and48 scores; the independent reset matrix checks40,800 frames and allten states. Fully weighted stance p95 velocity fell from4.06 to2.02 feet/second; broad stance p95 changed from5.47 to4.45, with brief larger releases during sharp cuts. Fifty-nine sampled dribble apex contacts met the palm to floating-point precision. These are numerical contact measures, not subjective animation-quality claims.

Remaining limits: player AI and ball flights are authored/kinematic, with loose-ball gravity rather than full player/ball collision simulation. Foot planting has finite reach and eases out during large cuts; animation blends and shoe penetration require visual recording review. No physical-phone FPS measurement is provided by these tests.

## Historical evidence retained

`tests/reproduce-ball-before.mjs` and `ball-before.json` refer to the older `23ff8531` implementation, where a moving-receiver pass endpoint caused large position jumps. That historical result is retained for provenance and is **not** the reproduction of the current report.
