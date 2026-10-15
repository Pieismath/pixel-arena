# Shipped adult athletes and crowd

`baller.glb` and `fans.glb` are generated with `blender/build_characters.py` from continuous MakeHuman anatomy, authored skin weights and separately modeled clothing and footwear. The voxel generator is retained only as historical source and is not the shipped asset pipeline. No supplied stock-reference image or watermark is used in the models.

## Source assets and licenses

- **MakeHuman Community:** hm08 anatomy, macro targets, game-engine skeleton/weights and eyes — **CC0**. Source: https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md . The official reuse statement covers core meshes, targets and skins: https://static.makehumancommunity.org/mpfb/faq/build_other_chargen.html . Authoring uses MPFB; its code is not shipped in the browser.
- **Namuhekam, `male_polo_shirt`: CC0.** Weighted mesh tailored into a sleeveless singlet; cut neckline and armholes, sewn trim/hem thickness, fit and folds modified. The asset's `Polo_Normal_OpenGL.png` and `Polo_Roughness.png` are reduced to 1024² and used by the runtime. Original license header: `licenses/Namuhekam.txt`.
- **Elvaerwyn, `elvs_male_swim_shorts1`: CC BY.** Weighted mesh modified for basketball proportions and sewn hem thickness. The original author identifies `CC-by` without a version; that exact header is preserved in `licenses/Elvaerwyn.txt`. Official asset index: https://static.makehumancommunity.org/assets/assetpacks/pants03.html . Source: http://www.makehumancommunity.org/clothes/elvs_male_swim_shorts1.html . No version is invented here.
- **punkduck, `TennisShoes`: CC BY 3.0.** Modeled shoes, laces, toe panels and outsole; material regions changed. Original color/normal maps reduced to 1024² and used by the runtime. Source: http://www.makehumancommunity.org/clothes/tennis_shoes.html ; license: https://creativecommons.org/licenses/by/3.0/ ; retained header: `licenses/punkduck.txt`.
- **Mindfront (Sweden), `skin_male_african_middleage`: CC0 1.0.** Original 2048² color, normal and specular maps acquired from the official `skins02_cc0.zip` asset pack. Color stays 2048²; normal/specular become 1024². Runtime palette tint preserves the source's local facial/palm detail; its specular map drives a bounded roughness range. Pack and license listing: https://static.makehumancommunity.org/assets/assetpacks/skins02.html . Exact source: https://files2.makehumancommunity.org/asset_packs/skins02/skins02_cc0.zip . The source PNG itself labels Mindfront and CC0; original material settings are retained in `licenses/Mindfront-skin.mhmat`. This is an authored skin set, not a claim of calibrated scanned skin or a subsurface-scattering renderer.

The fitted socks, scalp variants, beard, brows, facial morphs, tailoring, palette shader, 15 basketball animation clips and baked crowd LOD are project modifications/authored work. The previous Joel Palmius CC0 source socks are retained in the bind-pose source, but runtime socks are now derived from the weighted calf surface.

## Build and runtime contract

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_characters.py -- public/models --preview work/athlete/qa
python3 blender/verify_characters.py
```

The 6.35-foot source athlete retains 55 bones (30 finger joints and `ballGripR`/`ballGripL`), 15 animation clips, separate face morphs and the original asset UV layouts. `src/world/athlete-material.ts` loads seven shared maps from `public/textures/athlete` for skin, knit fabric and shoes; the main body remains one render primitive. These shared runtime textures are deliberately not duplicated inside the GLBs.

Main anatomy/kit body: **26,865 triangles**. Optional hair: **1,186**; beard: **808**; headband: **198**; two number planes: **4**. Most detailed visible athlete: **29,061 triangles**. Crowd: 15 baked pose/style meshes in each of two tiers: **2,972–3,082 triangles/person near** (`Fan_` prefix) and **1,078–1,119 far** (`FanFar_` prefix). Near simplification preferentially retains head and finger surfaces. Every mesh has one primitive and no live skeleton; both tiers share exactly the same seat/ground origin. Rebuild only the crowd with `--fans-only` to leave `baller.glb` untouched. Runtime crowd uses the same continuous silhouettes, regional palettes and one shared skin-color sampler, with simplified skin/fabric/rubber roughness; it omits the hero normal and specular samplers.

Run and RunDribble stance calibration: **6.34121 feet/second** at default clip speed; Shuffle: **2.516097 feet/second**. The default Dunk frame 18 grip reaches **10.1435 feet**. Runtime travel, stance correction and contact testing are in `src/world/players.ts` and the ball test harness; the exported animation clips alone do not guarantee natural contact through blends.

The city remains project-authored Blender geometry. Environment-specific sources and material credits are documented separately in the repository's asset source records.
