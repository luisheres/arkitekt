//! Turns the `house_core` model into Bevy entities, draws the plot, and handles the
//! keyboard tweaks available in the milestone-2 viewer.

use bevy::asset::RenderAssetUsages;
use bevy::mesh::PrimitiveTopology;
use bevy::light::ShadowFilteringMethod;
use bevy::prelude::*;
use house_core::{
    House, OpeningKind, PriceList, Plot, Roof, RoofMaterial, RoofStyle, TriMesh, WallMaterial, build_floor,
    build_roof, wall_pieces,
};

use crate::camera::{OrbitCamera, apply_preset};

pub struct HouseViewPlugin;

impl Plugin for HouseViewPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(ClearColor(Color::srgb(0.62, 0.78, 0.93)))
            .insert_resource(GlobalAmbientLight {
                color: Color::srgb(0.85, 0.9, 1.0),
                brightness: 600.0,
                ..default()
            })
            .add_systems(Startup, (setup_palette, setup_scene))
            .add_systems(
                Update,
                (
                    edit_controls,
                    rebuild_house.run_if(resource_changed::<Viewer>),
                    draw_plot_outline.run_if(|v: Res<Viewer>| v.show_guides),
                )
                    .chain(),
            );
    }
}

/// What the viewer is showing: one of the sample houses on a plot.
#[derive(Resource)]
pub struct Viewer {
    pub plot: Plot,
    pub houses: Vec<(&'static str, House)>,
    pub index: usize,
    pub budget: f64,
    pub prices: PriceList,
    /// Plot boundary and setback lines. Hidden when capturing screenshots for the appraiser.
    pub show_guides: bool,
}

impl Viewer {
    pub fn house(&self) -> &House {
        &self.houses[self.index].1
    }
    pub fn house_mut(&mut self) -> &mut House {
        &mut self.houses[self.index].1
    }
    pub fn name(&self) -> &'static str {
        self.houses[self.index].0
    }
}

/// Marks every entity that belongs to the current house so it can be rebuilt.
#[derive(Component)]
struct HouseGeometry;

#[derive(Resource)]
struct Palette {
    cube: Handle<Mesh>,
    wood: Handle<StandardMaterial>,
    brick: Handle<StandardMaterial>,
    plaster: Handle<StandardMaterial>,
    shingles: Handle<StandardMaterial>,
    metal: Handle<StandardMaterial>,
    tiles: Handle<StandardMaterial>,
    glass: Handle<StandardMaterial>,
    frame: Handle<StandardMaterial>,
    door: Handle<StandardMaterial>,
    floor: Handle<StandardMaterial>,
}

impl Palette {
    fn wall(&self, m: WallMaterial) -> Handle<StandardMaterial> {
        match m {
            WallMaterial::Wood => self.wood.clone(),
            WallMaterial::Brick => self.brick.clone(),
            WallMaterial::Plaster => self.plaster.clone(),
        }
    }
    fn roof(&self, m: RoofMaterial) -> Handle<StandardMaterial> {
        match m {
            RoofMaterial::Shingles => self.shingles.clone(),
            RoofMaterial::Metal => self.metal.clone(),
            RoofMaterial::Tiles => self.tiles.clone(),
        }
    }
}

fn setup_palette(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let mut matte = |r: f32, g: f32, b: f32, roughness: f32| {
        materials.add(StandardMaterial {
            base_color: Color::srgb(r, g, b),
            perceptual_roughness: roughness,
            ..default()
        })
    };
    let wood = matte(0.58, 0.40, 0.26, 0.85);
    let brick = matte(0.60, 0.27, 0.20, 0.95);
    let plaster = matte(0.93, 0.89, 0.80, 0.9);
    let frame = matte(0.96, 0.96, 0.94, 0.6);
    let door = matte(0.30, 0.18, 0.11, 0.7);
    let floor = matte(0.55, 0.55, 0.53, 0.95);
    // Roofs and gables are thin single-layer surfaces, so render both sides.
    let mut roof = |r: f32, g: f32, b: f32, roughness: f32, metallic: f32| {
        materials.add(StandardMaterial {
            base_color: Color::srgb(r, g, b),
            perceptual_roughness: roughness,
            metallic,
            double_sided: true,
            cull_mode: None,
            ..default()
        })
    };
    let shingles = roof(0.22, 0.22, 0.25, 0.9, 0.0);
    let metal = roof(0.42, 0.47, 0.52, 0.45, 0.6);
    let tiles = roof(0.56, 0.23, 0.15, 0.8, 0.0);
    let glass = materials.add(StandardMaterial {
        base_color: Color::srgba(0.45, 0.62, 0.78, 0.55),
        perceptual_roughness: 0.08,
        reflectance: 0.8,
        alpha_mode: AlphaMode::Blend,
        ..default()
    });
    commands.insert_resource(Palette {
        cube: meshes.add(Cuboid::new(1.0, 1.0, 1.0)),
        wood,
        brick,
        plaster,
        shingles,
        metal,
        tiles,
        glass,
        frame,
        door,
        floor,
    });
}

