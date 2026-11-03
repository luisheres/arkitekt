//! Roof and floor geometry generated from the house footprint.
//!
//! - Flat roofs work on any footprint.
//! - Gable and hip roofs need a rectangular footprint (at any rotation) in the MVP.

use crate::geometry::{TriMesh, Vec2, Vec3, offset_polygon, remove_collinear, triangulate};
use crate::model::{FootprintError, House, Roof, RoofStyle};
use thiserror::Error;

/// Thickness of a flat roof slab, in meters.
pub const FLAT_ROOF_THICKNESS: f32 = 0.2;
/// How far a flat roof extends past the outer face of the walls, in meters.
pub const FLAT_ROOF_LIP: f32 = 0.1;
/// Height of the floor slab top above the ground, in meters.
pub const FLOOR_SLAB_HEIGHT: f32 = 0.05;

#[derive(Clone, Debug, PartialEq, Error)]
pub enum RoofError {
    #[error("the house has no roof")]
    NoRoof,
    #[error("cannot place a roof: {0}")]
    Footprint(#[from] FootprintError),
    #[error("{0:?} roofs need a rectangular footprint; use a flat roof for other shapes")]
    NeedsRectangle(RoofStyle),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RoofGeometry {
    /// The roof covering (shingles, tiles, ...).
    pub surface: TriMesh,
    /// Triangular wall infill under a gable roof, rendered in the wall material.
    pub gables: TriMesh,
    /// Highest point of the roof above the ground.
    pub peak_height: f32,
}

impl RoofGeometry {
    /// Area of roof covering to pay for. Excludes the slab's underside.
    pub fn covering_area(&self) -> f32 {
        self.surface.area()
    }
}

/// A rectangle in plan view: `origin` corner plus two perpendicular unit axes.
#[derive(Clone, Copy, Debug)]
struct PlanRect {
    origin: Vec2,
    u: Vec2,
    v: Vec2,
    len_u: f32,
    len_v: f32,
}

impl PlanRect {
    /// Recognise a (possibly rotated) rectangle; collinear vertices are ignored.
    fn from_polygon(poly: &[Vec2]) -> Option<Self> {
        let p = remove_collinear(poly);
        if p.len() != 4 {
            return None;
        }
        for i in 0..4 {
            let a = (p[(i + 1) % 4] - p[i]).normalize();
            let b = (p[(i + 2) % 4] - p[(i + 1) % 4]).normalize();
            if a.dot(b).abs() > 1e-3 {
                return None;
            }
        }
        let e_u = p[1] - p[0];
        let e_v = p[3] - p[0];
        Some(Self {
            origin: p[0],
            u: e_u.normalize(),
            v: e_v.normalize(),
            len_u: e_u.length(),
            len_v: e_v.length(),
        })
    }

    /// Map local `(along, across)` + height to world space. When `swap` is true the
    /// local axes are exchanged so `along` always follows the longer side.
    fn point(&self, swap: bool, along: f32, across: f32, h: f32) -> Vec3 {
        let (s, t) = if swap { (across, along) } else { (along, across) };
        (self.origin + self.u * s + self.v * t).at_height(h)
    }

    /// Returns (long side, short side, swap flag).
    fn oriented(&self) -> (f32, f32, bool) {
        if self.len_u >= self.len_v {
            (self.len_u, self.len_v, false)
        } else {
            (self.len_v, self.len_u, true)
        }
    }
}

/// Generate the roof for a house.
pub fn build_roof(house: &House) -> Result<RoofGeometry, RoofError> {
    let roof = house.roof.as_ref().ok_or(RoofError::NoRoof)?;
    let footprint = house.footprint()?;
    let eave = house.eave_height();
    let half_thickness = house.walls.iter().map(|w| w.thickness).fold(0.0, f32::max) * 0.5;
    match roof.style {
        RoofStyle::Flat => Ok(flat_roof(&offset_polygon(&footprint, half_thickness + FLAT_ROOF_LIP), eave)),
        RoofStyle::Gable | RoofStyle::Hip => {
            let rect = PlanRect::from_polygon(&footprint).ok_or(RoofError::NeedsRectangle(roof.style))?;
            Ok(pitched_roof(&rect, eave, half_thickness, roof))
        }
    }
}

/// A slab on top of the walls covering `outline` (the footprint grown past the walls).
fn flat_roof(outline: &[Vec2], eave: f32) -> RoofGeometry {
    let footprint = outline;
    let top = eave + FLAT_ROOF_THICKNESS;
    let up = Vec3::new(0.0, 1.0, 0.0);
    let mut surface = TriMesh::default();
    for [a, b, c] in triangulate(footprint) {
        surface.push_tri_facing(footprint[a].at_height(top), footprint[b].at_height(top), footprint[c].at_height(top), up);
    }
    // Edge band (fascia) around the slab. The footprint is CCW, so the outward normal of
    // edge a->b is (dy, -dx).
    let mut gables = TriMesh::default();
    let n = footprint.len();
    for i in 0..n {
        let (a, b) = (footprint[i], footprint[(i + 1) % n]);
        let d = (b - a).normalize();
        let out = Vec3::new(d.y, 0.0, -d.x);
        gables.push_quad_facing(a.at_height(eave), b.at_height(eave), b.at_height(top), a.at_height(top), out);
    }
    RoofGeometry {
        surface,
        // The fascia is wall-coloured trim, so it goes with the gables.
        gables,
        peak_height: top,
    }
}

/// Gap between the top outer edge of a wall and the underside of a pitched roof.
const ROOF_CLEARANCE: f32 = 0.02;

/// Pitched roofs are generated over the wall centerlines (`rect`), but raised so the roof
/// clears the walls' outer faces, `half_thickness` beyond the centerline.
fn pitched_roof(rect: &PlanRect, wall_top: f32, half_thickness: f32, roof: &Roof) -> RoofGeometry {
    let (long, span, swap) = rect.oriented();
    let o = roof.overhang.max(0.0);
    let slope = roof.pitch_deg.to_radians().tan();
    let half = span * 0.5;
    // Roof height directly above the wall centerlines.
    let eave = wall_top + half_thickness * slope + ROOF_CLEARANCE;
    let ridge_h = eave + half * slope;
    let eave_out = eave - o * slope; // eaves drop as they extend past the walls
    let p = |along: f32, across: f32, h: f32| rect.point(swap, along, across, h);
    let up = Vec3::new(0.0, 1.0, 0.0);

    let mut surface = TriMesh::default();
    let mut gables = TriMesh::default();

    match roof.style {
        RoofStyle::Gable => {
            // Two slopes meeting at a ridge along the long side; overhang on all edges.
            for edge in [-o, span + o] {
                surface.push_quad_facing(
                    p(-o, edge, eave_out),
                    p(long + o, edge, eave_out),
                    p(long + o, half, ridge_h),
                    p(-o, half, ridge_h),
                    up,
                );
            }
            // Wall infill at both short ends, from the wall top up to the roof: a thin
            // band (where the roof was raised to clear the walls) plus the triangle.
            for end in [0.0, long] {
                let out_sign = if end == 0.0 { -1.0 } else { 1.0 };
                let out = p(end + out_sign, half, eave) - p(end, half, eave);
                gables.push_quad_facing(
                    p(end, 0.0, wall_top),
                    p(end, span, wall_top),
                    p(end, span, eave),
                    p(end, 0.0, eave),
                    out,
                );
                gables.push_tri_facing(p(end, 0.0, eave), p(end, span, eave), p(end, half, ridge_h), out);
            }
        }
        RoofStyle::Hip => {
            // Four slopes; the ridge is shortened by half the span at each end.
            let r0 = half.min(long * 0.5);
            let r1 = (long - half).max(long * 0.5);
            for edge in [-o, span + o] {
                surface.push_quad_facing(
                    p(-o, edge, eave_out),
                    p(long + o, edge, eave_out),
                    p(r1, half, ridge_h),
                    p(r0, half, ridge_h),
                    up,
                );
            }
            surface.push_tri_facing(p(-o, -o, eave_out), p(-o, span + o, eave_out), p(r0, half, ridge_h), up);
            surface.push_tri_facing(
                p(long + o, -o, eave_out),
                p(long + o, span + o, eave_out),
                p(r1, half, ridge_h),
                up,
            );
        }
        RoofStyle::Flat => unreachable!("flat roofs are handled separately"),
    }

    RoofGeometry {
        surface,
        gables,
        peak_height: ridge_h,
    }
}

/// The floor slab: the footprint triangulated just above the ground.
pub fn build_floor(house: &House) -> Result<TriMesh, FootprintError> {
    let fp = house.footprint()?;
    let up = Vec3::new(0.0, 1.0, 0.0);
    let mut mesh = TriMesh::default();
    for [a, b, c] in triangulate(&fp) {
        mesh.push_tri_facing(
            fp[a].at_height(FLOOR_SLAB_HEIGHT),
            fp[b].at_height(FLOOR_SLAB_HEIGHT),
            fp[c].at_height(FLOOR_SLAB_HEIGHT),
            up,
        );
    }
    Ok(mesh)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{RoofMaterial, WallMaterial};

    fn house(corners: &[Vec2], style: RoofStyle, pitch: f32, overhang: f32) -> House {
        let mut h = House::new();
        h.add_wall_loop(corners, 3.0, WallMaterial::Brick);
        h.roof = Some(Roof {
            style,
            pitch_deg: pitch,
            overhang,
            material: RoofMaterial::Tiles,
        });
        h
    }

    fn rect(w: f32, d: f32) -> Vec<Vec2> {
        vec![Vec2::new(0.0, 0.0), Vec2::new(w, 0.0), Vec2::new(w, d), Vec2::new(0.0, d)]
    }

    #[test]
    fn gable_area_and_ridge_height() {
        // 10 x 6, 45 degrees, no overhang: each slope is 10 x (3 * sqrt 2).
        let g = build_roof(&house(&rect(10.0, 6.0), RoofStyle::Gable, 45.0, 0.0)).unwrap();
        let expected = 2.0 * 10.0 * 3.0 * 2f32.sqrt();
        assert!((g.covering_area() - expected).abs() < 1e-3);
        // Raised so it clears the wall's outer face: half thickness * tan 45 + clearance.
        let lift = 0.125 + ROOF_CLEARANCE;
        assert!((g.peak_height - (3.0 + lift + 3.0)).abs() < 1e-4);
        // Each gable end: a 6 x lift band plus a triangle with base 6 and height 3.
        assert!((g.gables.area() - 2.0 * (6.0 * lift + 9.0)).abs() < 1e-3);
    }

    #[test]
    fn ridge_follows_long_side_regardless_of_orientation() {
        let a = build_roof(&house(&rect(10.0, 6.0), RoofStyle::Gable, 30.0, 0.3)).unwrap();
        let b = build_roof(&house(&rect(6.0, 10.0), RoofStyle::Gable, 30.0, 0.3)).unwrap();
        assert!((a.peak_height - b.peak_height).abs() < 1e-4);
        assert!((a.covering_area() - b.covering_area()).abs() < 1e-3);
    }

    #[test]
    fn hip_roof_area_matches_plan_area_over_cos_pitch() {
        // For equal-pitch hip roofs, covering area = plan area / cos(pitch).
        let g = build_roof(&house(&rect(10.0, 6.0), RoofStyle::Hip, 30.0, 0.0)).unwrap();
        let expected = 60.0 / 30f32.to_radians().cos();
        assert!((g.covering_area() - expected).abs() < 1e-2, "{}", g.covering_area());
        assert!(g.gables.is_empty());
    }

    #[test]
    fn roof_clears_outer_wall_face() {
        let h = house(&rect(10.0, 6.0), RoofStyle::Gable, 38.0, 0.5);
        let g = build_roof(&h).unwrap();
        let t = h.walls[0].thickness;
        let slope = 38f32.to_radians().tan();
        // The roof surface above the outer face of the long wall (y = -t/2) must be above
        // the wall top. Roof height falls linearly toward the eave at y = -overhang.
        let eave_out = g.surface.positions.iter().map(|p| p[1]).fold(f32::MAX, f32::min);
        let at_outer_face = eave_out + (0.5 - t * 0.5) * slope;
        assert!(at_outer_face > h.eave_height(), "{at_outer_face} <= {}", h.eave_height());
    }

    #[test]
    fn surface_normals_point_up() {
        for style in [RoofStyle::Gable, RoofStyle::Hip, RoofStyle::Flat] {
            let g = build_roof(&house(&rect(9.0, 7.0), style, 35.0, 0.5)).unwrap();
            assert!(g.surface.normals.iter().all(|n| n[1] > 0.0), "{style:?}");
        }
    }

    #[test]
    fn rotated_rectangle_supports_gable() {
        let s = std::f32::consts::FRAC_1_SQRT_2;
        let corners = [
            Vec2::new(0.0, 0.0),
            Vec2::new(8.0 * s, 8.0 * s),
            Vec2::new(8.0 * s - 5.0 * s, 8.0 * s + 5.0 * s),
            Vec2::new(-5.0 * s, 5.0 * s),
        ];
        assert!(build_roof(&house(&corners, RoofStyle::Gable, 30.0, 0.0)).is_ok());
    }

    #[test]
    fn l_shape_needs_flat_roof() {
        let l = [
            Vec2::new(0.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(10.0, 4.0),
            Vec2::new(4.0, 4.0),
            Vec2::new(4.0, 8.0),
            Vec2::new(0.0, 8.0),
        ];
        assert_eq!(
            build_roof(&house(&l, RoofStyle::Gable, 30.0, 0.0)),
            Err(RoofError::NeedsRectangle(RoofStyle::Gable))
        );
        // The slab covers the walls plus a lip: the L grown by 0.125 + 0.1.
        let flat = build_roof(&house(&l, RoofStyle::Flat, 0.0, 0.0)).unwrap();
        let d = 0.125 + FLAT_ROOF_LIP;
        let expected = 56.0 + 36.0 * d + 4.0 * d * d; // perimeter 36, net 4 convex corners
        assert!((flat.covering_area() - expected).abs() < 1e-3, "{}", flat.covering_area());
    }
}
