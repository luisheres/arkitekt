//! Small, dependency-free geometry helpers.
//!
//! Conventions:
//! - Floor plans use [`Vec2`] in meters, where `x` and `y` are the plan axes.
//! - 3D output uses [`Vec3`] with `y` pointing up. A plan point `(x, y)` at height
//!   `h` maps to `Vec3 { x, y: h, z: y }`.

use serde::{Deserialize, Serialize};
use std::ops::{Add, Mul, Neg, Sub};

/// Distance below which two plan points are considered the same (meters).
pub const SNAP_EPS: f32 = 0.01;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub const ZERO: Self = Self { x: 0.0, y: 0.0 };

    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn dot(self, o: Self) -> f32 {
        self.x * o.x + self.y * o.y
    }

    /// Z component of the 3D cross product; positive when `o` is counter-clockwise from `self`.
    pub fn cross(self, o: Self) -> f32 {
        self.x * o.y - self.y * o.x
    }

    pub fn length(self) -> f32 {
        self.dot(self).sqrt()
    }

    pub fn normalize(self) -> Self {
        let len = self.length();
        if len > f32::EPSILON { self * (1.0 / len) } else { Self::ZERO }
    }

    pub fn distance(self, o: Self) -> f32 {
        (self - o).length()
    }

    /// Lift a plan point to 3D at the given height.
    pub fn at_height(self, h: f32) -> Vec3 {
        Vec3::new(self.x, h, self.y)
    }
}

impl Add for Vec2 {
    type Output = Self;
    fn add(self, o: Self) -> Self {
        Self::new(self.x + o.x, self.y + o.y)
    }
}
impl Sub for Vec2 {
    type Output = Self;
    fn sub(self, o: Self) -> Self {
        Self::new(self.x - o.x, self.y - o.y)
    }
}
impl Mul<f32> for Vec2 {
    type Output = Self;
    fn mul(self, s: f32) -> Self {
        Self::new(self.x * s, self.y * s)
    }
}
impl Neg for Vec2 {
    type Output = Self;
    fn neg(self) -> Self {
        Self::new(-self.x, -self.y)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }
    pub fn dot(self, o: Self) -> f32 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    pub fn cross(self, o: Self) -> Self {
        Self::new(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }
    pub fn length(self) -> f32 {
        self.dot(self).sqrt()
    }
    pub fn normalize(self) -> Self {
        let len = self.length();
        if len > f32::EPSILON {
            Self::new(self.x / len, self.y / len, self.z / len)
        } else {
            Self::new(0.0, 1.0, 0.0)
        }
    }
    pub fn to_array(self) -> [f32; 3] {
        [self.x, self.y, self.z]
    }
}

impl Add for Vec3 {
    type Output = Self;
    fn add(self, o: Self) -> Self {
        Self::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
}
impl Sub for Vec3 {
    type Output = Self;
    fn sub(self, o: Self) -> Self {
        Self::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
}
impl Mul<f32> for Vec3 {
    type Output = Self;
    fn mul(self, s: f32) -> Self {
        Self::new(self.x * s, self.y * s, self.z * s)
    }
}

/// A non-indexed triangle list with flat per-vertex normals, ready to hand to a renderer.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TriMesh {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
}

impl TriMesh {
    /// Push a triangle; the normal follows the winding (counter-clockwise when seen from the front).
    pub fn push_tri(&mut self, a: Vec3, b: Vec3, c: Vec3) {
        let n = (b - a).cross(c - a).normalize().to_array();
        self.positions.extend([a.to_array(), b.to_array(), c.to_array()]);
        self.normals.extend([n, n, n]);
    }

    /// Push a triangle, flipping its winding if needed so the normal faces along `towards`.
    pub fn push_tri_facing(&mut self, a: Vec3, b: Vec3, c: Vec3, towards: Vec3) {
        if (b - a).cross(c - a).dot(towards) >= 0.0 {
            self.push_tri(a, b, c);
        } else {
            self.push_tri(a, c, b);
        }
    }

    /// Push a planar quad given in perimeter order, facing along `towards`.
    pub fn push_quad_facing(&mut self, a: Vec3, b: Vec3, c: Vec3, d: Vec3, towards: Vec3) {
        self.push_tri_facing(a, b, c, towards);
        self.push_tri_facing(a, c, d, towards);
    }

