import type { RenderProbe } from './render/boot.ts';

/** What the boot sequence managed to do, success or failure. */
export type BootReport =
  | { readonly booted: true; readonly render: RenderProbe }
  | { readonly booted: false; readonly error: string };

/**
 * The browser debug hooks (ADR-0003).
 *
 * Playwright and, later, an external agent drive the game through this surface,
 * so it is part of the architecture rather than a test-only afterthought.
 */
export interface SpqrDebugHooks {
  readonly boot: BootReport;
}

declare global {
  interface Window {
    __SPQR: SpqrDebugHooks;
  }
}
