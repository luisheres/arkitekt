//! On-screen text: cost breakdown, validation status and controls.

use bevy::prelude::*;
use house_core::{estimate, validate};

use crate::house_view::Viewer;

pub struct HudPlugin;

impl Plugin for HudPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup_hud)
            .add_systems(Update, update_hud.run_if(resource_changed::<Viewer>));
    }
}

#[derive(Component)]
struct StatusText;

const CONTROLS: &str = "Mouse: left-drag rotate · right-drag pan · wheel zoom   1-4: preset views\n\
Tab: next house · R: roof style · T: roof material · M: wall material\n\
[ ]: roof pitch · O P: overhang · - =: wall height · G: plot guides";

fn panel() -> (Node, BackgroundColor) {
    (
        Node {
            position_type: PositionType::Absolute,
            padding: UiRect::all(Val::Px(10.0)),
            ..default()
        },
        BackgroundColor(Color::srgba(0.05, 0.06, 0.08, 0.72)),
    )
}

fn setup_hud(mut commands: Commands) {
    let font = |size: f32| TextFont {
        font_size: FontSize::Px(size),
        ..default()
    };
    let (mut node, bg) = panel();
    node.left = Val::Px(12.0);
    node.top = Val::Px(12.0);
    commands.spawn((node, bg, children![(StatusText, Text::new(""), font(15.0))]));

    let (mut node, bg) = panel();
    node.left = Val::Px(12.0);
    node.bottom = Val::Px(12.0);
    commands.spawn((
        node,
        bg,
        children![(Text::new(CONTROLS), font(13.0), TextColor(Color::srgb(0.8, 0.82, 0.86)))],
    ));
}

/// Format money with thousands separators, e.g. 42,150.
pub fn money(v: f64) -> String {
    let digits = format!("{:.0}", v.abs());
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    if v < 0.0 { format!("-{out}") } else { out }
}

fn update_hud(viewer: Res<Viewer>, mut text: Query<&mut Text, With<StatusText>>) {
    let Ok(mut text) = text.single_mut() else { return };
    let house = viewer.house();
    let plot = &viewer.plot;
    let cost = estimate(house, &viewer.prices);
    let issues = validate(house, plot, viewer.budget, &viewer.prices);

    let walls = house.walls.first().map_or("-".to_string(), |w| format!("{:?}, {:.1} m", w.material, w.height));
    let roof = house.roof.as_ref().map_or("none".to_string(), |r| {
        format!("{:?}, {:.0}°, overhang {:.1} m, {:?}", r.style, r.pitch_deg, r.overhang, r.material)
    });

    let mut s = format!(
        "{} ({}/{})  on  {} ({:.0} x {:.0} m)\n\
         Floor area {:.1} m²   Walls: {}\n\
         Roof: {}\n\n\
         Walls       {:>8}\n\
         Windows     {:>8}\n\
         Doors       {:>8}\n\
         Roof        {:>8}\n\
         Foundation  {:>8}\n\
         Total       {:>8}   (budget {})\n\n",
        viewer.name(),
        viewer.index + 1,
        viewer.houses.len(),
        plot.name,
        plot.width,
        plot.depth,
        house.floor_area(),
        walls,
        roof,
        money(cost.walls),
        money(cost.windows),
        money(cost.doors),
        money(cost.roof),
        money(cost.foundation),
        money(cost.total()),
        money(viewer.budget),
    );
    if issues.is_empty() {
        s.push_str("Status: ready to sell");
    } else {
        s.push_str("Status: not sellable yet");
        for issue in &issues {
            s.push_str(&format!("\n  - {issue}"));
        }
    }
    text.0 = s;
}

#[cfg(test)]
mod tests {
    use super::money;

    #[test]
    fn money_formatting() {
        assert_eq!(money(0.0), "0");
        assert_eq!(money(999.4), "999");
        assert_eq!(money(42_150.0), "42,150");
        assert_eq!(money(-1_234_567.0), "-1,234,567");
    }
}
