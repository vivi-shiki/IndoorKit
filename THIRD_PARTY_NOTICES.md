# Third-party notices

The home page backdrop of the demo app (`apps/playground/src/pages/home/backdrop-icons.ts`) contains icon paths from the following icon sets. The paths are unchanged; only the solid silhouette icons listed in that file are included.

## Material Design Icons

- Source: <https://pictogrammers.com/library/mdi/> (via `@iconify-json/mdi` 1.2.3)
- Copyright: Pictogrammers
- License: Apache License 2.0, <https://github.com/Templarian/MaterialDesign/blob/master/LICENSE>
- Icons: car, car-side, car-hatchback, ambulance, stethoscope, wheelchair, medical-bag, iv-bag, heart-pulse, truck, dump-truck, tanker-truck, tow-truck, forklift, bed, bed-king

## game-icons.net

- Source: <https://game-icons.net/> (via `@iconify-json/game-icons` 1.2.4)
- Authors: Lorc, Delapouite and the other contributors listed at <https://game-icons.net/about.html#authors>
- License: CC BY 3.0, <https://creativecommons.org/licenses/by/3.0/>
- Icons: dinosaur-rex, sauropod-skeleton, t-rex-skull, mammoth, pillow, bed, breastplate, black-knight-helm, crested-helmet, centurion-helmet

## Digital twin props (CC0)

The trees, shrubs, rocks, vehicles, the obelisk and the neighbouring buildings in the generated campus models (`apps/playground/public/models/*/scene*.glb`) are instanced from low-poly models vendored in `tools/venue-gen/assets/cc0/`. Each file, its SHA-256 and its source are listed in `tools/venue-gen/assets/cc0/sources.json`. Materials of the nature props and neighbouring buildings are replaced by the generator; vehicle textures are kept.

- Author: Kenney (<https://kenney.nl>)
- Packs: Kenney Nature Kit (<https://kenney.nl/assets/nature-kit>), Kenney Car Kit (<https://kenney.nl/assets/car-kit>), Kenney City Kit (Commercial) (<https://kenney.nl/assets/city-kit-commercial>)
- Obtained from the meshopt-optimised copies in `@netforge/asset-library-files` 0.2.0, whose NOTICE credits these packs; the pack for each file is identified from its material and texture names
- License: CC0 1.0 Universal, <https://creativecommons.org/publicdomain/zero/1.0/> (legal code in `tools/venue-gen/assets/cc0/LICENSE-CC0-1.0.txt`); credit is given although CC0 does not require it

## Paving texture (CC0)

- ambientCG Paving Stones 036, <https://ambientcg.com/view?id=PavingStones036>, CC0 1.0 (see `apps/playground/public/models/textures/LICENSE.md`)
