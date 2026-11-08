# Architect

You are an architect. Clients come to you with a plot, a budget and a brief: a retired
couple who want everything on one level, a family that needs a bedroom for each kid, a
carpenter who wants a workshop. Design a house that meets their must-haves, grant as many
of their wishes as you can, and present it. If they accept, you earn a fee (more for each
wish granted), stars for your reputation, and the next clients call.

Start with the **campaign** or **free play** (the welcome screen; **🏠 Menu** in the
sidebar brings it back):

- **Campaign.** You start with a basic kit: wood and plaster facades, gable roofs with
  shingles, laminate, tiles, carpet and concrete floors, one storey. The money you earn
  buys new techniques in the **🔨 Workshop**: more facades (Falu red, brick, stone,
  concrete), roofs (hip, flat, metal, tiles), floors (wood, stone), wall paint in eight
  colours, houseplants, garden design (trees, shrubs, flower beds and hedges), open plan,
  garages, second and third storeys, balconies, basements, double-height rooms, glass doors, fireplaces, terraces, dormers, and business techniques that make
  building cheaper or raise your fee. Some
  build on others. Anything not learned yet shows a 🔒 and opens the Workshop when
  clicked. The stars clients give you are your reputation, and it opens four tiers of
  clients: starter homes, family homes (5 ⭐), villas (14 ⭐) and signature houses
  (28 ⭐), each with bigger households, finer plots and larger budgets. Playing well
  (about two stars a house) reaches the top tier around the fifteenth house.
  A new campaign starts with a **difficulty**: on **easy** budgets are 25% roomier, on
  **moderate** they are as the clients state them, and on **hard** they are 15% tighter,
  but never below 10% over what a plain house meeting the must-haves costs, so every job
  stays possible. Your fee is the same at every level (reckoned on the moderate budget),
  so the campaign moves at the same pace. **Start over** picks the difficulty again.
- **Free play.** Any plot, every technique, no client and no budget: just build.

A TypeScript web game built with Vite and Three.js. (The first prototype was Rust/Bevy; it
is in the first git commit.)

## Layout

| Path | Purpose |
|---|---|
| `src/core` | Renderer-free game logic, fully unit-tested (Vitest). `i18n/` message catalogs and number formatting; `model.ts` walls, openings, roof and room labels; `layout.ts` finds rooms, the outline and exterior walls from the wall graph; `rooms.ts` room types, doors, windows and reachability; `validate.ts` building rules; `cost.ts` prices, line by line; `treemap.ts` the cost chart's layout; `roof.ts` roof and floor geometry; `brief.ts` requirements, evaluation and the client's verdict; `designfile.ts` saved designs; `scenery.ts` the landscape around each plot; `clients.ts` the written clients, the career and the clients on offer; `progression.ts` techniques, abilities and tiers; `difficulty.ts` budgets per difficulty; `site.ts` building on slopes: the platform, earthworks and the shaped ground; `access.ts` driveways and paths from the road; `features.ts` chimneys, dormers, skylights and steps; `sun.ts` sun positions and sun hours; `decor.ts` lamps, rugs, pictures, cabinets and stair rails; `street.ts` lamps, cars, signs and crossings along the roads; `neighbors.ts` the neighbours as game houses, and shops in town; `generate.ts` generated clients by tier; `furniture.ts` + `furnish.ts` furniture catalog and automatic furnishing; `edit.ts` editing operations; `history.ts` undo. |
| `src/game` | The game UI: `store.ts` (state, undo, autosave), `plan.ts` (2D plan tools), `view3d.ts` + `scene.ts` + `interior3d.ts` (Three.js view), `panel.ts` + `hud.ts` (sidebar), `popover.ts` + `inspector.ts` (click menus), `designs.ts` (saved designs), `landscape.ts` + `backdrop.ts` (surroundings in 3D and in the plan), `textures.ts` (cartoon materials), `dialogs.ts` (client and verdict), `capture.ts` (appraisal views). |
| `scripts/e2e.mjs` | End-to-end check: plays the first commission through the real UI in headless Chromium. |
| `scripts/capture.mjs` | Headless capture of the four appraisal views (Playwright + software WebGL). |

## Running

```sh
npm install
npm run dev                        # open the printed URL (http://localhost:5173)
npm test                           # unit tests
npm run e2e -- --out screenshots/  # end-to-end check (screenshots optional)
npm run typecheck
npm run build                      # static site in dist/
npm run capture -- --sample 2 --out screenshots/   # render the 4 appraisal views to PNG
```

