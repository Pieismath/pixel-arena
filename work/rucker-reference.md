# Rucker Park environment reference and implementation

Reference era: **October 2021, immediately following the NBPA refurbishment**, with a lightly worn summer-event presentation. References researched and photographs visually inspected on 2026-09-26 before modeling. The prior pink/teal enclosed courtyard is replaced, not retained under a new label.

## Primary photographs inspected

1. NBPA official refurbishment project, Jon Lopez, **October 8, 2021**, image `20211008-NBPA-RUCKER-JL-84.jpg`.
   - Page: https://nbpa.com/rucker (the supplied www address timed out; the canonical no-www page loaded).
   - Photo: https://imgix.cosmicjs.com/f3b72b10-3113-11ec-96cf-654f0d745df3-20211008-NBPA-RUCKER-JL-84.jpg
   - Observed: warm sand/tan playing surface, black abstract paintings at both ends, white lines, dark near-court bleacher planks with an ochre center stair, a compact black scoreboard with a pale gold border on two posts above the stand. Tall trees filter brick residential towers in the distance. Cars are visible across a permeable chain-link fence. The court is not enclosed by four building walls.
2. Same official project, Jon Lopez, **October 6, 2021**, image `20211006-NBPA-RUCKER-JL-16.jpg`.
   - Photo: https://imgix.cosmicjs.com/f3926500-3113-11ec-96cf-654f0d745df3-20211006-NBPA-RUCKER-JL-16.jpg
   - Observed: glass goal with slim black structure, orange rim, long white rope net; black fence approximately one backboard height; charcoal painted patterns across tan lane areas, a large circular motif at the free-throw area; mature branching trunks, open park activity visible through the fence.

The two photographs were opened with `view_image` from reference-only downloads in `work/rucker-reference/`. **No photograph, logo, or sponsor artwork is shipped in the game.** The original modeled geometry and procedural art in this implementation do not embed source photography. The photographed A$AP Ferg court art is interpreted through original lozenges and free-throw ring marks; it is not presented as a faithful reproduction of that artwork.

## Other requested sources checked

- https://www.courtsoftheworld.com/united-states/new-york-city-ny/rucker-park/ — location at 155th Street and Frederick Douglass Boulevard, full court, lighting, and community photograph chronology. The mixed-age gallery is contextual only, not used to mix renovations.
- https://commons.wikimedia.org/wiki/Category:Rucker_Park — archive cross-check. Its 2008 Wikipedia Takes Manhattan photographs are explicitly dated April 4, 2008; excluded for court color, goals, seating and scoreboard so the 2008 and 2021 eras are not blended.
- https://nbpa.com/news/nbpa-hosts-ribbon-cutting-ceremony-to-celebrate-the-completed-renovation-and-reopening-of-nyc-parks-greg-marius-court-at-holcombe-rucker-park-in-harlem — October 14, 2021 release confirms the October 9 reopening.

## Model / runtime implementation

- Blender 5.2 authored `blender/build_park.py`, exports `public/models/park.glb`.
- Existing 94 × 50 foot playing dimensions and 10 foot rim height are kept so game physics remain aligned.
- Stand front is 6.8 feet beyond the sideline, 6 rows north / 4 rows south; two seating banks share a 4 foot central stair opening. 400 seat positions instead of 880 reduce crowd cost and bring spectators close.
- Narrow metal tournament rails replace opaque sideline walls. Small community/sponsor panels preserve the live, data-driven banner/mural commerce surfaces; the oversized billboard and surrounding masonry court walls are removed.
- The real-life renovation palette and physical features are followed; arrangement and dimensions outside the regulation court are an **artistic reconstruction from photographs**, not a measured site survey. The lower opposite stand and art panels accommodate the pre-existing game and marketplace.
- Freestanding 15 × 7.6 foot score display and 15 × 2.5 foot header use the existing live canvas scoreboard and brand state. Location identity remains visible under paid naming.
- Modeled 48-segment tubular rims, mounts, glass panes with perimeter trim, and 120 individual net rope segments per hoop replace the capped translucent-cylinder nets.
- Ten mature trees use tapered forked branches, roots, and irregular individual leaf polygons. Three foliage materials batch all leaves. Trees frame the sidelines and northern background; the center of the gameplay camera stays open.
- Open streets, curbs, marked crossing, parked vehicles, a detached west row of buildings and distant tall residential silhouettes establish depth. Buildings are separated from the park by streets and sidewalks.
- Runtime court canvas supplies sand/charcoal paint, original abstract motifs, white regulation markings, reduced cracks, restrained scuffing and fine aggregate bump. No generated raster images were used.
- Static parts remain merged by material. Export hooks remain separate only for interactive brand surfaces.

## Validation

- Blender export completed successfully; offline geometry preview inspected (textures and crowd are assigned by runtime, so offline preview is geometry QA only).
- `npm run build` passed after the geometry and court changes; integrated gameplay QA and performance measurement are performed by the coordinating agent.

### Gameplay-camera refinement

The first integrated gameplay screenshot was inspected. Warm emissive storefront windows looked like blank tan panels, so storefronts now use a dark four-pane glass texture with reflective streaks and quiet shelf detail, metal mullions and door hardware. Tree trunks now retain crooked continuous leaders with heavy boughs beginning at several heights, smaller leaf polygons and deeper overlapping foliage volumes; the former radial V-shaped branching has been removed. The leaf budget remains approximately unchanged. Exterior tree positions are preserved, with an unobstructed center/south camera lane.
