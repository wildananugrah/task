// The three knobs the design exposes as editor props. They are constants here
// so a single edit restyles the whole app the way the mockup's panel did.

/** Colour used for active affordances that are not part of the ink scale. */
export const ACCENT = '#171717'

/** 'roomy' | 'compact' — drives list row height. */
export const DENSITY = 'roomy'

/** 'list' | 'board' — the view a workspace opens in. */
export const DEFAULT_VIEW = 'list'

export const ROW_PADDING = DENSITY === 'roomy' ? '13px' : '8px'
