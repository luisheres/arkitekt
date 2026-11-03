//! Orbit camera: left-drag to rotate, right-drag to pan, scroll to zoom.
//! Number keys 1-4 jump to the fixed views that the appraiser will also use.

use bevy::input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit};
use bevy::prelude::*;
use std::f32::consts::{FRAC_PI_2, PI};

pub struct OrbitCameraPlugin;

impl Plugin for OrbitCameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, (orbit_input, preset_views, apply_orbit).chain());
    }
}

#[derive(Component, Debug, Clone, Copy)]
pub struct OrbitCamera {
    pub target: Vec3,
    /// Rotation around the vertical axis. 0 looks from +Z towards the target; PI looks from -Z (the street).
    pub yaw: f32,
    /// Angle above the horizon.
    pub pitch: f32,
    pub distance: f32,
}

impl OrbitCamera {
    pub fn transform(&self) -> Transform {
        let offset = Vec3::new(
            self.distance * self.pitch.cos() * self.yaw.sin(),
            self.distance * self.pitch.sin(),
            self.distance * self.pitch.cos() * self.yaw.cos(),
        );
        Transform::from_translation(self.target + offset).looking_at(self.target, Vec3::Y)
    }
}

/// The fixed viewpoints used for screenshots: front, front-right ¾, back, front-left ¾.
/// Returns (yaw, pitch) pairs.
pub const PRESET_VIEWS: [(&str, f32, f32); 4] = [
    ("front", PI, 0.18),
    ("front-right", PI * 0.75, 0.30),
    ("back", 0.0, 0.18),
    ("front-left", -PI * 0.75, 0.30),
];

pub fn apply_preset(cam: &mut OrbitCamera, index: usize) {
    let (_, yaw, pitch) = PRESET_VIEWS[index % PRESET_VIEWS.len()];
    cam.yaw = yaw;
    cam.pitch = pitch;
}

fn orbit_input(
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    mut cameras: Query<&mut OrbitCamera>,
) {
    let Ok(mut cam) = cameras.single_mut() else { return };
    let delta = motion.delta;

    if buttons.pressed(MouseButton::Left) && delta != Vec2::ZERO {
        cam.yaw -= delta.x * 0.006;
        cam.pitch = (cam.pitch + delta.y * 0.006).clamp(0.02, FRAC_PI_2 - 0.05);
    }
    if buttons.pressed(MouseButton::Right) && delta != Vec2::ZERO {
        // Pan in the ground plane, relative to where the camera is looking.
        let right = Vec3::new(cam.yaw.cos(), 0.0, -cam.yaw.sin());
        let forward = Vec3::new(-cam.yaw.sin(), 0.0, -cam.yaw.cos());
        let speed = cam.distance * 0.0015;
        cam.target += (-right * delta.x + forward * delta.y) * speed;
    }
    let lines = match scroll.unit {
        MouseScrollUnit::Line => scroll.delta.y,
        MouseScrollUnit::Pixel => scroll.delta.y / 40.0,
    };
    if lines != 0.0 {
        cam.distance = (cam.distance * (1.0 - lines * 0.1)).clamp(5.0, 120.0);
    }
}

fn preset_views(keys: Res<ButtonInput<KeyCode>>, mut cameras: Query<&mut OrbitCamera>) {
    let Ok(mut cam) = cameras.single_mut() else { return };
    for (i, key) in [KeyCode::Digit1, KeyCode::Digit2, KeyCode::Digit3, KeyCode::Digit4]
        .into_iter()
        .enumerate()
    {
        if keys.just_pressed(key) {
            apply_preset(&mut cam, i);
        }
    }
}

fn apply_orbit(mut cameras: Query<(&OrbitCamera, &mut Transform), Changed<OrbitCamera>>) {
    for (cam, mut transform) in &mut cameras {
        *transform = cam.transform();
    }
}