fn setup_scene(
    mut commands: Commands,
    viewer: Res<Viewer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let plot = &viewer.plot;
    let center = Vec3::new(plot.width * 0.5, 0.0, plot.depth * 0.5);

    // Surrounding land, the plot's lawn, and a street along the front (low-z) edge.
    let flat = |w: f32, d: f32| Plane3d::default().mesh().size(w, d);
    commands.spawn((
        Mesh3d(meshes.add(flat(400.0, 400.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.42, 0.55, 0.30),
            perceptual_roughness: 1.0,
            ..default()
        })),
        Transform::from_translation(center - Vec3::Y * 0.01),
    ));
    commands.spawn((
        Mesh3d(meshes.add(flat(plot.width, plot.depth))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.38, 0.62, 0.28),
            perceptual_roughness: 1.0,
            ..default()
        })),
        Transform::from_translation(center),
    ));
    commands.spawn((
        Mesh3d(meshes.add(flat(400.0, 7.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.32, 0.32, 0.34),
            perceptual_roughness: 0.95,
            ..default()
        })),
        Transform::from_xyz(center.x, 0.0, -4.5),
    ));

    commands.spawn((
        DirectionalLight {
            illuminance: 12_000.0,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_xyz(-30.0, 50.0, -20.0).looking_at(center, Vec3::Y),
    ));

    let mut orbit = OrbitCamera {
        target: center + Vec3::Y * 2.0,
        yaw: 0.0,
        pitch: 0.0,
        distance: 24.0,
    };
    apply_preset(&mut orbit, 1);
    // Hardware 2x2 shadow filtering works on every backend, including Mesa's software GL
    // (the default Gaussian filter needs a shader feature Mesa's GL lacks).
    commands.spawn((Camera3d::default(), ShadowFilteringMethod::Hardware2x2, orbit.transform(), orbit));
}

fn draw_plot_outline(viewer: Res<Viewer>, mut gizmos: Gizmos) {
    let p = &viewer.plot;
    let rect = |inset: f32| {
        let h = 0.03;
        [
            Vec3::new(inset, h, inset),
            Vec3::new(p.width - inset, h, inset),
            Vec3::new(p.width - inset, h, p.depth - inset),
            Vec3::new(inset, h, p.depth - inset),
        ]
    };
    for (corners, color) in [
        (rect(0.0), Color::srgb(1.0, 1.0, 1.0)),
        (rect(p.setback), Color::srgb(1.0, 0.85, 0.3)),
    ] {
        for i in 0..4 {
            gizmos.line(corners[i], corners[(i + 1) % 4], color);
        }
    }
}

/// Keyboard tweaks so the generated geometry can be explored before the real editor exists.
fn edit_controls(keys: Res<ButtonInput<KeyCode>>, mut viewer: ResMut<Viewer>) {
    if keys.just_pressed(KeyCode::Tab) {
        viewer.index = (viewer.index + 1) % viewer.houses.len();
    }
    if keys.just_pressed(KeyCode::KeyG) {
        viewer.show_guides = !viewer.show_guides;
    }

    let roof_default = || Roof {
        style: RoofStyle::Gable,
        pitch_deg: 30.0,
        overhang: 0.4,
        material: RoofMaterial::Shingles,
    };

    if keys.just_pressed(KeyCode::KeyR) {
        let roof = viewer.house_mut().roof.get_or_insert_with(roof_default);
        roof.style = next(&RoofStyle::ALL, roof.style);
    }
    if keys.just_pressed(KeyCode::KeyT) {
        let roof = viewer.house_mut().roof.get_or_insert_with(roof_default);
        roof.material = next(&RoofMaterial::ALL, roof.material);
    }
    if keys.just_pressed(KeyCode::KeyM) {
        let house = viewer.house_mut();
        let cur = house.walls.first().map_or(WallMaterial::Wood, |w| w.material);
        let new = next(&WallMaterial::ALL, cur);
        house.walls.iter_mut().for_each(|w| w.material = new);
    }
    for (key, d_pitch, d_overhang) in [
        (KeyCode::BracketLeft, -5.0, 0.0),
        (KeyCode::BracketRight, 5.0, 0.0),
        (KeyCode::KeyO, 0.0, -0.1),
        (KeyCode::KeyP, 0.0, 0.1),
    ] {
        if keys.just_pressed(key) {
            let roof = viewer.house_mut().roof.get_or_insert_with(roof_default);
            roof.pitch_deg = (roof.pitch_deg + d_pitch).clamp(5.0, 65.0);
            roof.overhang = ((roof.overhang + d_overhang).clamp(0.0, 1.5) * 10.0).round() / 10.0;
        }
    }
    for (key, dh) in [(KeyCode::Minus, -0.1), (KeyCode::Equal, 0.1)] {
        if keys.just_pressed(key) {
            for w in &mut viewer.house_mut().walls {
                w.height = ((w.height + dh).clamp(2.0, 5.0) * 10.0).round() / 10.0;
            }
        }
    }
}