Progress (career and the commission in progress) autosaves in the browser. `?sample=N`
puts sample house N on the current plot, for screenshots. `npm run e2e` and
`npm run capture` need `npx playwright install chromium` once.

### Publishing on GitHub Pages

The build is a static site with relative paths, so it works from any folder, such as
`https://<user>.github.io/<repo>/`. `.github/workflows/deploy.yml` runs the unit tests,
builds and publishes the game on every push to `main` (or by hand from the Actions tab).
Once, after pushing the repository to GitHub: **Settings → Pages → Source: GitHub
Actions**. Pages is free for public repositories.

Saved games live in each player's browser, per site: everything at `<user>.github.io`
shares one storage, and the game's keys all start with `architect.`.

## Look

The 3D view is a bright cartoon: cel shading (three flat bands of light), dark outlines,
saturated hand-drawn textures, a gradient sky with puffy clouds and haze in the
distance. Every plot has its own surroundings, generated from fixed seeds
(`src/core/scenery.ts`) and shown both in 3D and in the plan:

There are 30 plots in nine kinds of surroundings, and each has its own layout
(`LAYOUTS` in `src/core/scenery.ts`), so no two feel the same:

- **Roads** reach a plot from any side, in different ways: a street along the front, two
  streets meeting at a corner, a cul-de-sac ending in a turning circle with houses round
  it, a gravel track winding in through the woods from a lane further off, or a private
  drive. Main streets have a centre line and pavements, lanes are narrower, gravel tracks
  have grass down the middle. The plan names each road. Roads lie level across, with the ground shaped to them.
- **Water**: lakes have irregular shores with bays, some with islands, reeds in clumps or
  sandy beaches; rivers wind and change width, with a footbridge; the sea has a curving
  coast, a beach, a cliff or a harbour pier. Water always stays a few metres from the plot.
- **Woods** grow in patches with bushy edges (pines and birches in their own stands),
  birches along the water, avenues of trees along country lanes, orchards and fields in
  parcels with stone walls.
- **Landmarks**: churches, a fountain, playgrounds, windmills, barns and silos, hay bales,
  boathouses and saunas on the shore, lighthouses, an old mill ruin, a cabin in the woods,
  ski lifts up the slopes.
- **Neighbours** line the roads, facing them, with gable, hip or flat roofs, one or two
  storeys.

Each plot is bought by certain client tiers, so better plots come with bigger clients; free
play can build on any of them. In 3D the land reaches far beyond the camera and rolls into
hazy hills on the horizon (mountains, in mountain country), so its edge is never seen; the
views face the house from the road. The camera never sinks into a hillside: it rises to see
over the land to the house.

**Getting to the house.** A driveway leads from where the road reaches the plot to each
garage door, and a path to the front door, going round the house where they must. They are
asphalt (gravel off a gravel track) and priced per m², so where the road is matters: a
garage facing away from the road needs a long drive round the house. A garage door no car
can reach (facing the edge of the plot, or boxed in) is a building problem.

**Sloping ground.** Most of the newer plots are not flat. Each has a clear lie of the
land, built from a few natural landforms: an even slope rising towards the back (or
falling towards the water), a tilt to one side, a valley running down the plot, or rounded
hills and hollows (the dunes have two). They are always level with the street at the
front. The plan shows contour lines every half metre, with heights on every whole metre. A house stands on a level
platform at the average height of the ground under it. Uphill, the ground is dug away, level
with the platform for a metre's working space around the house, then back up to its
natural lie (held by a retaining wall where the cut is deep). Downhill, a shallow drop is
filled as a gentle bank up to the house; a deeper one is left as it is, and the house's own
base shows, flush with the facade: its basement walls, or an exposed foundation wall
(priced per m²). The sidebar
shows the platform's height and the earth moved; every cubic metre costs money
(Groundworks), so where on the plot you build, and how big, matters. The original three
plots stay flat.

Under **Move & turn**, **Platform height** raises the platform above the ground's average
(more earth filled in) or lowers it (more dug out), up to 1.5 m either way. Where the
ground uphill is cut more than about 0.8 m deep, a stone retaining wall at the edge of the
working space holds it instead of a slope; it is drawn in 3D and priced per m².

