# Sprints

Improvements to the 3D views, the houses, plants, roads and the buildings round about,
done as a series of sprints. Each sprint has its own file: what was planned, how the
implementation went, and any deviations from the plan.

| # | Sprint | Contents | Status |
|---|---|---|---|
| 1 | [Sun and light](sprint-01-sun.md) | Sun slider (time of day, season) with real sun positions; shadows through windows into the house, also with the roof or upper floors hidden; evening light, lit windows at dusk; a compass; sun hours on terraces and balconies; clients who want a sunny terrace or a balcony with sunset views | Done |
| 2 | [Atmosphere and camera](sprint-02-atmosphere.md) | Softer shadows and contact shading under the house; wind in trees and reeds; drifting clouds; water with ripples and shallows; smooth camera moves between views; an eye-level walk mode | Done |
| 3 | [House details](sprint-03-house-details.md) | Window sills, lintels, shutters, door canopies, plinth, corner boards, gutters and downpipes; roof edges, fascia and ridge; skylights; window styles; steps or a ramp to raised front doors | Done |
| 4 | [Interiors](sprint-04-interiors.md) | Ceiling lights, rugs, pictures, skirting boards, kitchen cabinets along the walls; stair and stairwell railings | Done |
| 5 | [Plants and seasons](sprint-05-nature.md) | Oaks, willows, maples, palms, stumps; ground cover (grass tufts, flowers, ferns); seasons (spring, summer, autumn, winter with snow); garden features: fences and gates, sheds, greenhouses, ponds, vegetable patches, swings, trampolines | Done |
| 6 | [Roads](sprint-06-roads.md) | Street lamps, parked cars, road signs, a bus stop, letterboxes; rounded junctions and zebra crossings; gravel tracks with a gate | Done |
| 7 | [Neighbours, town and life](sprint-07-life.md) | Neighbours built from the game's own house parts with gardens, fences and cars; shops and a café in town; landmarks that move (windmill sails, boats, the ski lift); people, a dog, cars and birds; simpler far-away detail so more fits | Done |

## The main deviations, at a glance

Each sprint's file has the full list; these are the ones worth knowing about.

- **Sun hours count only the house's shade**, not trees, neighbours or hills (Sprint 1).
- **Shadows stop lengthening below a 7° sun**, so the shadow map keeps its detail (Sprint 1).
- **Solar time:** 12:00 is when the sun is due south, not clock time (Sprint 1).
- **Walking goes through walls** and doesn't climb stairs (Sprint 2).
- **Skylights don't let sun patches in** yet, because the hidden roof that casts shadows has
  no hole (Sprint 3).
- **Long ramps can run past the corner of the house** (Sprint 3).
- **Rugs, pictures and lamps are automatic decor**, not furniture you place (Sprint 4).
- **Lamps and street lamps glow, with a pool of light drawn on the floor,** but are not
  real light sources (Sprints 4 and 6).
- **No palms:** every plot is in Sweden (Sprint 5).
- **Snow is a colour on surfaces facing up**, with no depth (Sprint 5).
- **Level of detail goes by distance from the plot, not the camera** (Sprint 7).
- **Nothing moves under automated tests**; screenshots step the clock by hand (Sprints 2
  and 7).
