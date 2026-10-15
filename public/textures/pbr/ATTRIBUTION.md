# Photographic surface and outdoor reflection assets

All assets below are **CC0 1.0**, from [Poly Haven](https://polyhaven.com/license). Downloaded 26 September 2026. Local `manifest.json` records exact source URLs, original MD5, distributed SHA-256, dimensions, map type, and compressed byte size.

| Asset | Creator | Imported output | Physical repeat |
|---|---|---|---|
| [Asphalt Floor](https://polyhaven.com/a/asphalt_floor) | eye-candy.xyz | 1024² diffuse, OpenGL normal, packed AO/roughness/metal | 2.35 m / 7.71 ft |
| [Red Brick](https://polyhaven.com/a/red_brick) | Rob Tuytel | 1024² diffuse, OpenGL normal, packed AO/roughness/metal | 1.40 m / 4.59 ft |
| [Concrete Wall 007](https://polyhaven.com/a/concrete_wall_007) | Dario Barresi, Rico Cilliers, Charlotte Baglioni | 1024² diffuse, OpenGL normal, packed AO/roughness/metal | 2.16 m / 7.09 ft |
| [Wide Street 02](https://polyhaven.com/a/wide_street_02) | Sergej Majboroda | 1024×512 HDR environment reflection/irradiance | not applicable |

Source JPEG maps were transcoded with cwebp (normal quality96, diffuse/ARM quality90); no generated image or painted normal substitution. Diffuse textures use sRGB; normal and ARM use linear data. ARM red drives AO, green drives roughness; these dielectric surfaces do not use the metallic channel. No displacement/tessellation is enabled. Physical-scale GLTF UVs are in feet; branded court uses unique color UVs plus separate tiled normal and roughness transforms.

The HDRI is a generic measured outdoor street environment, not a photograph of Harlem. It is used for lighting/reflection only, not displayed as site scenery. Harlem architectural reference photographs are documented separately in blender/HARLEM_ENVIRONMENT.md. The court paint design is original, using the 2021 renovation's sand/charcoal palette; it does not reproduce the mural artist's artwork or sponsor logos.
