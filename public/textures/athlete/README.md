# Shared adult athlete maps

These seven source UV maps are used by `src/world/athlete-material.ts`; they are actually loaded in the game, not concept references. glTF V coordinates require `flipY = false`. Color maps use sRGB; normal, specular and roughness data maps use linear/no-color-space sampling. Each map has one cache-shared Three.js texture across the cast.

| Runtime filename | Source | Resolution | License |
| --- | --- | --- | --- |
| skin-color.png | Mindfront skin_male_african_middleage.png | 2048² | CC0 1.0 |
| skin-normal.png | Mindfront skin_male_african_middleage_NRM.png | 1024² | CC0 1.0 |
| skin-specular.png | Mindfront skin_male_african_middleage_SPEC.png | 1024² | CC0 1.0 |
| jersey-normal.png | Namuhekam Polo_Normal_OpenGL.png | 1024² | CC0 |
| jersey-roughness.png | Namuhekam Polo_Roughness.png | 1024² | CC0 |
| shoe-color.png | punkduck tennisshoes.png | 1024² | CC BY 3.0 |
| shoe-normal.png | punkduck tennisshoes_normals.png | 1024² | CC BY 3.0 |

Files were resized with macOS `sips`; source maps are not generated images. Skin color remains at source size. The uncompressed worst-case RGBA8 estimate including full mip chains is about **53.3 MiB** for this shared set. PNG transfer size is separate; actual driver memory is not measured. The crowd does not load additional copies or use these maps. Skin specular is converted in the shader to a constrained roughness response; it is not a calibrated roughness scan. Full credits, source links and modification details accompany the models in `public/models/ATTRIBUTION.md`.
