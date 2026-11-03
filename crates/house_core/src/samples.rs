//! Hand-made example houses, used for the viewer and tests (and later for calibrating
//! the AI appraiser).

use crate::geometry::Vec2;
use crate::model::{House, Roof, RoofMaterial, RoofStyle, WallMaterial};
use crate::plot::Plot;

/// All sample houses, centered on the given plot.
pub fn all(plot: &Plot) -> Vec<(&'static str, House)> {
    vec![
        ("Cottage", cottage(plot)),
        ("L-shaped modern", l_shaped_modern(plot)),
        ("Brick hip-roof", brick_hip(plot)),
    ]
}

/// Corners of a `w` x `d` rectangle centered on the plot, counter-clockwise starting at
/// the front-left (the front faces the low-y edge of the plot, i.e. the street).
fn centered_rect(plot: &Plot, w: f32, d: f32) -> [Vec2; 4] {
    let c = plot.center();
    let (x0, y0) = (c.x - w * 0.5, c.y - d * 0.5);
    [
        Vec2::new(x0, y0),
        Vec2::new(x0 + w, y0),
        Vec2::new(x0 + w, y0 + d),
        Vec2::new(x0, y0 + d),
    ]
}

/// A symmetric 10 x 7 m plastered cottage with a gable roof.
pub fn cottage(plot: &Plot) -> House {
    let mut h = House::new();
    let [front, right, back, left] = h.add_wall_loop(&centered_rect(plot, 10.0, 7.0), 2.7, WallMaterial::Plaster)[..]
    else {
        unreachable!()
    };
    h.add_door(front, 5.0, 1.0, 2.1);
    for x in [2.0, 8.0] {
        h.add_window(front, x, 1.4, 1.3, 0.9);
        h.add_window(back, x, 1.4, 1.3, 0.9);
    }
    h.add_window(back, 5.0, 1.0, 1.3, 0.9);
    h.add_window(right, 3.5, 1.2, 1.3, 0.9);
    h.add_window(left, 3.5, 1.2, 1.3, 0.9);
    h.roof = Some(Roof {
        style: RoofStyle::Gable,
        pitch_deg: 38.0,
        overhang: 0.5,
        material: RoofMaterial::Tiles,
    });
    h
}

/// An L-shaped wooden house with a flat roof and wide windows.
pub fn l_shaped_modern(plot: &Plot) -> House {
    let c = plot.center();
    let (x0, y0) = (c.x - 6.0, c.y - 4.5);
    let corners = [
        Vec2::new(x0, y0),
        Vec2::new(x0 + 12.0, y0),
        Vec2::new(x0 + 12.0, y0 + 5.0),
        Vec2::new(x0 + 5.0, y0 + 5.0),
        Vec2::new(x0 + 5.0, y0 + 9.0),
        Vec2::new(x0, y0 + 9.0),
    ];
    let mut h = House::new();
    let walls = h.add_wall_loop(&corners, 3.2, WallMaterial::Wood);
    h.add_door(walls[0], 2.5, 1.0, 2.2);
    h.add_window(walls[0], 7.5, 5.0, 2.0, 0.6);
    h.add_window(walls[1], 2.5, 2.5, 1.2, 1.0);
    h.add_window(walls[2], 3.5, 4.0, 2.4, 0.3);
    h.add_window(walls[3], 2.0, 2.0, 1.2, 1.0);
    h.add_window(walls[4], 2.5, 2.0, 1.2, 1.0);
    h.add_window(walls[5], 4.5, 2.0, 1.2, 1.0);
    h.roof = Some(Roof {
        style: RoofStyle::Flat,
        pitch_deg: 0.0,
        overhang: 0.0,
        material: RoofMaterial::Metal,
    });
    h
}

/// A compact brick house with a hip roof and a double front door.
pub fn brick_hip(plot: &Plot) -> House {
    let mut h = House::new();
    let [front, right, back, left] = h.add_wall_loop(&centered_rect(plot, 9.0, 9.0), 3.0, WallMaterial::Brick)[..]
    else {
        unreachable!()
    };
    h.add_door(front, 4.5, 1.6, 2.3);
    for x in [1.8, 7.2] {
        h.add_window(front, x, 1.2, 1.6, 0.8);
        h.add_window(back, x, 1.2, 1.6, 0.8);
        h.add_window(right, x, 1.2, 1.6, 0.8);
        h.add_window(left, x, 1.2, 1.6, 0.8);
    }
    h.roof = Some(Roof {
        style: RoofStyle::Hip,
        pitch_deg: 30.0,
        overhang: 0.6,
        material: RoofMaterial::Shingles,
    });
    h
}