**Moving and turning the house.** **✋ Move house** (`M`) drags the whole house around the
plot, rooms, stairs and furniture too (the garden's plants stay where they are). **Move &
turn** in the sidebar turns it a quarter at a time, or 15° at a time, about its middle;
roofs still fit at any angle, and turning back puts the walls on the grid again. On a
slope, moving it changes how much earth is dug.

**Sun and light.** The 3D view's Show panel has a sun slider (time of day) and a season;
the sun stands where it really would in Sweden (north is up in the plan, the street side
faces south). Shadows move with it, low and golden in the evening, and windows glow at
dusk. Hiding the roof or upper floors still keeps their shadows, so you can see how the
light really falls into the rooms. A terrace's or balcony's menu shows its hours of sun,
and some clients want a sunny terrace or a balcony with the evening sun. The sprints that
improve the 3D views are documented in [`sprints/`](sprints/README.md).

**Details.** Windows come in three styles (standard, cottage with shutters, modern) and
five frame colours. Houses get sills, lintels or trim, door canopies, a plinth, corner
boards on wooden facades, and gutters and down pipes along the eaves. **Skylights** lie in
the roof slope, cheaper than dormers. A door above the ground gets steps, or a ramp,
which are paid for.

**Rooms that look lived in.** Rooms get a ceiling lamp (lit at dusk, with a pool of light
on the floor), rugs under coffee tables, beds and dining tables, pictures on free walls,
skirting boards, wall cabinets over kitchen counters, and railings on stairs and round
stairwells. They follow the rooms and furniture on their own (`src/core/decor.ts`).

**Seasons and the garden.** The season menu changes the whole world: blossom in spring,
autumn colours, bare trees, snow on the ground and roofs, and frozen lakes in winter.
The landscape has oaks, maples, willows and stumps, and long grass, wildflowers and ferns.
The Garden menu adds a shed, a greenhouse, a pond, a vegetable patch, a swing and a
trampoline (in the back garden), and a picket or board fence with a gate.

**Streets.** Roads have street lamps that light up at dusk, parked cars, give-way and 30
signs, a bus stop by main roads, letterboxes, zebra crossings, rounded corners where they
meet, and a farm gate on gravel tracks (`src/core/street.ts`).

**Neighbours and life.** Nearby neighbours are real houses of the game, built and drawn
like the player's (`src/core/neighbors.ts`), with fences and cars. In town, the nearest
ones are a café, a bakery, a grocer and an ice-cream shop. Windmill sails turn, ski lift
chairs run, boats bob, cars drive, people walk (one with a dog) and birds circle overhead.

**Doors, openings and roofs.** Outer walls take windows, doors, **glass doors** (wide, and
they let daylight in like windows) and garage doors; inside walls take doors or an
**opening**: a gap with no door that joins two rooms. Gable and hip roofs work on any
house with square corners: an L, T or U is split into a main block and wings whose roofs
meet in valleys. The Roof menu's **+ Dormer** (or a top-floor wall's menu) adds a **dormer** (a window with its own
little roof in the slope above that wall; it lights the room under it and needs a slope,
not a gable end), and on the ground floor a **terrace** (a wooden deck outside a door).
A **fireplace** from a room's furniture list gets a brick chimney up through the storeys
above and out through the roof, priced by its height.

**Double height.** With the Double height technique (after two storeys), a room's menu
has **⬍ Double height**: the floor above it opens up, so the room is two storeys high.
Upstairs, the space over it becomes "Open to below" (open room boundaries go along its
sides where there are no walls), with a glass railing along its open edges, so the rooms
around it look down into it like a gallery. There is no floor (and no floor cost) over it,
and it does not count as floor area. **Close the floor above** puts it back. On an upper
floor a room can also be set to "Open to below" directly. Some clients wish for a
double-height living room, office or kitchen.

**Basements.** With the Basements technique, **+ Basement** on the floors card digs a
storey under the house, with concrete walls along the ground floor's outline. Divide it
into rooms like any storey; it needs stairs down to it, it has to fit under the house, and
its outer walls cannot have doors (they are under the ground). Windows look out into a
light well, a grated pit dug beside them (priced per window), so with windows a basement
can have bedrooms or an office too. Digging it out and its walls cost money; it
does not count towards the floor area. In 3D, hide the ground floor to look into it.

The plot itself and the street stay flat, so building is the same everywhere.

Outlines are drawn the same way on everything (`src/game/toonPost.ts`): after the colour
pass, the scene is drawn again for surface directions and depth, and a full-screen pass
draws a line wherever the depth jumps (silhouettes) or surfaces meet at a sharp angle.
Far away the lines soften to a darker shade of what they outline.

Trees come in a few kinds: round leafy trees (some blossom pink, some bear apples), birches
with white, marked trunks, layered pines, and flowering bushes. Their crowns are shaded
darker underneath, and the plan shows the same trees from above.

## Playing

