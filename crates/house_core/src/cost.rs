//! Construction costs.

use crate::model::{House, OpeningKind, RoofMaterial, WallMaterial};
use crate::roof::build_roof;
use serde::{Deserialize, Serialize};

/// Unit prices for building components. Money is in whole currency units.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PriceList {
    /// Per m² of net wall face (openings subtracted).
    pub wall_wood_m2: f64,
    pub wall_brick_m2: f64,
    pub wall_plaster_m2: f64,
    pub window_base: f64,
    pub window_m2: f64,
    pub door_base: f64,
    pub door_m2: f64,
    /// Per m² of roof covering.
    pub roof_shingles_m2: f64,
    pub roof_metal_m2: f64,
    pub roof_tiles_m2: f64,
    /// Per m² of floor area.
    pub foundation_m2: f64,
}

impl Default for PriceList {
    fn default() -> Self {
        Self {
            wall_wood_m2: 120.0,
            wall_brick_m2: 220.0,
            wall_plaster_m2: 150.0,
            window_base: 300.0,
            window_m2: 450.0,
            door_base: 600.0,
            door_m2: 300.0,
            roof_shingles_m2: 60.0,
            roof_metal_m2: 90.0,
            roof_tiles_m2: 110.0,
            foundation_m2: 180.0,
        }
    }
}

impl PriceList {
    pub fn wall_m2(&self, m: WallMaterial) -> f64 {
        match m {
            WallMaterial::Wood => self.wall_wood_m2,
            WallMaterial::Brick => self.wall_brick_m2,
            WallMaterial::Plaster => self.wall_plaster_m2,
        }
    }

    pub fn roof_m2(&self, m: RoofMaterial) -> f64 {
        match m {
            RoofMaterial::Shingles => self.roof_shingles_m2,
            RoofMaterial::Metal => self.roof_metal_m2,
            RoofMaterial::Tiles => self.roof_tiles_m2,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct CostBreakdown {
    pub walls: f64,
    pub windows: f64,
    pub doors: f64,
    pub roof: f64,
    pub foundation: f64,
}

impl CostBreakdown {
    pub fn total(&self) -> f64 {
        self.walls + self.windows + self.doors + self.roof + self.foundation
    }
}

/// Price every component of the house. Parts that cannot be built yet (an unclosed
/// footprint, an impossible roof) cost nothing; validation reports those separately.
pub fn estimate(house: &House, prices: &PriceList) -> CostBreakdown {
    let mut c = CostBreakdown::default();

    for wall in &house.walls {
        let holes: f32 = house.openings_in(wall.id).iter().map(|o| o.area()).sum();
        let net = (wall.gross_area() - holes).max(0.0);
        c.walls += f64::from(net) * prices.wall_m2(wall.material);
    }

    for o in &house.openings {
        let area = f64::from(o.area());
        match o.kind {
            OpeningKind::Window => c.windows += prices.window_base + area * prices.window_m2,
            OpeningKind::Door => c.doors += prices.door_base + area * prices.door_m2,
        }
    }

    if let (Some(roof), Ok(geom)) = (&house.roof, build_roof(house)) {
        c.roof = f64::from(geom.covering_area()) * prices.roof_m2(roof.material);
    }

    c.foundation = f64::from(house.floor_area()) * prices.foundation_m2;
    c
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Vec2;
    use crate::model::{Roof, RoofStyle};

    #[test]
    fn openings_reduce_wall_cost_but_add_their_own() {
        let mut h = House::new();
        let ids = h.add_wall_loop(
            &[Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0), Vec2::new(10.0, 5.0), Vec2::new(0.0, 5.0)],
            2.5,
            WallMaterial::Wood,
        );
        let p = PriceList::default();
        let bare = estimate(&h, &p);
        assert!((bare.walls - 30.0 * 2.5 * 120.0).abs() < 1e-6);
        assert!((bare.foundation - 50.0 * 180.0).abs() < 1e-3);

        h.add_window(ids[0], 5.0, 2.0, 1.0, 1.0);
        let with_window = estimate(&h, &p);
        assert!((bare.walls - with_window.walls - 2.0 * 120.0).abs() < 1e-3);
        assert!((with_window.windows - (300.0 + 2.0 * 450.0)).abs() < 1e-6);
    }

    #[test]
    fn roof_cost_depends_on_material() {
        let mut h = House::new();
        h.add_wall_loop(
            &[Vec2::new(0.0, 0.0), Vec2::new(8.0, 0.0), Vec2::new(8.0, 6.0), Vec2::new(0.0, 6.0)],
            2.7,
            WallMaterial::Plaster,
        );
        let p = PriceList::default();
        let mut roof = Roof {
            style: RoofStyle::Gable,
            pitch_deg: 30.0,
            overhang: 0.3,
            material: RoofMaterial::Shingles,
        };
        h.roof = Some(roof.clone());
        let cheap = estimate(&h, &p).roof;
        roof.material = RoofMaterial::Tiles;
        h.roof = Some(roof);
        let dear = estimate(&h, &p).roof;
        assert!(cheap > 0.0 && dear > cheap);
    }
}
