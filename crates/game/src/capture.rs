//! `--capture <dir>`: render the current house offscreen from the four preset views, save
//! each as a PNG and exit. No window is opened: the camera renders into an image. This is
//! the image set the AI appraiser will receive in milestone 4, and it is useful for checking
//! rendering changes from scripts.

use bevy::camera::RenderTarget;
use bevy::prelude::*;
use bevy::render::render_resource::TextureFormat;
use bevy::render::view::screenshot::{Screenshot, ScreenshotCaptured, save_to_disk};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::camera::{OrbitCamera, PRESET_VIEWS, apply_preset};

/// Size of the captured images.
pub const CAPTURE_SIZE: (u32, u32) = (1280, 800);

/// Frames to wait before the first capture so pipelines compile and shadows settle.
const WARMUP_FRAMES: u32 = 90;
/// Frames to wait after moving the camera before capturing.
const SETTLE_FRAMES: u32 = 10;

#[derive(Resource)]
pub struct CaptureRequest {
    pub dir: PathBuf,
    pub prefix: String,
}

pub struct CapturePlugin;

impl Plugin for CapturePlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(CaptureState {
            phase: Phase::Warmup(WARMUP_FRAMES),
            view: 0,
            captured: Arc::new(AtomicBool::new(false)),
            target: None,
        })
        .add_systems(PostStartup, render_offscreen.run_if(resource_exists::<CaptureRequest>))
        .add_systems(Update, drive_capture.run_if(resource_exists::<CaptureRequest>));
    }
}

enum Phase {
    Warmup(u32),
    Settle(u32),
    Waiting,
    Exit(u32),
}

#[derive(Resource)]
struct CaptureState {
    phase: Phase,
    view: usize,
    captured: Arc<AtomicBool>,
    /// The image the camera renders into.
    target: Option<Handle<Image>>,
}

/// Point the orbit camera at an offscreen image instead of a window.
fn render_offscreen(
    mut commands: Commands,
    mut images: ResMut<Assets<Image>>,
    mut state: ResMut<CaptureState>,
    cameras: Query<Entity, With<OrbitCamera>>,
) {
    let (w, h) = CAPTURE_SIZE;
    let handle = images.add(Image::new_target_texture(w, h, TextureFormat::Rgba8UnormSrgb, None));
    for camera in &cameras {
        commands.entity(camera).insert(RenderTarget::Image(handle.clone().into()));
    }
    state.target = Some(handle);
}

fn drive_capture(
    mut commands: Commands,
    request: Res<CaptureRequest>,
    mut state: ResMut<CaptureState>,
    mut cameras: Query<&mut OrbitCamera>,
    mut exit: MessageWriter<AppExit>,
) {
    let view = state.view;
    let state = &mut *state;
    match &mut state.phase {
        Phase::Warmup(n) | Phase::Settle(n) if *n > 0 => *n -= 1,
        Phase::Warmup(_) => {
            if let Ok(mut cam) = cameras.single_mut() {
                apply_preset(&mut cam, view);
            }
            state.phase = Phase::Settle(SETTLE_FRAMES);
        }
        Phase::Settle(_) => {
            let Some(target) = state.target.clone() else { return };
            let name = PRESET_VIEWS[view].0;
            let path = request.dir.join(format!("{}{}-{}.png", request.prefix, view + 1, name));
            info!("capturing {}", path.display());
            let flag = state.captured.clone();
            let mut save = save_to_disk(path);
            commands
                .spawn(Screenshot::image(target))
                .observe(move |captured: On<ScreenshotCaptured>| {
                    save(captured);
                    flag.store(true, Ordering::SeqCst);
                });
            state.phase = Phase::Waiting;
        }
        Phase::Waiting => {
            if state.captured.swap(false, Ordering::SeqCst) {
                state.view += 1;
                if state.view >= PRESET_VIEWS.len() {
                    state.phase = Phase::Exit(5);
                } else {
                    if let Ok(mut cam) = cameras.single_mut() {
                        apply_preset(&mut cam, state.view);
                    }
                    state.phase = Phase::Settle(SETTLE_FRAMES);
                }
            }
        }
        Phase::Exit(n) if *n > 0 => *n -= 1,
        Phase::Exit(_) => {
            exit.write(AppExit::Success);
        }
    }
}
