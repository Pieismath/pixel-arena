import * as THREE from 'three';

/** Photo-derived CC0 surfaces; source measurements and hashes live beside the files. */
const SOURCES = { asphalt: ['asphalt_floor', 2.35], brick: ['red_brick', 1.4], concrete: ['concrete_wall_007', 2.16] } as const;
type Surface = keyof typeof SOURCES;
type Maps = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; aoMap: THREE.Texture };
export type SurfaceLibrary = Record<Surface, Maps>;

export async function loadSurfaces(renderer: THREE.WebGLRenderer): Promise<SurfaceLibrary> {
  const loader = new THREE.TextureLoader();
  const result = {} as SurfaceLibrary;
  await Promise.all(Object.entries(SOURCES).map(async ([name, [asset, meters]]) => {
    const maps = await Promise.all(['Diffuse', 'nor_gl', 'arm'].map(key => loader.loadAsync(`${import.meta.env.BASE_URL}textures/pbr/${asset}-${key}.webp`)));
    maps.forEach(texture => {
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.setScalar(0.3048 / meters); // exported architectural UVs are feet
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.channel = 0;
    });
    maps[0].colorSpace = THREE.SRGBColorSpace;
    result[name as Surface] = { map: maps[0], normalMap: maps[1], roughnessMap: maps[2], aoMap: maps[2] };
  }));
  return result;
}

/** Separate UV transforms share source images; court signage keeps its unique 0..1 albedo. */
export function courtSurface(library: SurfaceLibrary, length: number, width: number) {
  const normalMap = library.asphalt.normalMap.clone();
  const roughnessMap = library.asphalt.roughnessMap.clone();
  for (const texture of [normalMap, roughnessMap]) texture.repeat.set(length / (2.35 / .3048), width / (2.35 / .3048));
  return { normalMap, roughnessMap, normalScale: new THREE.Vector2(.34, .34), roughness: .97 };
}