    pub fn triangle_count(&self) -> usize {
        self.positions.len() / 3
    }

    pub fn is_empty(&self) -> bool {
        self.positions.is_empty()
    }

    /// Total surface area of all triangles.
    pub fn area(&self) -> f32 {
        self.positions
            .as_chunks::<3>()
            .0
            .iter()
            .map(|t| {
                let [a, b, c] = t.map(|p| Vec3::new(p[0], p[1], p[2]));
                (b - a).cross(c - a).length() * 0.5
            })
            .sum()
    }
}

/// Signed area of a polygon; positive when the vertices are counter-clockwise.
pub fn signed_area(poly: &[Vec2]) -> f32 {
    let n = poly.len();
    (0..n).map(|i| poly[i].cross(poly[(i + 1) % n])).sum::<f32>() * 0.5
}

/// Remove vertices that lie on the straight line between their neighbours.
pub fn remove_collinear(poly: &[Vec2]) -> Vec<Vec2> {
    let mut out: Vec<Vec2> = poly.to_vec();
    let mut i = 0;
    while out.len() > 3 && i < out.len() {
        let n = out.len();
        let prev = out[(i + n - 1) % n];
        let cur = out[i];
        let next = out[(i + 1) % n];
        let d1 = (cur - prev).normalize();
        let d2 = (next - cur).normalize();
        if d1.cross(d2).abs() < 1e-4 && d1.dot(d2) > 0.0 {
            out.remove(i);
            i = i.saturating_sub(1);
        } else {
            i += 1;
        }
    }
    out
}

/// True when segments `p1-p2` and `q1-q2` properly cross or touch.
pub fn segments_intersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2) -> bool {
    fn orient(a: Vec2, b: Vec2, c: Vec2) -> f32 {
        (b - a).cross(c - a)
    }
    fn on_segment(a: Vec2, b: Vec2, p: Vec2) -> bool {
        p.x >= a.x.min(b.x) - 1e-6
            && p.x <= a.x.max(b.x) + 1e-6
            && p.y >= a.y.min(b.y) - 1e-6
            && p.y <= a.y.max(b.y) + 1e-6
    }
    let d1 = orient(q1, q2, p1);
    let d2 = orient(q1, q2, p2);
    let d3 = orient(p1, p2, q1);
    let d4 = orient(p1, p2, q2);
    if ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0))
        && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
    {
        return true;
    }
    let eps = 1e-6;
    (d1.abs() < eps && on_segment(q1, q2, p1))
        || (d2.abs() < eps && on_segment(q1, q2, p2))
        || (d3.abs() < eps && on_segment(p1, p2, q1))
        || (d4.abs() < eps && on_segment(p1, p2, q2))
}

/// True when no two non-adjacent edges of the closed polygon intersect.
pub fn is_simple_polygon(poly: &[Vec2]) -> bool {
    let n = poly.len();
    if n < 3 {
        return false;
    }
    for i in 0..n {
        for j in (i + 1)..n {
            let adjacent = j == i + 1 || (i == 0 && j == n - 1);
            if adjacent {
                continue;
            }
            if segments_intersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]) {
                return false;
            }
        }
    }
    true
}

/// Grow a counter-clockwise simple polygon outward by `distance` (mitered corners).
/// Collinear vertices are removed first. Intended for small offsets such as wall thickness.
pub fn offset_polygon(poly: &[Vec2], distance: f32) -> Vec<Vec2> {
    let p = remove_collinear(poly);
    let n = p.len();
    (0..n)
        .map(|i| {
            let prev = p[(i + n - 1) % n];
            let cur = p[i];
            let next = p[(i + 1) % n];
            // Outward normals of the two edges meeting at `cur` (CCW: rotate direction by -90°).
            let n1 = { let d = (cur - prev).normalize(); Vec2::new(d.y, -d.x) };
            let n2 = { let d = (next - cur).normalize(); Vec2::new(d.y, -d.x) };
            let bisector = (n1 + n2).normalize();
            // Move along the bisector far enough that both edges shift by `distance`.
            let cos_half = bisector.dot(n1).max(0.2);
            cur + bisector * (distance / cos_half)
        })
        .collect()
}

