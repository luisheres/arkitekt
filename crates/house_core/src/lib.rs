//! Engine-independent core of the Architect game: the house model, geometry generation,
//! construction costs and validation rules. Nothing here depends on Bevy, so it can be
//! unit-tested and reused by the AI appraisal code.

pub mod cost;
pub mod geometry;
pub mod model;
pub mod plot;
pub mod roof;
pub mod samples;
pub mod validate;

pub use cost::{CostBreakdown, PriceList, estimate};
pub use geometry::{TriMesh, Vec2, Vec3};
pub use model::{
    FootprintError, House, Opening, OpeningId, OpeningKind, Roof, RoofMaterial, RoofStyle, Wall, WallId,
    WallMaterial, WallPiece, wall_pieces,
};
pub use plot::{Plot, starter_plots};
pub use roof::{RoofError, RoofGeometry, build_floor, build_roof};
pub use validate::{Issue, validate};
