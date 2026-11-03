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