/// The element after `cur` in `all`, wrapping around.
fn next<T: Copy + PartialEq>(all: &[T], cur: T) -> T {
    all[(all.iter().position(|x| *x == cur).unwrap_or(0) + 1) % all.len()]
}

fn to_mesh(t: &TriMesh) -> Mesh {
    let uvs = vec![[0.0f32, 0.0]; t.positions.len()];
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default())
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, t.positions.clone())
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, t.normals.clone())
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
}

const FRAME_WIDTH: f32 = 0.07;

fn rebuild_house(
    mut commands: Commands,
    viewer: Res<Viewer>,
    palette: Res<Palette>,
    mut meshes: ResMut<Assets<Mesh>>,
    old: Query<Entity, With<HouseGeometry>>,
) {
    for e in &old {
        commands.entity(e).despawn();
    }
    let house = viewer.house();

    let cube = |commands: &mut Commands, center: Vec3, size: Vec3, rot: Quat, mat: &Handle<StandardMaterial>| {
        commands.spawn((
            HouseGeometry,
            Mesh3d(palette.cube.clone()),
            MeshMaterial3d(mat.clone()),
            Transform {
                translation: center,
                rotation: rot,
                scale: size,
            },
        ));
    };

    for wall in &house.walls {
        let openings = house.openings_in(wall.id);
        let d = wall.direction();
        let rot = Quat::from_rotation_y((-d.y).atan2(d.x));
        // Wall-local (u along the wall, v up) to world space.
        let at = |u: f32, v: f32| {
            let p = wall.start + d * u;
            Vec3::new(p.x, v, p.y)
        };
        let wall_mat = palette.wall(wall.material);
        let t = wall.thickness;

        for p in wall_pieces(wall, &openings) {
            let center = at((p.u0 + p.u1) * 0.5, (p.v0 + p.v1) * 0.5);
            cube(&mut commands, center, Vec3::new(p.u1 - p.u0, p.v1 - p.v0, t), rot, &wall_mat);
        }

        for o in openings {
            let (w, h, fw) = (o.width, o.height, FRAME_WIDTH);
            let mid_v = o.sill + h * 0.5;
            let frame_depth = t + 0.04;
            // Frame: top, left and right bars (plus a sill bar for windows).
            cube(&mut commands, at(o.offset, o.top() - fw * 0.5), Vec3::new(w, fw, frame_depth), rot, &palette.frame);
            for side in [o.left() + fw * 0.5, o.right() - fw * 0.5] {
                cube(&mut commands, at(side, mid_v), Vec3::new(fw, h, frame_depth), rot, &palette.frame);
            }
            match o.kind {
                OpeningKind::Window => {
                    cube(&mut commands, at(o.offset, o.sill + fw * 0.5), Vec3::new(w, fw, frame_depth + 0.04), rot, &palette.frame);
                    if w >= 1.6 {
                        // Split wide windows with mullions roughly every metre.
                        let panes = (w / 1.0).round() as i32;
                        for i in 1..panes {
                            let u = o.left() + w * i as f32 / panes as f32;
                            cube(&mut commands, at(u, mid_v), Vec3::new(fw * 0.8, h, frame_depth * 0.6), rot, &palette.frame);
                        }
                    }
                    cube(&mut commands, at(o.offset, mid_v), Vec3::new(w - fw, h - fw, 0.02), rot, &palette.glass);
                }
                OpeningKind::Door => {
                    cube(&mut commands, at(o.offset, mid_v - fw * 0.5), Vec3::new(w - fw * 2.0, h - fw, 0.06), rot, &palette.door);
                }
            }
        }
    }

    if let Ok(floor) = build_floor(house) {
        commands.spawn((
            HouseGeometry,
            Mesh3d(meshes.add(to_mesh(&floor))),
            MeshMaterial3d(palette.floor.clone()),
        ));
    }

    if let (Some(roof), Ok(geom)) = (&house.roof, build_roof(house)) {
        commands.spawn((
            HouseGeometry,
            Mesh3d(meshes.add(to_mesh(&geom.surface))),
            MeshMaterial3d(palette.roof(roof.material)),
        ));
        if !geom.gables.is_empty() {
            let mat = house.walls.first().map_or(WallMaterial::Plaster, |w| w.material);
            commands.spawn((
                HouseGeometry,
                Mesh3d(meshes.add(to_mesh(&geom.gables))),
                MeshMaterial3d(palette.wall(mat)),
            ));
        }
    }
}
