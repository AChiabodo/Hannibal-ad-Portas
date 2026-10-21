/**
 * The pointer and the keyboard: what a Player's hands mean (ticket C2).
 *
 * Every gesture here is a *convenience over the hooks* — the same calls a test
 * makes and an agent inspects. That is the rule the page has followed since B3
 * ("nothing about the page is reachable only by a hand") and it matters more now
 * that the page has a game in it: a click, a drag and a key each end at
 * `render/game.ts`'s hooks, so what a Player does and what a browser test does
 * cannot drift apart, and neither can be the only way to do it.
 *
 * ## The gestures
 *
 * | gesture | what it does |
 * | --- | --- |
 * | left click | pick the Squad under the pointer, or the row it landed on |
 * | shift + left click | add that Squad to the picked set, or take it out |
 * | left drag | pick every Squad the box touches |
 * | right click | `move` the picked Squads to the tile under the pointer |
 * | shift + right click | `attackMove` to that tile |
 * | right drag | pan the camera |
 * | wheel | zoom about the pointer |
 * | `a` then left click | `attackMove` to the click — the classic RTS arm |
 * | `s` | `hold` |
 * | `w` | `withdraw` |
 * | `l` / `c` | hold a `line` / a `column` |
 * | ctrl (or ⌘) + digit | bind the picked Squads to that control group |
 * | digit | pick the Squads that group holds |
 * | escape | cancel the action being armed, or else drop the picked set |
 * | space | pause and resume |
 *
 * ## One armed action, whoever armed it
 *
 * The armed action is the **page's**, not this module's: a button, a shortcut and
 * the classic `a` all call the same `perform`, and the page answers a click with
 * whatever it has armed. That is what #55's "buttons and existing shortcuts use
 * one submission/targeting path" means in practice — there is one piece of state
 * and one place it is read, so no gesture can be the only way to do something.
 *
 * ## Why the marquee is a buffer
 *
 * The box a drag draws is a `PixelBuffer` composed at the size the drag is
 * (`ui/marquee.ts`), like every other pixel on the page (ADR-0002). It lives on
 * the stage's screen-space root, so it is not magnified, not panned and not
 * drawn by a second code path the pixel hashes cannot see.
 *
 * ## A click is not a drag
 *
 * A press that moved fewer than `DRAG_THRESHOLD` screen pixels is a click, and a
 * press that moved further is a drag: that is the whole of the difference, and
 * it is measured in screen pixels so it feels the same at every zoom. A pan
 * leaves a camera move behind it; a box leaves a selection.
 */
import { Container, Sprite } from 'pixi.js';
import type { HudLayout, Rect } from '../ui/hud.ts';
import { marquee } from '../ui/marquee.ts';
import { textureOf, type Stage } from './stage.ts';

/**
 * What a gesture needs of the page, which is the page's hooks and three camera
 * calls. Named here rather than imported from `boot.ts` so that this module and
 * the page can be read in either order.
 */
export interface ControlTarget {
  readonly hoverAt?: (x: number, y: number) => void;
  readonly interfaceKey?: (key: string, reverse: boolean) => boolean;
  readonly navigateMinimap: (x: number, y: number) => boolean;
  readonly doubleClickAt: (x: number, y: number) => void;
  readonly centerSelection: () => void;
  readonly toggleNavigator: () => void;
  /** The camera's magnification, for turning screen pixels into stage pixels. */
  readonly zoom: () => number;
  /** Moves the camera by whole stage pixels. */
  readonly panBy: (dx: number, dy: number) => void;
  /** Sets a magnification, keeping one screen pixel where it is. */
  readonly zoomAbout: (zoom: number, screenX: number, screenY: number) => void;
  /** Picks whatever is under a screen point. */
  readonly selectAt: (screenX: number, screenY: number, additive: boolean) => void;
  /** Picks every Squad a box dragged between two screen points touches. */
  readonly selectIn: (fromX: number, fromY: number, toX: number, toY: number, additive: boolean) => void;
  /** Gives the picked Squads a move or an attack-move to a screen point. */
  readonly orderAt: (kind: 'move' | 'attackMove', screenX: number, screenY: number) => boolean;
  /** Performs a contextual action by its stable id: arms it, or submits it. */
  readonly perform: (orderId: string) => boolean;
  /** Whether an action is waiting for a target. */
  readonly targeting: () => string | null;
  /** Completes the armed action at a screen point. */
  readonly targetAt: (screenX: number, screenY: number) => boolean;
  /** Cancels an armed action, and says whether there was one. */
  readonly cancelTargeting: () => boolean;
  /** Binds the picked Squads to a control group. */
  readonly bindGroup: (index: number) => boolean;
  /** Picks the Squads a control group holds. */
  readonly recallGroup: (index: number) => boolean;
  /** Drops the picked set. */
  readonly clearSelection: () => void;
  /** Pauses the Match if it is running, and resumes it if it is paused. */
  readonly togglePause: () => void;
  /** The geometry used for HUD clicks, wheel and page keys. */
  readonly hudLayout: () => HudLayout;
  /** Includes session chrome, so an armed map order cannot swallow a menu click. */
  readonly hudRects?: () => readonly Rect[];
  readonly scrollReference?: (lines: number) => boolean;
  readonly scrollHud: (region: 'list' | 'detail' | 'commands' | 'notices', lines: number) => void;
}

