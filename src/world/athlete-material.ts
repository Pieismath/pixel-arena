import * as THREE from 'three';

/** Authored MakeHuman UV maps, shared by all ten athletes. See model attribution. */
const loader = new THREE.TextureLoader();
function imageMap(name: string, color = false) {
  const texture = loader.load(`${import.meta.env.BASE_URL}textures/athlete/${name}.png`);
  texture.flipY = false; // Blender's glTF export converts UV V, just like GLTFLoader textures.
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}
const maps = {
  skinColor: imageMap('skin-color', true),
  skinNormal: imageMap('skin-normal'),
  skinSpecular: imageMap('skin-specular'),
  jerseyNormal: imageMap('jersey-normal'),
  jerseyRoughness: imageMap('jersey-roughness'),
  shoeColor: imageMap('shoe-color', true),
  shoeNormal: imageMap('shoe-normal'),
};

export const athleteSkinColor = maps.skinColor;

/** A single draw for the body; material regions preserve distinct skin, knit and rubber response. */
export function playerMaterial(colors: THREE.Color[]) {
  const material = new THREE.MeshStandardMaterial({ roughness: .8, normalMap: maps.jerseyNormal });
  const uniforms = { uPalette: { value: colors } };
  material.userData.palette = uniforms;
  material.customProgramCacheKey = () => 'adult-athlete-pbr-v1';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, {
      uSkinColor: { value: maps.skinColor }, uSkinNormal: { value: maps.skinNormal },
      uSkinSpecular: { value: maps.skinSpecular }, uJerseyRoughness: { value: maps.jerseyRoughness },
      uShoeColor: { value: maps.shoeColor }, uShoeNormal: { value: maps.shoeNormal },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 region;
        uniform vec3 uPalette[10];
        varying vec3 vRegionColor;
        varying vec3 vClothPosition;
        varying float vRegion;
        varying vec2 vAthleteUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int ri = int(floor(region.r * 16.0));
        vRegion = float(ri);
        vClothPosition = position;
        vAthleteUv = uv;
        vRegionColor = uPalette[0];
        for (int i = 1; i < 10; i++) { if (i == ri) vRegionColor = uPalette[i]; }
        // Real skin textures carry their own facial detail; don't multiply the old painted face shadows.
        if (ri != 0) vRegionColor *= region.g > .1 ? region.g : 1.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uSkinColor;
        uniform sampler2D uSkinNormal;
        uniform sampler2D uSkinSpecular;
        uniform sampler2D uJerseyRoughness;
        uniform sampler2D uShoeColor;
        uniform sampler2D uShoeNormal;
        varying vec3 vRegionColor;
        varying vec3 vClothPosition;
        varying float vRegion;
        varying vec2 vAthleteUv;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec3 surfaceColor = vRegionColor;
        if (vRegion < .5) {
          vec3 skinDetail = texture2D(uSkinColor, vAthleteUv).rgb;
          // Neutralize only the source's average tone. Preserve lips, palms, follicles and facial variation.
          skinDetail = clamp(skinDetail / vec3(.235, .113, .062), vec3(.12), vec3(1.8));
          surfaceColor *= mix(vec3(1.0), skinDetail, .82);
        } else if (vRegion > 4.5 && vRegion < 6.5) {
          surfaceColor *= mix(vec3(1.0), texture2D(uShoeColor, vAthleteUv).rgb, .72);
        }
        float cloth = step(.5, vRegion) * (1.0 - step(4.5, vRegion));
        vec2 knitUV = vec2(vClothPosition.x * 155.0, vClothPosition.y * 165.0 + vClothPosition.z * 151.0);
        float visibleKnit = 1.0 - smoothstep(.65, 1.8, max(fwidth(knitUV.x), fwidth(knitUV.y)));
        surfaceColor *= 1.0 + cloth * sin(knitUV.x) * sin(knitUV.y) * visibleKnit * .023;
        vec4 diffuseColor = vec4(diffuse * surfaceColor, opacity);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (vRegion < .5) roughnessFactor = clamp(.73 - .29 * texture2D(uSkinSpecular, vAthleteUv).r, .42, .73);
        else if (vRegion > .5 && vRegion < 1.5) roughnessFactor = .80 + .17 * texture2D(uJerseyRoughness, vAthleteUv).r;
        else if (vRegion > 6.5 && vRegion < 8.5) roughnessFactor = .34;
        else if (vRegion > 4.5 && vRegion < 5.5) roughnessFactor = .67;
        else if (vRegion > 5.5 && vRegion < 6.5) roughnessFactor = .88;
        else roughnessFactor = .94;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 surfaceN = vec3(0.0, 0.0, 1.0);
        if (vRegion < .5) {
          surfaceN = texture2D(uSkinNormal, vAthleteUv).xyz * 2.0 - 1.0;
          surfaceN.xy *= .45;
        } else if (vRegion > .5 && vRegion < 1.5) {
          surfaceN = texture2D(normalMap, vAthleteUv).xyz * 2.0 - 1.0;
          surfaceN.xy *= .32;
        } else if (vRegion > 4.5 && vRegion < 6.5) {
          surfaceN = texture2D(uShoeNormal, vAthleteUv).xyz * 2.0 - 1.0;
          surfaceN.xy *= .55;
        }
        normal = normalize(tbn * surfaceN);`);
  };
  return material;
}
