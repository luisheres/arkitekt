//! Plots of land the player can buy and build on.

use crate::geometry::Vec2;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Plot {
    pub name: String,
    /// Size along the plan x axis, in meters. The plot spans `0..width`.
    pub width: f32,
    /// Size along the plan y axis, in meters. The plot spans `0..depth`.
    pub depth: f32,
    pub price: f64,
    /// Multiplies the sale price; better locations sell for more.
    pub location_multiplier: f64,
    /// Minimum distance between walls and the plot boundary, in meters.
    pub setback: f32,
}

impl Plot {
    /// True when `p` lies in the buildable area (inside the plot, respecting the setback).
    pub fn is_buildable(&self, p: Vec2) -> bool {
        let s = self.setback;
        p.x >= s && p.x <= self.width - s && p.y >= s && p.y <= self.depth - s
    }

    /// The plot's center point.
    pub fn center(&self) -> Vec2 {
        Vec2::new(self.width * 0.5, self.depth * 0.5)
    }
}

/// The plots available in the MVP, cheapest first.
pub fn starter_plots() -> Vec<Plot> {
    vec![
        Plot {
            name: "Suburban lot".into(),
            width: 20.0,
            depth: 25.0,
            price: 15_000.0,
            location_multiplier: 1.0,
            setback: 3.0,
        },
        Plot {
            name: "Lakeside lot".into(),
            width: 28.0,
            depth: 32.0,
            price: 45_000.0,
            location_multiplier: 1.35,
            setback: 4.0,
        },
        Plot {
            name: "Hillside view lot".into(),
            width: 36.0,
            depth: 40.0,
            price: 110_000.0,
            location_multiplier: 1.8,
            setback: 5.0,
        },
    ]
}