/** How far a press must travel, in screen pixels, before it is a drag and not a click. */
export const DRAG_THRESHOLD = 3;

/** The magnification one wheel notch asks for, which `camera.ts` clamps. */
const WHEEL_ZOOM = 1;

/** A press in progress: where it began, and how much panning has already been applied. */
interface Press {
  readonly pointerId: number;
  readonly button: number;
  readonly fromX: number;
  readonly fromY: number;
  appliedX: number;
  appliedY: number;
}

/**
 * Binds the canvas's pointer, wheel and the window's keyboard to a target.
 *
 * @param stage The page's stage: the canvas the gestures happen on, and the root
 *   the marquee is drawn on.
 * @param target What a gesture ends at, which is the page's own hooks.
 */
export function bindControls(stage: Stage, target: ControlTarget): void {
  const overlay = new Container();
  stage.root.addChild(overlay);

  let marqueeSprite: Sprite | null = null;
  stage.canvas.addEventListener('pointerleave', () => target.hoverAt?.(-1, -1));
  let press: Press | null = null;
  let minimapPress = false;
  let interfacePress = false;

  const canvas = stage.canvas;
  const local = (event: MouseEvent): { readonly x: number; readonly y: number } => {
    const rect = canvas.getBoundingClientRect();

    return { x: Math.floor(event.clientX - rect.left), y: Math.floor(event.clientY - rect.top) };
  };

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.button !== 2) return;

    const at = local(event);
    const layout = target.hudLayout();
    const topmost = [...(target.hudRects?.() ?? [layout.bar, layout.list, layout.detail, layout.minimap])].reverse()
      .find((rect) => contains(rect, at.x, at.y));
    minimapPress = contains(layout.minimap, at.x, at.y) && topmost?.x === layout.minimap.x && topmost.y === layout.minimap.y
      && topmost.width === layout.minimap.width && topmost.height === layout.minimap.height;
    interfacePress = (target.hudRects?.() ?? [layout.bar, layout.list, layout.detail, layout.minimap]).some((rect) => contains(rect, at.x, at.y));
    if (minimapPress) target.navigateMinimap(at.x, at.y);
    press = { pointerId: event.pointerId, button: event.button, fromX: event.clientX, fromY: event.clientY, appliedX: 0, appliedY: 0 };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (press === null) { const at = local(event); target.hoverAt?.(at.x, at.y); }
    if (press === null || event.pointerId !== press.pointerId) return;

    if (minimapPress) {
      const at = local(event);
      const rect = target.hudLayout().minimap;
      target.navigateMinimap(Math.max(rect.x, Math.min(rect.x + rect.width - 1, at.x)), Math.max(rect.y, Math.min(rect.y + rect.height - 1, at.y)));
      return;
    }
    if (interfacePress) return;
    if (press.button === 2) {
      pan(event, press, target);
      return;
    }

    const from = { x: press.fromX - canvas.getBoundingClientRect().left, y: press.fromY - canvas.getBoundingClientRect().top };
    const to = local(event);
    if (Math.abs(to.x - from.x) < DRAG_THRESHOLD && Math.abs(to.y - from.y) < DRAG_THRESHOLD) return;

    marqueeSprite = showMarquee(overlay, marqueeSprite, from, to);
  });

  canvas.addEventListener('pointerup', (event) => {
    if (press === null || event.pointerId !== press.pointerId) return;

    const finished = press;
    press = null;

    if (minimapPress) { minimapPress = false; return; }
    if (interfacePress) {
      if (finished.button === 0) { const at = local(event); target.selectAt(at.x, at.y, event.shiftKey); }
      return;
    }
    if (finished.button === 2) {
      // A right press that panned is a pan; one that did not is an order. The
      // shift makes it an attack-move, which is the same choice `a` arms — and
      // an armed order wins, because a Player who pressed `a` has already said
      // what the next click means.
      if (finished.appliedX === 0 && finished.appliedY === 0) {
        const at = local(event);
        if (target.targeting() !== null) target.targetAt(at.x, at.y);
        else target.orderAt(event.shiftKey ? 'attackMove' : 'move', at.x, at.y);
      }
      return;
    }

    const to = local(event);
    const from = {
      x: Math.floor(finished.fromX - canvas.getBoundingClientRect().left),
      y: Math.floor(finished.fromY - canvas.getBoundingClientRect().top),
    };
    const additive = event.shiftKey;
    const dragged = Math.abs(to.x - from.x) >= DRAG_THRESHOLD || Math.abs(to.y - from.y) >= DRAG_THRESHOLD;

    clearMarquee(overlay, marqueeSprite);
    marqueeSprite = null;

    if (dragged) {
      target.selectIn(from.x, from.y, to.x, to.y, additive);
      return;
    }

    const layout = target.hudLayout();
    const overHud = (target.hudRects?.() ?? [layout.bar, layout.list, layout.detail, layout.minimap])
      .some((rect) => contains(rect, to.x, to.y));
    if (target.targeting() !== null && !overHud) {
      target.targetAt(to.x, to.y);
      return;
    }

    target.selectAt(to.x, to.y, additive);
  });

  canvas.addEventListener('dblclick', (event) => { const at = local(event); target.doubleClickAt(at.x, at.y); });

  canvas.addEventListener('pointercancel', () => {
    clearMarquee(overlay, marqueeSprite);
    marqueeSprite = null;
    press = null;
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();

      const at = local(event);
      if (event.deltaY === 0) return;
      if (target.scrollReference?.(event.deltaY < 0 ? -3 : 3)) return;
      const layout = target.hudLayout();
      const topmost = [...(target.hudRects?.() ?? [layout.bar, layout.list, layout.detail, layout.minimap])].reverse()
        .find((rect) => contains(rect, at.x, at.y));
      for (const region of ['list', 'detail'] as const) {
        if (topmost && (topmost.x !== layout[region].x || topmost.y !== layout[region].y ||
          topmost.width !== layout[region].width || topmost.height !== layout[region].height)) continue;
        if (contains(layout[region], at.x, at.y)) {
          const cardX = Math.min(...layout.commands.map(({ rect }) => rect.x), ...layout.tabs.map(({ rect }) => rect.x));
          target.scrollHud(region === 'detail' && at.x >= cardX ? 'commands' : region, event.deltaY < 0 ? -3 : 3);
          return;
        }
      }
      if ((target.hudRects?.() ?? []).some((rect) => contains(rect, at.x, at.y))) return;
      const zoom = target.zoom() + (event.deltaY < 0 ? WHEEL_ZOOM : -WHEEL_ZOOM);
      target.zoomAbout(zoom, at.x, at.y);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (event) => {
    // A key pressed inside a text field is a letter, not an order: nothing on
    // the page has one today, and the day it does this is already right.
    const element = event.target;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return;
    if (target.interfaceKey?.(event.key, event.shiftKey)) {
      event.preventDefault();
      return;
    }

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
      if (event.ctrlKey || event.metaKey) target.bindGroup(digit);
      else target.recallGroup(digit);
      event.preventDefault();
      return;
    }

    switch (event.key) {
      case 'PageUp':
      case 'PageDown':
        target.scrollHud(event.shiftKey ? 'detail' : 'list',
          (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? target.hudLayout().detailScroll.page : target.hudLayout().listScroll.page));
        event.preventDefault();
        break;
      case 'f':
      case 'F':
        target.centerSelection();
        break;
      case 'Tab':
        target.toggleNavigator();
        event.preventDefault();
        break;
      case 'a':
      case 'A':
        target.perform('attackMove');
        break;
      case 's':
      case 'S':
        target.perform('hold');
        break;
      case 'w':
      case 'W':
        target.perform('withdraw');
        break;
      case 'l':
      case 'L':
        target.perform('formation.line');
        break;
      case 'c':
      case 'C':
        target.perform('formation.column');
        break;
      case 'Escape':
        // Escape cancels the action being aimed, and only then the selection: a
        // Command already submitted is not a target and is never taken back.
        if (!target.cancelTargeting()) target.clearSelection();
        break;
      case ' ':
        target.togglePause();
        event.preventDefault();
        break;
      default:
        return;
    }
  });
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** One pointer move with the right button down: pan by the whole stage pixels travelled. */
function pan(event: PointerEvent, press: Press, target: ControlTarget): void {
  const zoom = target.zoom();
  const targetX = Math.round(-(event.clientX - press.fromX) / zoom);
  const targetY = Math.round(-(event.clientY - press.fromY) / zoom);

  target.panBy(targetX - press.appliedX, targetY - press.appliedY);
  press.appliedX = targetX;
  press.appliedY = targetY;
}

/**
 * Draws the drag's box, or replaces the one already drawn.
 *
 * The sprite's texture is replaced and the one before it destroyed: a drag
 * composes a buffer per move, and a page that kept them would keep a texture per
 * mouse movement.
 */
function showMarquee(
  overlay: Container,
  sprite: Sprite | null,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): Sprite {
  const x = Math.floor(Math.min(from.x, to.x));
  const y = Math.floor(Math.min(from.y, to.y));
  const width = Math.max(1, Math.ceil(Math.max(from.x, to.x)) - x);
  const height = Math.max(1, Math.ceil(Math.max(from.y, to.y)) - y);
  const texture = textureOf(marquee(width, height));

  if (sprite === null) {
    const created = new Sprite(texture);
    created.position.set(x, y);
    overlay.addChild(created);

    return created;
  }

  const previous = sprite.texture;
  sprite.texture = texture;
  previous.destroy(true);
  sprite.position.set(x, y);

  return sprite;
}

/** Takes the box off the page when the drag is over. */
function clearMarquee(overlay: Container, sprite: Sprite | null): void {
  if (sprite === null) return;

  sprite.texture.destroy(true);
  sprite.destroy();
  overlay.removeChildren();
}
