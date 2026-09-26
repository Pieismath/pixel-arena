# Adult athlete source

`adult-athlete-source.blend` is the editable bind-pose source used by `../build_characters.py`. It was generated in Blender 5.2 with MPFB from MakeHuman's continuous hm08 anatomical mesh and the game-engine skeleton. It contains separately modeled, weighted clothing and footwear, not primitive body parts.

The build command needs only Blender; MPFB is not needed after the source is baked:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/build_characters.py -- public/models --preview work/athlete/qa
```

The source and output use these graphical assets:

- MakeHuman Community hm08 body, macro targets, game-engine weights, eyes and short04 source hair — **CC0**. https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md ; https://static.makehumancommunity.org/mpfb/faq/build_other_chargen.html
- Namuhekam, `male_polo_shirt` — **CC0**, as stated in the source `.mhclo`. Modified into a sleeveless basketball singlet with a cut neckline, armholes and material trim.
- Elvaerwyn, `elvs_male_swim_shorts1` — **CC BY**, as stated in source `.mhclo` and the official asset-pack index: https://static.makehumancommunity.org/assets/assetpacks/pants03.html . Modified proportions, palette, waistband and hems. Source: https://www.makehumancommunity.org/clothes/elvs_male_swim_shorts1.html . The source header records `CC-by` without a version; the original header is preserved.
- punkduck, `TennisShoes` — **CC BY 3.0**, as stated in the source `.mhclo`. https://www.makehumancommunity.org/clothes/tennis_shoes.html . Modified material regions and coloring. License: https://creativecommons.org/licenses/by/3.0/
- Joel Palmius, `CrudeHighSocks` — **CC0**, as stated in source `.mhclo`. Modified to crew length.

The original author/license headers are retained under `public/models/licenses/`. These credits travel with the public assets. The authored animations, jersey tailoring, scalp variants, facial morphs, region palettes and crowd LOD are project work. MPFB is a build-time tool; its code is not included in the browser bundle.

Run `python3 blender/verify_characters.py` after exporting to validate the skin, socket, UV, animation and crowd-batch contracts. Running stance speed is 9.36084 court feet/second; shuffle stance speed is 2.516097 feet/second. Retiming must match actual world travel.

Final export: 55 bones (including 30 finger joints and 2 palm-contact sockets), 15 clips, 21,363 triangles in the combined anatomy/kit body, and at most 23,583 visible triangles with hair, beard, headband and number decals. Crowd LOD is 862–901 triangles per person across 15 instanced pose/style batches. Hand contact is measured from `ballGripR`/`ballGripL`; default Dunk frame 18 reaches 10.1435 court feet.
