/** Only presentation preferences use this key; audio owns its separate settings (#30). */
export interface UiPreferences {
  readonly uiScale: number;
  readonly navigator: boolean;
  readonly guideDismissed: boolean;
}
export const DEFAULT_UI_PREFERENCES: UiPreferences = { uiScale: 2, navigator: true, guideDismissed: false };
const KEY = 'spqr.ui.v1';
export function loadUiPreferences(): UiPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value === null || typeof value !== 'object') return { ...DEFAULT_UI_PREFERENCES };
    const saved = value as Partial<UiPreferences>;
    return { uiScale: [1, 2, 3].includes(saved.uiScale ?? 0) ? saved.uiScale! : 2,
      navigator: typeof saved.navigator === 'boolean' ? saved.navigator : true,
      guideDismissed: typeof saved.guideDismissed === 'boolean' ? saved.guideDismissed : false };
  } catch { return { ...DEFAULT_UI_PREFERENCES }; }
}
export function saveUiPreferences(value: UiPreferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}
