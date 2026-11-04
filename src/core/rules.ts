/** The building rules' numbers, shared by validation, editing and the message catalogs. */

export const MIN_WALL_LENGTH = 1.0;
export const MIN_WALL_HEIGHT = 2.2;
export const MAX_WALL_HEIGHT = 4.5;
/** Minimum distance from an opening's edge to the end of its wall's centerline. */
export const OPENING_END_MARGIN = 0.3;
/** Minimum solid wall above an opening. */
export const MIN_LINTEL = 0.2;
/** Minimum solid wall between two openings in the same wall. */
export const MIN_GAP_BETWEEN_OPENINGS = 0.2;
export const MIN_OPENING_SIZE = 0.4;
export const DOOR_WIDTH = [0.7, 2.5] as const;
export const DOOR_MIN_HEIGHT = 1.9;
export const GARAGE_DOOR_WIDTH = [2.2, 3.5] as const;
export const GARAGE_DOOR_MIN_HEIGHT = 2.0;
export const PITCH_RANGE = [10, 60] as const;
export const MAX_OVERHANG = 1.2;
export const MIN_FLOOR_AREA = 20;

/** Default height of new walls. */
export const DEFAULT_WALL_HEIGHT = 2.7;
/** Thickness of the floor structure between two storeys. */
export const FLOOR_STRUCTURE = 0.3;
/** Most storeys a house may have. */
export const MAX_LEVELS = 3;
/** A straight flight of stairs: width and length of its footprint. */
export const STAIR_WIDTH = 1.0;
export const STAIR_LENGTH = 3.6;
