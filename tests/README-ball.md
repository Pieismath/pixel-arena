# Ball continuity regression

Run `node tests/ball-regression.mjs` from this repository. This uses the **actual production `baller.glb`**, GLTFLoader, Three.js animation mixers, skeleton/socket matrices and GameSim. Only Canvas2D texture drawing is stubbed. It is not a renderer or GPU benchmark.

## Reproduction before the fix

`node tests/reproduce-ball-before.mjs` reconstructs that original code/asset in `work/ball-original/` from Git and reproduces the numerical failure without changing the current implementation.

Before editing `players.ts` or replacing the character asset, we bundled the original GameSim, loaded the then-current GLB and simulated 28,800 frames (480 seconds at 60 Hz, seeded random99). Source last changed in commit `23ff85317132c317a1d93f8895b9aef024754a3e`; old GLB SHA256 `c8db54967f72b373a39213718ca5fb4e9aba7b8a13e2803a553884e0a43d38a3`. The preserved machine-readable observations are `evidence/ball-before.json`.

Observed: **230 single-frame position jumps greater than 2.5 feet, worst 20.823 feet.** At 8.25s a pass ended at `(28.972, 4.4, -3.608)` and the next frame the ball appeared at `(15.663, 0.971, -4.050)`: a 13.751-foot jump. The pass flight targeted a snapshot of the receiver's old torso position; the receiver kept moving, and the next possession frame placed the ball under the receiver's current hand. Immediate heading changes, dribble-action phase resets, pickup snapping, and resetting highlight player positions added smaller discontinuities.

Throughout that reproduction the ball remained a single attached, visible, opaque, depth-tested mesh. Positions were finite and above the court. Thus the confirmed issue is a possession/animation coordinate continuity error causing apparent disappearance or sudden relocation, not deletion or a visibility flag. Camera/frustum visibility and natural occlusion require the separate live-browser visual checks.

## Fix contract

* One discriminated ball state owns possession, pre-release hand contact, flight, rim/score continuation, and loose-ball physics. One mesh persists through all modes.
* Flight endpoints use animated palm sockets in consistent court coordinates. World-space sockets are converted to game-local coordinates; public camera positions are converted back to world space.
* Receivers plant, catches finish at the actual palm, releases sample the release instant, gather transitions retain their starting position, facing changes continuously, and dribble phase survives gait changes.
* Reset drops the existing ball into loose physics. Highlight starts a drive from the current possession. Neither teleports the live ball or the players.
* The regulation-size mesh has conservative static sphere bounds, standard depth testing, orange leather bump/detail, dark seams, rotation and an altitude-dependent contact shadow. It does not render through players or scenery.

The regression validates authored animation coverage, numerical position continuity, ground clearance, exact pass/palm contact, ball lifetime/count, normal material depth behavior, parent transforms, and actual manual move/pass/shot inputs. It repeats dribble/pass/shot/miss/rebound/dunk/score/reset sequences at fixed and variable frame times. `evidence/ball-after.json` records results from the final production assets.

## Verified shipped faceted asset

GLB SHA256: `e0c127abf652f38f0a23b6aafd2e373a221f24a9ab43f4c0c772b694d1fad7a7`.

The cast retains 55 bones, 15 clips and the exact palm-contact sockets. Geometry now uses chamfered heads, tapered eight-sided limbs, shaped jerseys and irregular hair tufts. Run and RunDribble have shorter strides, a quieter pelvis and shoulder counter-rotation. Runtime transitions preserve stride phase and use separate start/stop thresholds.

The regression result in `evidence/ball-after.json` includes deterministic autoplay, mixed 20–120 Hz updates, transformed parents, manual controls and all clips. Run stance is calibrated to 6.34121 court feet/second; measured planted-foot drift is below .005 feet. Shuffle remains calibrated to 2.516097. The manual test waits until the inbound/pass has completed before applying movement input.

The inherited facial-morph guard remains for compatibility with the earlier anatomical asset; the current cast uses modeled faces without morph targets.