/// Triangulate a simple polygon by ear clipping. Returns index triples into `poly`,
/// each wound counter-clockwise in plan coordinates. Works for either input winding.
pub fn triangulate(poly: &[Vec2]) -> Vec<[usize; 3]> {
    let n = poly.len();
    if n < 3 {
        return Vec::new();
    }
    let mut idx: Vec<usize> = (0..n).collect();
    if signed_area(poly) < 0.0 {
        idx.reverse();
    }
    let mut tris = Vec::with_capacity(n - 2);
    let mut guard = 0;
    while idx.len() > 3 && guard < n * n {
        guard += 1;
        let m = idx.len();
        let mut clipped = false;
        for i in 0..m {
            let (ia, ib, ic) = (idx[(i + m - 1) % m], idx[i], idx[(i + 1) % m]);
            let (a, b, c) = (poly[ia], poly[ib], poly[ic]);
            let convex = (b - a).cross(c - b);
            if convex <= 1e-7 {
                // Reflex or degenerate (collinear) corner. Drop collinear vertices outright.
                if convex.abs() <= 1e-7 {
                    idx.remove(i);
                    clipped = true;
                    break;
                }
                continue;
            }
            let contains_other = idx.iter().any(|&j| {
                j != ia && j != ib && j != ic && point_in_triangle(poly[j], a, b, c)
            });
            if !contains_other {
                tris.push([ia, ib, ic]);
                idx.remove(i);
                clipped = true;
                break;
            }
        }
        if !clipped {
            break; // Not a simple polygon; return what we have.
        }
    }
    if idx.len() == 3 {
        tris.push([idx[0], idx[1], idx[2]]);
    }
    tris
}

fn point_in_triangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2) -> bool {
    let d1 = (b - a).cross(p - a);
    let d2 = (c - b).cross(p - b);
    let d3 = (a - c).cross(p - c);
    d1 >= 0.0 && d2 >= 0.0 && d3 >= 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn l_shape() -> Vec<Vec2> {
        vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(10.0, 4.0),
            Vec2::new(4.0, 4.0),
            Vec2::new(4.0, 8.0),
            Vec2::new(0.0, 8.0),
        ]
    }

    #[test]
    fn area_sign_follows_winding() {
        let poly = l_shape();
        assert!((signed_area(&poly) - 56.0).abs() < 1e-4);
        let rev: Vec<_> = poly.iter().rev().copied().collect();
        assert!((signed_area(&rev) + 56.0).abs() < 1e-4);
    }

    #[test]
    fn triangulation_covers_area_for_both_windings() {
        for poly in [l_shape(), l_shape().into_iter().rev().collect()] {
            let tris = triangulate(&poly);
            assert_eq!(tris.len(), poly.len() - 2);
            let area: f32 = tris
                .iter()
                .map(|t| signed_area(&[poly[t[0]], poly[t[1]], poly[t[2]]]))
                .sum();
            assert!((area - 56.0).abs() < 1e-3, "area {area}");
        }
    }

    #[test]
    fn triangulation_handles_collinear_vertices() {
        let poly = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(5.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(10.0, 6.0),
            Vec2::new(0.0, 6.0),
        ];
        let area: f32 = triangulate(&poly)
            .iter()
            .map(|t| signed_area(&[poly[t[0]], poly[t[1]], poly[t[2]]]))
            .sum();
        assert!((area - 60.0).abs() < 1e-3);
    }

    #[test]
    fn offset_grows_l_shape_uniformly() {
        let grown = offset_polygon(&l_shape(), 0.5);
        assert_eq!(grown.len(), 6);
        // Outer corner moves diagonally out, inner (reflex) corner moves diagonally in.
        assert!(grown[0].distance(Vec2::new(-0.5, -0.5)) < 1e-4);
        assert!(grown[3].distance(Vec2::new(4.5, 4.5)) < 1e-4);
        // An L with arms 10x4 and 4x8 grown by 0.5: 11x5 + 5x4 = 75.
        assert!((signed_area(&grown) - 75.0).abs() < 1e-3);
    }

    #[test]
    fn detects_self_intersection() {
        let bowtie = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 4.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(0.0, 4.0),
        ];
        assert!(!is_simple_polygon(&bowtie));
        assert!(is_simple_polygon(&l_shape()));
    }

    #[test]
    fn collinear_removal() {
        let poly = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(5.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(10.0, 6.0),
            Vec2::new(0.0, 6.0),
        ];
        assert_eq!(remove_collinear(&poly).len(), 4);
    }
}
