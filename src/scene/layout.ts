/** World offset of the body + platform group (see Scene). */
export const MODEL_Y = -0.85

/** Local height of the scan sweep at time t (shared by the platform ring and the body). */
export const scanHeight = (t: number) => 0.02 + (0.5 - 0.5 * Math.cos(t * 0.9)) * 1.78
