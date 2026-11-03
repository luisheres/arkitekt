//! Rules a house must satisfy before it can be sold.

use crate::cost::{PriceList, estimate};
use crate::model::{FootprintError, House, OpeningId, OpeningKind, RoofStyle, WallId};
use crate::plot::Plot;
use crate::roof::{RoofError, build_roof};
use thiserror::Error;

pub const MIN_WALL_LENGTH: f32 = 1.0;
pub const MIN_WALL_HEIGHT: f32 = 2.2;
pub const MAX_WALL_HEIGHT: f32 = 4.5;
/// Minimum distance from an opening's edge to the end of its wall's centerline.
pub const OPENING_END_MARGIN: f32 = 0.3;
/// Minimum solid wall above an opening.
pub const MIN_LINTEL: f32 = 0.2;
/// Minimum solid wall between two openings in the same wall.
pub const MIN_GAP_BETWEEN_OPENINGS: f32 = 0.2;
pub const MIN_OPENING_SIZE: f32 = 0.4;
pub const DOOR_WIDTH: (f32, f32) = (0.7, 2.5);
pub const DOOR_MIN_HEIGHT: f32 = 1.9;
pub const PITCH_RANGE: (f32, f32) = (10.0, 60.0);
pub const MAX_OVERHANG: f32 = 1.2;
pub const MIN_FLOOR_AREA: f32 = 20.0;

#[derive(Clone, Debug, PartialEq, Error)]
pub enum Issue {
    #[error("wall {0:?} is shorter than {MIN_WALL_LENGTH} m")]
    WallTooShort(WallId),
    #[error("wall {0:?} must be between {MIN_WALL_HEIGHT} and {MAX_WALL_HEIGHT} m tall")]
    WallHeightOutOfRange(WallId),
    #[error("wall {0:?} is outside the buildable area of the plot")]
    WallOutsidePlot(WallId),
    #[error("opening {0:?} refers to a wall that does not exist")]
    OpeningWithoutWall(OpeningId),
    #[error("opening {0:?} is smaller than {MIN_OPENING_SIZE} m")]
    OpeningTooSmall(OpeningId),
    #[error("opening {0:?} is too close to the end of its wall")]
    OpeningTooCloseToEnd(OpeningId),
    #[error("opening {0:?} needs at least {MIN_LINTEL} m of wall above it")]
    OpeningTooTall(OpeningId),
    #[error("openings {0:?} and {1:?} overlap or are too close together")]
    OpeningsOverlap(OpeningId, OpeningId),
    #[error("door {0:?} must be {min}-{max} m wide and at least {DOOR_MIN_HEIGHT} m tall", min = DOOR_WIDTH.0, max = DOOR_WIDTH.1)]
    BadDoorSize(OpeningId),
    #[error("{0}")]
    Footprint(FootprintError),
    #[error("the floor area is below the minimum of {MIN_FLOOR_AREA} m²")]
    TooSmall,
    #[error("the house needs at least one door")]
    NoDoor,
    #[error("the house needs a roof")]
    NoRoof,
    #[error("{0:?} roofs need a rectangular footprint; use a flat roof for other shapes")]
    RoofNeedsRectangle(RoofStyle),
    #[error("roof pitch must be between {min}° and {max}°", min = PITCH_RANGE.0, max = PITCH_RANGE.1)]
    RoofPitchOutOfRange,
    #[error("roof overhang must be between 0 and {MAX_OVERHANG} m")]
    RoofOverhangOutOfRange,
    #[error("construction costs {cost:.0}, but the budget is {budget:.0}")]
    OverBudget { cost: f64, budget: f64 },
}

/// Check everything that must hold for the house to be sellable. An empty result means OK.
pub fn validate(house: &House, plot: &Plot, budget: f64, prices: &PriceList) -> Vec<Issue> {
    let mut issues = Vec::new();

    for w in &house.walls {
        if w.length() < MIN_WALL_LENGTH {
            issues.push(Issue::WallTooShort(w.id));
        }
        if !(MIN_WALL_HEIGHT..=MAX_WALL_HEIGHT).contains(&w.height) {
            issues.push(Issue::WallHeightOutOfRange(w.id));
        }
        if !plot.is_buildable(w.start) || !plot.is_buildable(w.end) {
            issues.push(Issue::WallOutsidePlot(w.id));
        }
    }

    check_openings(house, &mut issues);

    if !house.openings.iter().any(|o| o.kind == OpeningKind::Door) {
        issues.push(Issue::NoDoor);
    }

    match house.footprint() {
        Err(e) => issues.push(Issue::Footprint(e)),
        Ok(_) => {
            if house.floor_area() < MIN_FLOOR_AREA {
                issues.push(Issue::TooSmall);
            }
            check_roof(house, &mut issues);
        }
    }

    let cost = estimate(house, prices).total();
    if cost > budget {
        issues.push(Issue::OverBudget { cost, budget });
    }
    issues
}

