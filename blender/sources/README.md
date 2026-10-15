# Adult athlete bind-pose source

`adult-athlete-source.blend` is the licensed, editable continuous anatomy, skeleton, skin weights, original UVs, separate clothing and shoe source for `../build_characters.py`. It was created with MakeHuman/MPFB, independently of the later voxel geometry. MPFB is unnecessary for rebuilding from this saved source. The current builder reshapes the eyelids, tailors a singlet with sewn edge thickness, retains natural finger geometry, fits crew socks from the calf surface, and authors face/hair variants and animations.

`basketball-motion.blend` is the historical rig/clip source used by the retired voxel builder. It is not the geometry source for current `baller.glb` or `fans.glb`.

Build with Blender 5.2:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_characters.py -- public/models --preview work/athlete/qa
python3 blender/verify_characters.py
```

The builder's editable result is saved under `work/athlete/adult-athlete-authored.blend`; its measured geometry report is `work/athlete/asset-report.json`. The seven licensed runtime texture maps live in `public/textures/athlete`. All source names, exact licenses and material-map provenance are in `public/models/ATTRIBUTION.md`; original license headers travel in `public/models/licenses`.

Preserve the 55-bone contract (including `ballGripR`, `ballGripL`, `foot_l`, `foot_r`), all 15 clips and 10 material region indices. Run stance speed is **6.34121 court feet/second**, Shuffle **2.516097**. GLB UV coordinates are exported with glTF V convention and runtime textures use `flipY = false`.
