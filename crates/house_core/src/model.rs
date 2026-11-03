//! The house data model: walls, openings (windows and doors) and the roof.
//!
//! The MVP supports single-storey houses whose exterior walls form one closed loop.

use crate::geometry::{SNAP_EPS, Vec2, is_simple_polygon, signed_area};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

/// Default wall thickness in meters.
pub const DEFAULT_WALL_THICKNESS: f32 = 0.25;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct WallId(pub u32);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct OpeningId(pub u32);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WallMaterial {
    Wood,
    Brick,
    Plaster,
}

impl WallMaterial {
    pub const ALL: [Self; 3] = [Self::Wood, Self::Brick, Self::Plaster];
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Wall {
    pub id: WallId,
    pub start: Vec2,
    pub end: Vec2,
    pub height: f32,
    pub thickness: f32,
    pub material: WallMaterial,
}

impl Wall {
    pub fn length(&self) -> f32 {
        self.start.distance(self.end)
    }

    /// Unit vector from `start` to `end`.
    pub fn direction(&self) -> Vec2 {
        (self.end - self.start).normalize()
    }

    /// Gross face area (one side), ignoring openings.
    pub fn gross_area(&self) -> f32 {
        self.length() * self.height
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OpeningKind {
    Window,
    Door,
}

/// A window or door cut into a wall.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Opening {
    pub id: OpeningId,
    pub wall: WallId,
    pub kind: OpeningKind,
    /// Distance from the wall's `start` to the opening's center, along the wall.
    pub offset: f32,
    pub width: f32,
    pub height: f32,
    /// Height of the opening's bottom edge above the floor (0 for doors).
    pub sill: f32,
}

impl Opening {
    pub fn area(&self) -> f32 {
        self.width * self.height
    }
    pub fn left(&self) -> f32 {
        self.offset - self.width * 0.5
    }
    pub fn right(&self) -> f32 {
        self.offset + self.width * 0.5
    }
    pub fn top(&self) -> f32 {
        self.sill + self.height
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RoofStyle {
    Flat,
    Gable,
    Hip,
}

impl RoofStyle {
    pub const ALL: [Self; 3] = [Self::Flat, Self::Gable, Self::Hip];
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RoofMaterial {
    Shingles,
    Metal,
    Tiles,
}

impl RoofMaterial {
    pub const ALL: [Self; 3] = [Self::Shingles, Self::Metal, Self::Tiles];
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Roof {
    pub style: RoofStyle,
    /// Slope in degrees (ignored for flat roofs).
    pub pitch_deg: f32,
    /// How far the roof extends past the walls, in meters (ignored for flat roofs).
    pub overhang: f32,
    pub material: RoofMaterial,
}

/// Why the walls do not form a usable footprint.
#[derive(Clone, Debug, PartialEq, Error)]
pub enum FootprintError {
    #[error("there are no walls")]
    NoWalls,
    #[error("the walls are not closed: a wall end at ({x:.1}, {y:.1}) is not connected")]
    Open { x: f32, y: f32 },
    #[error("more than two walls meet at ({x:.1}, {y:.1}); interior walls are not supported yet")]
    Branching { x: f32, y: f32 },
    #[error("the walls form more than one separate loop")]
    MultipleLoops,
    #[error("the outer walls cross each other")]
    SelfIntersecting,
    #[error("the enclosed area is zero")]
    Degenerate,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct House {
    pub walls: Vec<Wall>,
    pub openings: Vec<Opening>,
    pub roof: Option<Roof>,
    next_id: u32,
}

impl House {
    pub fn new() -> Self {
        Self::default()
    }

    fn fresh_id(&mut self) -> u32 {
        self.next_id += 1;
        self.next_id
    }

    pub fn add_wall(&mut self, start: Vec2, end: Vec2, height: f32, material: WallMaterial) -> WallId {
        let id = WallId(self.fresh_id());
        self.walls.push(Wall {
            id,
            start,
            end,
            height,
            thickness: DEFAULT_WALL_THICKNESS,
            material,
        });
        id
    }

    /// Add walls along a closed loop of corner points (the last point connects back to the first).
    pub fn add_wall_loop(&mut self, corners: &[Vec2], height: f32, material: WallMaterial) -> Vec<WallId> {
        (0..corners.len())
            .map(|i| self.add_wall(corners[i], corners[(i + 1) % corners.len()], height, material))
            .collect()
    }

    /// Remove a wall together with all openings in it.
    pub fn remove_wall(&mut self, id: WallId) {
        self.walls.retain(|w| w.id != id);
        self.openings.retain(|o| o.wall != id);
    }

    pub fn add_window(&mut self, wall: WallId, offset: f32, width: f32, height: f32, sill: f32) -> OpeningId {
        self.add_opening(wall, OpeningKind::Window, offset, width, height, sill)
    }

    pub fn add_door(&mut self, wall: WallId, offset: f32, width: f32, height: f32) -> OpeningId {
        self.add_opening(wall, OpeningKind::Door, offset, width, height, 0.0)
    }

    fn add_opening(
        &mut self,
        wall: WallId,
        kind: OpeningKind,
        offset: f32,
        width: f32,
        height: f32,
        sill: f32,
    ) -> OpeningId {
        let id = OpeningId(self.fresh_id());
        self.openings.push(Opening {
            id,
            wall,
            kind,
            offset,
            width,
            height,
            sill,
        });
        id
    }

    pub fn remove_opening(&mut self, id: OpeningId) {
        self.openings.retain(|o| o.id != id);
    }

    pub fn wall(&self, id: WallId) -> Option<&Wall> {
        self.walls.iter().find(|w| w.id == id)
    }

    pub fn wall_mut(&mut self, id: WallId) -> Option<&mut Wall> {
        self.walls.iter_mut().find(|w| w.id == id)
    }

    pub fn opening_mut(&mut self, id: OpeningId) -> Option<&mut Opening> {
        self.openings.iter_mut().find(|o| o.id == id)
    }

    /// Openings in the given wall, sorted along the wall.
    pub fn openings_in(&self, wall: WallId) -> Vec<&Opening> {
        let mut v: Vec<_> = self.openings.iter().filter(|o| o.wall == wall).collect();
        v.sort_by(|a, b| a.offset.total_cmp(&b.offset));
        v
    }

    /// Height of the top of the walls, where the roof sits.
    pub fn eave_height(&self) -> f32 {
        self.walls.iter().map(|w| w.height).fold(0.0, f32::max)
    }

    /// The closed outline traced by the wall centerlines, counter-clockwise.
    pub fn footprint(&self) -> Result<Vec<Vec2>, FootprintError> {
        if self.walls.is_empty() {
            return Err(FootprintError::NoWalls);
        }

        // Merge wall endpoints that are within SNAP_EPS of each other into shared vertices.
        let mut vertices: Vec<Vec2> = Vec::new();
        let mut vertex_of = |p: Vec2| -> usize {
            if let Some(i) = vertices.iter().position(|v| v.distance(p) < SNAP_EPS) {
                i
            } else {
                vertices.push(p);
                vertices.len() - 1
            }
        };
        let edges: Vec<(usize, usize)> = self
            .walls
            .iter()
            .map(|w| (vertex_of(w.start), vertex_of(w.end)))
            .filter(|(a, b)| a != b)
            .collect();

        let mut adjacency: HashMap<usize, Vec<usize>> = HashMap::new();
        for &(a, b) in &edges {
            adjacency.entry(a).or_default().push(b);
            adjacency.entry(b).or_default().push(a);
        }
        for (i, v) in vertices.iter().enumerate() {
            match adjacency.get(&i).map_or(0, Vec::len) {
                2 => {}
                0 | 1 => return Err(FootprintError::Open { x: v.x, y: v.y }),
                _ => return Err(FootprintError::Branching { x: v.x, y: v.y }),
            }
        }

        // Every vertex has degree two, so walking from vertex 0 traces one loop.
        let mut outline = vec![0usize];
        let mut prev = usize::MAX;
        let mut cur = 0usize;
        loop {
            let next = adjacency[&cur].iter().copied().find(|&n| n != prev).unwrap_or(prev);
            if next == 0 {
                break;
            }
            outline.push(next);
            prev = cur;
            cur = next;
            if outline.len() > vertices.len() {
                break;
            }
        }
        if outline.len() != vertices.len() {
            return Err(FootprintError::MultipleLoops);
        }

        let mut poly: Vec<Vec2> = outline.into_iter().map(|i| vertices[i]).collect();
        if !is_simple_polygon(&poly) {
            return Err(FootprintError::SelfIntersecting);
        }
        let area = signed_area(&poly);
        if area.abs() < 1e-3 {
            return Err(FootprintError::Degenerate);
        }
        if area < 0.0 {
            poly.reverse();
        }
        Ok(poly)
    }

    /// Floor area enclosed by the wall centerlines (0 if the walls are not closed).
    pub fn floor_area(&self) -> f32 {
        self.footprint().map_or(0.0, |p| signed_area(&p))
    }
}

/// A solid rectangular piece of a wall, in the wall's local coordinates:
/// `u` runs along the wall from `start` (may extend slightly past either end to close
/// corners), `v` is height above the floor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WallPiece {
    pub u0: f32,
    pub u1: f32,
    pub v0: f32,
    pub v1: f32,
}

/// Split a wall into solid rectangles around its openings.
///
/// Each wall is extended by half its thickness at both ends so neighbouring walls
/// overlap at corners instead of leaving a notch.
pub fn wall_pieces(wall: &Wall, openings: &[&Opening]) -> Vec<WallPiece> {
    let ext = wall.thickness * 0.5;
    let len = wall.length();
    let h = wall.height;
    let mut sorted: Vec<&&Opening> = openings.iter().collect();
    sorted.sort_by(|a, b| a.offset.total_cmp(&b.offset));

    let mut pieces = Vec::new();
    let mut cursor = -ext;
    for o in sorted {
        let left = o.left().max(cursor);
        let right = o.right().min(len + ext);
        if right <= left {
            continue;
        }
        if left > cursor {
            pieces.push(WallPiece { u0: cursor, u1: left, v0: 0.0, v1: h });
        }
        if o.sill > 0.0 {
            pieces.push(WallPiece { u0: left, u1: right, v0: 0.0, v1: o.sill.min(h) });
        }
        if o.top() < h {
            pieces.push(WallPiece { u0: left, u1: right, v0: o.top(), v1: h });
        }
        cursor = right;
    }
    if cursor < len + ext {
        pieces.push(WallPiece { u0: cursor, u1: len + ext, v0: 0.0, v1: h });
    }
    pieces
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(w: f32, d: f32) -> House {
        let mut h = House::new();
        h.add_wall_loop(
            &[Vec2::new(0.0, 0.0), Vec2::new(w, 0.0), Vec2::new(w, d), Vec2::new(0.0, d)],
            2.7,
            WallMaterial::Plaster,
        );
        h
    }

    #[test]
    fn rectangle_footprint_is_ccw() {
        let fp = rect(10.0, 7.0).footprint().unwrap();
        assert_eq!(fp.len(), 4);
        assert!((signed_area(&fp) - 70.0).abs() < 1e-3);
    }

    #[test]
    fn walls_in_any_order_and_direction_close() {
        let mut h = House::new();
        let m = WallMaterial::Wood;
        h.add_wall(Vec2::new(10.0, 7.0), Vec2::new(10.0, 0.0), 2.7, m);
        h.add_wall(Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0), 2.7, m);
        h.add_wall(Vec2::new(0.0, 7.0), Vec2::new(0.0, 0.0), 2.7, m);
        h.add_wall(Vec2::new(0.0, 7.0), Vec2::new(10.0, 7.0), 2.7, m);
        assert!((h.floor_area() - 70.0).abs() < 1e-3);
    }

    #[test]
    fn open_loop_is_reported() {
        let mut h = rect(10.0, 7.0);
        let last = h.walls.last().unwrap().id;
        h.remove_wall(last);
        assert!(matches!(h.footprint(), Err(FootprintError::Open { .. })));
    }

    #[test]
    fn interior_wall_is_reported_as_branching() {
        let mut h = rect(10.0, 7.0);
        h.add_wall(Vec2::new(5.0, 0.0), Vec2::new(5.0, 7.0), 2.7, WallMaterial::Wood);
        // The interior wall's ends touch the middle of outer walls, not their corners, so
        // its endpoints are unconnected vertices.
        assert!(h.footprint().is_err());
    }

    #[test]
    fn two_separate_rooms_are_multiple_loops() {
        let mut h = rect(4.0, 4.0);
        h.add_wall_loop(
            &[Vec2::new(6.0, 0.0), Vec2::new(9.0, 0.0), Vec2::new(9.0, 3.0), Vec2::new(6.0, 3.0)],
            2.7,
            WallMaterial::Wood,
        );
        assert_eq!(h.footprint(), Err(FootprintError::MultipleLoops));
    }

    #[test]
    fn removing_a_wall_removes_its_openings() {
        let mut h = rect(10.0, 7.0);
        let w = h.walls[0].id;
        h.add_door(w, 5.0, 1.0, 2.1);
        h.remove_wall(w);
        assert!(h.openings.is_empty());
    }

    #[test]
    fn wall_pieces_tile_the_wall_minus_openings() {
        let mut h = rect(10.0, 7.0);
        let w = h.walls[0].id;
        h.add_door(w, 2.0, 1.0, 2.1);
        h.add_window(w, 6.0, 1.5, 1.2, 0.9);
        let wall = h.wall(w).unwrap();
        let pieces = wall_pieces(wall, &h.openings_in(w));
        let solid: f32 = pieces.iter().map(|p| (p.u1 - p.u0) * (p.v1 - p.v0)).sum();
        let total = (10.0 + wall.thickness) * 2.7;
        let holes = 1.0 * 2.1 + 1.5 * 1.2;
        assert!((solid - (total - holes)).abs() < 1e-3, "solid {solid}");
        // Door: pier, lintel; window: pier, sill, lintel; final pier.
        assert_eq!(pieces.len(), 6);
    }

    #[test]
    fn serde_round_trip() {
        let mut h = rect(8.0, 6.0);
        h.add_door(h.walls[0].id, 4.0, 1.0, 2.1);
        h.roof = Some(Roof {
            style: RoofStyle::Gable,
            pitch_deg: 30.0,
            overhang: 0.4,
            material: RoofMaterial::Tiles,
        });
        let json = serde_json::to_string(&h).unwrap();
        let back: House = serde_json::from_str(&json).unwrap();
        assert_eq!(h, back);
    }
}
