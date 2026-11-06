export const PANEL_LAYOUTS = ['sidebar', 'dock', 'compact'] as const;
export type PanelLayout = (typeof PANEL_LAYOUTS)[number];

/** Only presentation preferences use this key; audio owns its separate settings (#30). */
export interface UiPreferences {
  readonly panelLayout: PanelLayout;
  readonly uiScale: number;
  readonly navigator: boolean;
  readonly guideDismissed: boolean;
}
export const DEFAULT_UI_PREFERENCES: UiPreferences = { panelLayout: 'sidebar', uiScale: 2, navigator: true, guideDismissed: false };

/** Keep the requested preference, but fit every control on the current desktop. */
export function fittedUiScale(requested: number, size: { readonly width: number; readonly height: number }): number {
  return Math.max(1, Math.min(requested, Math.floor(size.width / 640), Math.floor(size.height / 360)));
}

/** The one storage key presentation preferences use; exported for a test that seeds them. */
export const UI_PREFERENCES_KEY = 'spqr.ui.v1';
const KEY = UI_PREFERENCES_KEY;
export function loadUiPreferences(): UiPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value === null || typeof value !== 'object') return { ...DEFAULT_UI_PREFERENCES };
    const saved = value as Partial<UiPreferences>;
    return { panelLayout: PANEL_LAYOUTS.includes(saved.panelLayout!) ? saved.panelLayout! : 'sidebar',
      uiScale: [1, 2, 3].includes(saved.uiScale ?? 0) ? saved.uiScale! : 2,
      navigator: typeof saved.navigator === 'boolean' ? saved.navigator : true,
      guideDismissed: typeof saved.guideDismissed === 'boolean' ? saved.guideDismissed : false };
  } catch { return { ...DEFAULT_UI_PREFERENCES }; }
}
export function saveUiPreferences(value: UiPreferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}
