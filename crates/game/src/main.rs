//! Architect: buy a plot, build a house, sell it for a profit.
//!
//! Milestone 2: a 3D viewer for the sample houses from `house_core`.
//!
//! Usage:
//!   architect [--sample N] [--capture DIR]
//!
//! `--sample N` starts on sample house N (1-based). `--capture DIR` renders the four
//! preset views to PNG files in DIR and exits.

mod camera;
mod capture;
mod house_view;
mod hud;

use bevy::app::ScheduleRunnerPlugin;
use bevy::prelude::*;
use bevy::render::RenderPlugin;
use bevy::render::settings::{RenderCreation, WgpuLimits, WgpuSettings};
use bevy::window::ExitCondition;
use bevy::winit::WinitPlugin;
use house_core::{PriceList, samples, starter_plots};
use std::path::PathBuf;
use std::time::Duration;

const STARTING_BUDGET: f64 = 60_000.0;

struct Args {
    sample: usize,
    capture: Option<PathBuf>,
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args { sample: 0, capture: None };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--sample" => {
                let n: usize = it
                    .next()
                    .and_then(|v| v.parse().ok())
                    .ok_or("--sample needs a number")?;
                args.sample = n.saturating_sub(1);
            }
            "--capture" => args.capture = Some(it.next().ok_or("--capture needs a directory")?.into()),
            "-h" | "--help" => {
                println!("usage: architect [--sample N] [--capture DIR]");
                std::process::exit(0);
            }
            other => return Err(format!("unknown argument: {other}")),
        }
    }
    Ok(args)
}

/// GPU settings shared by the game window and headless captures, so both render alike.
fn render_settings() -> WgpuSettings {
    WgpuSettings {
        // Below 5 storage textures per stage Bevy skips its SSAO pipelines. We don't use
        // SSAO, and its shaders fail to compile on Mesa's software OpenGL.
        constrained_limits: Some(WgpuLimits {
            max_storage_textures_per_shader_stage: 4,
            ..WgpuLimits::unlimited()
        }),
        ..default()
    }
}

/// winit prefers Wayland whenever `WAYLAND_DISPLAY` is set and panics if the socket is
/// missing, which happens in devcontainers that only mount the X11 socket. In that case,
/// drop the variable so winit falls back to X11.
fn fall_back_to_x11_if_wayland_missing() {
    let Some(display) = std::env::var_os("WAYLAND_DISPLAY") else { return };
    let socket = PathBuf::from(&display);
    let socket = if socket.is_absolute() {
        socket
    } else {
        match std::env::var_os("XDG_RUNTIME_DIR") {
            Some(dir) => PathBuf::from(dir).join(socket),
            None => socket,
        }
    };
    if !socket.exists() && std::env::var_os("DISPLAY").is_some() {
        eprintln!("note: Wayland socket {} not found; using X11", socket.display());
        // SAFETY: called at the very start of main, before any other threads exist.
        unsafe { std::env::remove_var("WAYLAND_DISPLAY") };
    }
}

fn main() -> AppExit {
    fall_back_to_x11_if_wayland_missing();
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("error: {e}\nusage: architect [--sample N] [--capture DIR]");
            return AppExit::from_code(2);
        }
    };

    let plot = starter_plots().remove(0);
    let houses = samples::all(&plot);
    let index = args.sample.min(houses.len() - 1);
    let capturing = args.capture.is_some();

    let window = if capturing {
        // Headless: no window, the camera renders into an image.
        None
    } else {
        Some(Window {
            title: "Architect".into(),
            resolution: (1280u32, 800u32).into(),
            ..default()
        })
    };
    let plugins = DefaultPlugins
        .set(WindowPlugin {
            primary_window: window,
            exit_condition: if capturing { ExitCondition::DontExit } else { ExitCondition::OnPrimaryClosed },
            close_when_requested: !capturing,
            ..default()
        })
        .set(RenderPlugin {
            render_creation: RenderCreation::Automatic(Box::new(render_settings())),
            ..default()
        });

    let mut app = App::new();
    if capturing {
        // No OS event loop either: just run updates at a fixed rate.
        app.add_plugins((
            plugins.disable::<WinitPlugin>(),
            ScheduleRunnerPlugin::run_loop(Duration::from_secs_f64(1.0 / 60.0)),
        ));
    } else {
        app.add_plugins(plugins);
    }
    app.insert_resource(house_view::Viewer {
        plot,
        houses,
        index,
        budget: STARTING_BUDGET,
        prices: PriceList::default(),
        show_guides: !capturing,
    })
    .add_plugins((camera::OrbitCameraPlugin, house_view::HouseViewPlugin, capture::CapturePlugin));

    if let Some(dir) = args.capture {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!("error: cannot create {}: {e}", dir.display());
            return AppExit::from_code(1);
        }
        app.insert_resource(capture::CaptureRequest {
            dir,
            prefix: format!("house{}-view", index + 1),
        });
    } else {
        // The HUD is left out of captures so the appraiser sees only the house.
        app.add_plugins(hud::HudPlugin);
    }

    app.run()
}