1. **Choose a client.** **📋 Clients** lists who would like a house: the story's next
   written client, and generated clients at your tier (sometimes a smaller job from the
   tier below), with their plot, budget, the fee you could earn, and any technique their
   must-haves need that you have not learned. **↻ Other clients** asks for others. Read a
   brief and take the job; switching to another client while working saves your design
   first. **Brief** in the sidebar shows it again; the checklist updates live as you
   design.
2. **Draw the house.** Outer walls first (Room tool), then interior walls from wall to
   wall to divide it into rooms.
3. **Say what each room is.** Click a room and pick its use in the menu that opens:
   living room, kitchen, bedroom, bathroom, WC, hall, office, utility room, garage or
   storage. The room is furnished for its use; drag pieces to move them, remove or add
   pieces in the room's menu, or click a piece to rotate, resize or delete it.
4. **Add doors and windows, and a roof.** Every room must be reachable through doors from
   the front door; bedrooms, living rooms, kitchens and offices need a window; a garage
   needs a garage door (select a door and change its type, or use the wall's buttons).
5. **Choose materials.** Click an outer wall (or **Facade** in the sidebar) for the
   facade: wood boards, Falu red panel, brick, plaster or stone, for one wall or all.
   Click the roof in 3D (or **Roof**) for its style, pitch, overhang and covering. Each
   room's floor (wood, laminate, tiles, stone, carpet or concrete) is in its menu. Everything has a
   price, and wet rooms and garages need hard, waterproof floors. **Where does the money
   go?** under the costs opens a live treemap of the house's costs over the views: a box
   per group (facade, roof, floors, windows and doors, interior walls, stairs), split into
   a box per material, floor finish or kind of opening, each sized by what it costs. It
   follows every edit, and boxes whose cost just changed flash. Point at a box for its
   area and price per m²; drag the panel by its title, resize it from its corner. It
   remembers where you put it.
   Rooms can be painted inside (the room's menu), plants in pots added from a room's
   furniture list, and the garden planted from **🌳 Garden** in the sidebar: each new
   plant goes in a free spot, ready to drag where you like. On an upper floor, an outer
   wall's menu adds a **balcony**: slide it along the wall, set its width and depth in its
   menu, and give it a door out. Balconies, plants and paint have their own costs.
6. **Present to client.** They accept when every must-have is met, the house has no
   building problems (using a technique not learned yet is one) and it is within budget.
   Your fee is 8% of their budget (more with Marketing), plus up to half again for wishes
   granted, and 1–3 stars for your reputation.

**Saving.** Everything is kept in the browser's storage, nothing is downloaded: the
campaign (money, reputation, techniques, difficulty), the house you are working on in the
campaign, and your free play house are saved automatically as you go (and when the page
closes), each separately. To keep several designs, **Save** (`Ctrl+S`) stores the current
one under a name, with a picture; saving again updates it, or save a new copy. **Open…**
lists your saved designs from both modes and picks one up again (a campaign design makes
its client your commission, a free play design opens in free play; the design you were
on is saved first). Sold designs stay in the list but cannot be sold twice.

**Career.** **📈 Career** in the sidebar looks back on the campaign: houses sold, money
earned, reputation (and stars per house on average), tier and techniques learned; a chart
of the money earned house by house with the tiers marked where they opened, the stars each
house earned, every house sold with its picture, fee, size, cost and date, and when each
technique was learned. Pictures are kept for the 24 most recent houses, so a long career
still fits in the browser's storage.

**Players.** Several people can play in the same browser, each with their own campaign,
free play house and saved designs: the player chip in the sidebar (or **Change player**
on the welcome screen) lists them, adds a new player with a name and a picture, renames or
removes one. Saves from before players existed belong to the first player.

Every pop-up closes with the **×** in its corner or `Escape`. Closing the "Sold!" pop-up
still books the sale; between clients, the sidebar offers to choose the next one. The
**🏠 Menu** shows what you are playing and the game's version.

Besides the five written clients, clients are generated for each tier: couples,
retirees, people working from home, a music student and new parents for starter homes;
families, keen gardeners, three generations under one roof and a family with muddy dogs
for family homes; large families, two doctors with a practice at home, a writer wanting
a view and a balcony, and a very sporty family for villas; artists, a games-company
founder and a TV chef for signature houses. Briefs ask for rooms and sizes, facades,
roofs, floors, open plan, windows, step-free doors, storeys, and now also painted rooms,
plants indoors, a planted garden and balconies. Each has their own household, brief, plot and budget, in both languages.
The campaign and free play are saved separately, so switching loses nothing.

## Editing

**Click to edit.** Clicking a room, wall, window, door, staircase or piece of furniture,
in the plan or in 3D, opens a menu right there with everything about it. Right-click
does the same with any tool. `Esc` closes the menu.

The plan (left) is a view from above with the street at the bottom; the 3D view (right)
updates live. **Plan / Split / 3D** switches the layout; **Roof** (`H`) hides the roof to
look inside.

| Tool | Key | |
|---|---|---|
| Select | `V` | Click a room to set its use. Drag a corner to reshape, a wall to push it in or out (walls attached to it follow), a window or door along (or onto another) wall, a room name to move it. Drag empty space to pan. |
| Room | `R` | Drag a rectangle to create four walls. Sides along existing walls are shared, so rooms can be added next to each other. |
| Open | `B` | Draw a room boundary, like a wall but not built: it divides open-plan space into rooms (e.g. kitchen and living room) that are open to each other. Select an interior wall to switch it between wall and open. |
| Wall | `W` | Click corners. Starting or ending on a wall connects to it (and ends the chain); click the first corner to close a loop. `Enter` or double-click ends an open chain, `Esc` cancels. |
| Window / Door | `N` / `D` | Click a wall. |
| Stairs | `S` | Click inside a room to place a straight flight up to the floor above. Rotate it in the sidebar; drag it to move. |

**3D view.** The **Show** box in the 3D pane turns the roof (`H`), each floor and the
furniture on and off, to look inside. Rooms are furnished automatically for their use
(bed and wardrobe, sofa and TV, kitchen counter and dining table, bath and toilet, desk,
a car in the garage...), against real walls and clear of doors, stairs and windows; the
plan shows the furniture too.

**Floors.** The **Floors** box in the plan switches storeys. **+ Add floor** starts a new
storey on top with the outline of the one below (up to three); **− Remove floor** removes
the top one. The floor below shows faintly underneath, and its corners are snap points.

Points snap to a 0.5 m grid, to corners and onto walls; hold `Alt` for 5 cm steps.
Problem walls, openings and rooms are outlined in red; click an issue in the sidebar to
select it.

Other keys: `Del` delete selection (or clear a room's use), `Ctrl+Z` / `Ctrl+Shift+Z`
undo / redo, `F` fit the plan, wheel zoom and right-drag pan in either view, `1`-`4` 3D
preset views, `G` plot guides, `C` capture the appraisal views.

## Languages

The game speaks English and Swedish. It picks the browser's language the first time and
remembers the choice from the menu next to the title.

All text lives in `src/core/i18n/`: `types.ts` defines `Messages`, and `en.ts` / `sv.ts`
implement it. Client stories and plot names sit with each client in `clients.ts` and
`plot.ts`, one text per language. To add a language: add its code to `LANGS` in
`types.ts`, copy `sv.ts` and translate it, register it in `i18n/index.ts`, and add the
language to every client and plot. The compiler points out anything missing, and
`i18n.test.ts` flags strings left identical to the English.

### In the devcontainer

The dev server runs inside the container; VS Code forwards port 5173, so open the game in
your host browser, which uses your real GPU. Node 22 comes from the devcontainer `node`
feature, and `.devcontainer/post-create-script.sh` runs `npm ci`.

## Building rules

- Single storey. Exterior walls enclose one connected house; interior walls may end on
  other walls (T-junctions) but not cross them. Walls with a loose end must be connected.
- Gable and hip roofs need a rectangular outline; flat roofs work on any shape.
- Windows go in exterior walls; no window or door may straddle a junction with another
  wall.
- Rooms have minimum sizes by use (e.g. bedroom 7 m², garage 15 m²), habitable rooms need
  daylight, and every room must be reachable from outside.
- Upper storeys must rest on the storey below (within its outline), and stairs must
  lead to them: a staircase stands inside rooms on both floors, clear of walls. Rooms
  upstairs are reachable only by stairs. The roof sits on the top storey; where a storey
  is smaller than the one below, the slab below is a flat roof (a terrace).
- Room boundaries make open plan: rooms on either side count as connected (no door
  needed) and share daylight. Boundaries cost nothing, carry no windows or doors, and
  cannot form the outside of the house.
- A sellable house also needs a front door, a roof, at least 20 m² of floor, walls inside
  the plot's setback, and openings that fit their walls. See `src/core/validate.ts`.

## Ideas for next steps

- The AI appraiser: send the four captured views and the brief to Claude, and let its
  judgement of the looks feed into the client's verdict and the fee.
- Clients generated by Claude from a few parameters, instead of a fixed list.
- Unlocks with earnings: bigger plots, better clients, new materials.