fn check_openings(house: &House, issues: &mut Vec<Issue>) {
    for o in &house.openings {
        let Some(wall) = house.wall(o.wall) else {
            issues.push(Issue::OpeningWithoutWall(o.id));
            continue;
        };
        if o.width < MIN_OPENING_SIZE || o.height < MIN_OPENING_SIZE {
            issues.push(Issue::OpeningTooSmall(o.id));
        }
        if o.left() < OPENING_END_MARGIN || o.right() > wall.length() - OPENING_END_MARGIN {
            issues.push(Issue::OpeningTooCloseToEnd(o.id));
        }
        if o.top() > wall.height - MIN_LINTEL || o.sill < 0.0 {
            issues.push(Issue::OpeningTooTall(o.id));
        }
        if o.kind == OpeningKind::Door
            && (!(DOOR_WIDTH.0..=DOOR_WIDTH.1).contains(&o.width) || o.height < DOOR_MIN_HEIGHT)
        {
            issues.push(Issue::BadDoorSize(o.id));
        }
    }
    for wall in &house.walls {
        let ops = house.openings_in(wall.id);
        for pair in ops.windows(2) {
            if pair[1].left() - pair[0].right() < MIN_GAP_BETWEEN_OPENINGS {
                issues.push(Issue::OpeningsOverlap(pair[0].id, pair[1].id));
            }
        }
    }
}

fn check_roof(house: &House, issues: &mut Vec<Issue>) {
    let Some(roof) = &house.roof else {
        issues.push(Issue::NoRoof);
        return;
    };
    if roof.style != RoofStyle::Flat {
        if !(PITCH_RANGE.0..=PITCH_RANGE.1).contains(&roof.pitch_deg) {
            issues.push(Issue::RoofPitchOutOfRange);
        }
        if !(0.0..=MAX_OVERHANG).contains(&roof.overhang) {
            issues.push(Issue::RoofOverhangOutOfRange);
        }
    }
    if let Err(RoofError::NeedsRectangle(style)) = build_roof(house) {
        issues.push(Issue::RoofNeedsRectangle(style));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plot::starter_plots;
    use crate::samples;

    fn plot() -> Plot {
        starter_plots().remove(0)
    }

    #[test]
    fn samples_are_valid() {
        let p = plot();
        for (name, house) in samples::all(&p) {
            let issues = validate(&house, &p, 1e9, &PriceList::default());
            assert!(issues.is_empty(), "{name}: {issues:?}");
        }
    }

    #[test]
    fn empty_house_reports_missing_parts() {
        let issues = validate(&House::new(), &plot(), 1e9, &PriceList::default());
        assert!(issues.contains(&Issue::NoDoor));
        assert!(issues.contains(&Issue::Footprint(FootprintError::NoWalls)));
    }

    #[test]
    fn over_budget_is_reported() {
        let p = plot();
        let house = samples::cottage(&p);
        let issues = validate(&house, &p, 1000.0, &PriceList::default());
        assert!(matches!(issues.as_slice(), [Issue::OverBudget { .. }]));
    }

    #[test]
    fn overlapping_openings_are_reported() {
        let p = plot();
        let mut house = samples::cottage(&p);
        let wall = house.walls[0].id;
        let existing = house.openings_in(wall)[0].offset;
        house.add_window(wall, existing + 0.3, 1.0, 1.0, 1.0);
        let issues = validate(&house, &p, 1e9, &PriceList::default());
        assert!(issues.iter().any(|i| matches!(i, Issue::OpeningsOverlap(..))), "{issues:?}");
    }

    #[test]
    fn house_outside_setback_is_reported() {
        let p = plot();
        let mut house = samples::cottage(&p);
        for w in &mut house.walls {
            w.start.x -= 10.0;
            w.end.x -= 10.0;
        }
        let issues = validate(&house, &p, 1e9, &PriceList::default());
        assert!(issues.iter().any(|i| matches!(i, Issue::WallOutsidePlot(_))));
    }

    #[test]
    fn gable_on_l_shape_is_reported() {
        let p = plot();
        let mut house = samples::l_shaped_modern(&p);
        house.roof.as_mut().unwrap().style = RoofStyle::Gable;
        let issues = validate(&house, &p, 1e9, &PriceList::default());
        assert!(issues.contains(&Issue::RoofNeedsRectangle(RoofStyle::Gable)));
    }
}
