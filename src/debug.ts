/**
 * The browser debug hooks (ADR-0003).
 *
 * Playwright and, later, an external agent drive the game through this surface,
 * so it is part of the architecture rather than a test-only afterthought: the
 * page publishes what it booted, a way to move the camera, and a way to read back
 * what the renderer drew. The two pages publish the same shape — the game page
 * fills `view` and the Atelier fills `atelier` — so one inspection routine reads
 * either.
 */
import type { AtelierHooks } from './render/atelier.ts';
import type { ViewHooks } from './render/boot.ts';
import type { GameHooks } from './render/game.ts';
import type { FrameReport } from './render/stage.ts';

/** What the boot sequence managed to do, success or failure. */
export type BootReport =
  | { readonly booted: true; readonly render: FrameReport }
  | { readonly booted: false; readonly error: string };

export interface SpqrDebugHooks {
  /** How the page's renderer started, or why it did not. */
  readonly boot: BootReport;
  /** The game page's camera and pixel read-back; null on any other page. */
  readonly view: ViewHooks | null;
  /** The game page's Match and interface; null on any other page. */
  readonly game: GameHooks | null;
  /** The Atelier's geometry and pixel read-back; null on any other page. */
  readonly atelier: AtelierHooks | null;
}

declare global {
  interface Window {
    __SPQR: SpqrDebugHooks;
  }
}
