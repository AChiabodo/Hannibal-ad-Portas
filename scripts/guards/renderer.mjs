/**
 * The one spelling of "an import of the rendering engine".
 *
 * Both boundary fences ask the same question of a specifier — is it `pixi.js`,
 * or a path into it? — and they must answer it the same way, so the package name
 * and the test live here rather than in either fence. What each fence does with
 * the answer (reachability from the simulation, versus an allow-list of
 * directories) stays the fence's own business.
 */

/** The rendering engine that must stay out of Node-run code (ADR-0001). */
export const RENDERER_PACKAGE = 'pixi.js';

/**
 * Whether a specifier names the rendering engine or one of its subpaths.
 *
 * @param {string} specifier
 * @returns {boolean}
 */
export function isRendererImport(specifier) {
  return specifier === RENDERER_PACKAGE || specifier.startsWith(`${RENDERER_PACKAGE}/`);
}
