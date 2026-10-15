# Harlem environment authoring notes

Authoring date: 2026-09-26. Original project geometry, created in Blender 5.2.0 LTS by `blender/build_park.py`. The authoring method is parametric mesh construction with actual apertures; no third-party building mesh, stock photograph, or generated image pixels are included in `park.glb`.

## Coherent reference set

- Rucker court/hoop/street/stand era: October 2021 NBPA renovation. [NBPA project](https://nbpa.com/rucker), photographs by Jon Lopez, specifically [October 8, frame 84](https://imgix.cosmicjs.com/f3b72b10-3113-11ec-96cf-654f0d745df3-20211008-NBPA-RUCKER-JL-84.jpg) and [October 6, frame 16](https://imgix.cosmicjs.com/f3926500-3113-11ec-96cf-654f0d745df3-20211006-NBPA-RUCKER-JL-16.jpg). Both photographs visually inspected from reference-only files in `work/rucker-reference/`. [NBPA/NYC Parks reopening statement](https://nbpa.com/news/nbpa-hosts-ribbon-cutting-ceremony-to-celebrate-the-completed-renovation-and-reopening-of-nyc-parks-greg-marius-court-at-holcombe-rucker-park-in-harlem) confirms the renovation scope/date.
- Harlem architectural vocabulary: [NYC Landmarks Preservation Commission, Central Harlem–West 130th–132nd Streets Historic District, LP-2607, May 29 2018](https://s-media.nyc.gov/agencies/lpc/lp/2607.pdf). Cover streetscape photograph visually inspected; used for the tall window proportion, deep masonry reveals, individually profiled cornice, paneled entrance, raised doorstep, iron hardware and warm masonry palette. This is a nearby Harlem reference, not a claim that these exact buildings face Rucker Park.

These photographs are reference only. They are not licensed for redistribution by this project and are not shipped. No logo or existing shop identity is copied. Modeled assets are original project work; no third-party model license is required. Photo-based runtime PBR materials have their own separately documented source licenses.

## Representative section

North center facade: x=-19..12.7ft, street face z=-91ft, height65ft. The section is above the north stand in normal gameplay framing and includes a closer streetscape inspection area.

- Facade shell made of masonry bands/piers around true window and shop openings. Core mass starts five feet behind facade. Window reveals are approximately 0.6ft deep, with four-foot interior bays, sidewalls/floor/ceiling, recessed sash and glass plane. These are actual geometry, not dark rectangles pasted on a solid wall.
- Window details include individually modeled sill/lintel, folded curtain planes, occasional air conditioners and occupied windows behind the facade plane.
- Ground floor has unequal commercial/residential apertures, recessed paneled door, transom, pull, buzzer/light, pitched canvas awning, and shop interior shelves.
- Fire escape has a grated platform, open front/side rails, wall brackets, paired stair stringers, treads and handrails aligned to actual floor elevations. Roof has a three-profile cornice, selected brackets, parapet coping, flashing, bulkhead and chimneys.
- Adjoining sidewalk has 4ft paving joints, curb seams, one drain, hydrant, regulation sign silhouette, slatted shop bench and rack. It deliberately leaves a continuous walking route.
- One east cage panel x=58ft,z=-7.33..3.33ft has actual cylindrical diamond wires at nominal 2in openings and 3.7mm wire diameter. The separate alpha panel proxy is a distance LOD. The requested19ft cage height is retained; it is not claimed to match the photographed site exactly.
- Hoop keeps regulation alignment and adds round net cords, corner clamps, mounting carrier and bracing. All marketplace hook names/positions stay intact.

## Cost and scale

Baseline exported park:508,378 triangles. 150,912 are WindowFrame,69,588 Cornice; foliage contributes166,008. The old distant background buildings alone used102,408 triangles, including detailed frames on every side. The representative new facade is7,776 triangles, adjoining street812 before later cage/hoop changes. Final exported counts are recorded in the build log and delivery evidence.

Static architecture is grouped by material into two spatial sectors (north/west and south/east) plus a separate skyline, so the browser can cull invisible regions. Material UVs remain physical world-feet, independent of building size, for consistently scaled tileable PBR textures. The skyline intentionally uses lower-detail window faces; it is a distant geometry tier, not suitable for a close-up. Trees use reduced leaf topology and sample counts. Cars are rebuilt original models with independent glazing and pillars, wheel arches, rounded tires and modeled body details, as documented below.

## Integrated neighborhood export

After the representative section was inspected in the playable renderer, its construction family was extended to the north/east/west tenements and south residences. Legacy opaque building-front generators and pasted-on storefront layers were removed. The south lower floors have dedicated stoops, paneled entrances and individual recessed windows; commercial facades retain unequal shop/entry openings. Floor pitch, bay count/width, cornice profile, curtain state, air conditioning, fire escapes, masonry palette, height and frontage vary. 17 window residents and54 sidewalk residents populate the neighborhood.

The final `public/models/park.glb` export has337,486 unique triangles in131 meshes and is5,521,256 bytes after Meshopt compression. Baseline was508,378 triangles/78 meshes/7,905,776 bytes. Triangle reduction is33.6%; material/spatial segmentation increases mesh count, so frame draw calls must still be measured in the runtime. Selected final geometry buckets: foliage72,000 triangles; painted iron37,788; window frames33,564; limestone30,324; interior plaster17,904. Source log: `work/harlem-build/neighborhood-build.log`; machine-readable profile: `work/harlem-build/geometry-profile.json`.

Architecture is batched into two broad spatial sectors (north/west and south/east), plus a separate cheap skyline. This reduces draw-call cost from the first174-mesh staged export while retaining partial spatial culling. The hero facade's geometry is unchanged but is now batched with NorthArchitecture. The nearer wire panel/proxy stay separate for runtime LOD. Leaf dimensions were reduced25% after the first actual gameplay inspection and leaf topology/count reduced; individual foliage pieces are still geometry, not photographic leaf cards. Static vehicle proportions now differ between sedan, taller wagon/SUV and compact hatchback, but these remain simplified project-authored assets.

The compressed shipped GLB was parsed through the installed Three.js GLTFLoader+MeshoptDecoder. A ray through the representative first window at(-15.0375,17.22,-88) in the negative-z direction hits GlassPane atz=-91.631, InteriorShadow atz=-95.838, then the facade core atz=-95.999. It does not hit opaque masonry at the frontz=-91 opening.32 named court/sign/banner/mural hooks are present. This verifies mesh aperture depth and retained hook presence; integrated camera/performance validation is separate.

## Sedan refinement

After actual Street-view inspection, the earlier cabin/paint loft was replaced with an independent curved roof, explicit curved glazing panels, A/B/C pillars and recessed cabin volume. The previous opaque shell intersected rear glazing, making the backlight incorrectly appear to be silver body paint. Lower body now has arch-shaped side cutouts and shaped hood/trunk; tires have rounded cross-sections and separate brake/rim/spoke meshes. Panel gaps, handles, mirrors, lights, grille, bumper and plates are modeled. Original project geometry; no third-party vehicle model or logo. Three silhouettes are retained, with extra wheel tessellation only on the representative north-center sedan. Rear three-quarter mesh render and the final playable Street detail view were both inspected; the exported rear glazing remains unobstructed. Current park after this refinement: **337,486 triangles, 131 meshes, 5,521,256 bytes**.
