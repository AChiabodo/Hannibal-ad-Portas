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
 * | escape | drop the picked set, or the order being armed |
 * | space | pause and resume |
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
import type { Formation } from '../sim/command.ts';
import { marquee } from '../ui/marquee.ts';
import { textureOf, type Stage } from './stage.ts';

/**
 * What a gesture needs of the page, which is the page's hooks and three camera
 * calls. Named here rather than imported from `boot.ts` so that this module and
 * the page can be read in either order.
 */
export interface ControlTarget {
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
  /** Gives the picked Squads an order that needs no map point. */
  readonly orderNow: (kind: 'hold' | 'withdraw') => boolean;
  /** Sets the shape the picked Squads hold. */
  readonly setFormation: (shape: Formation) => boolean;
  /** Binds the picked Squads to a control group. */
  readonly bindGroup: (index: number) => boolean;
  /** Picks the Squads a control group holds. */
  readonly recallGroup: (index: number) => boolean;
  /** Drops the picked set. */
  readonly clearSelection: () => void;
  /** Pauses the Match if it is running, and resumes it if it is paused. */
  readonly togglePause: () => void;
  /** Consumes a wheel over the interface before map zoom. */
  readonly scrollHudAt: (x: number, y: number, lines: number) => boolean;
  /** Page keys scroll the list; Shift pages secondary details. */
  readonly pageHud: (detail: boolean, direction: number) => void;
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
  let press: Press | null = null;
  let armed: 'attackMove' | null = null;

  const canvas = stage.canvas;
  const local = (event: PointerEvent | WheelEvent): { readonly x: number; readonly y: number } => {
    const rect = canvas.getBoundingClientRect();

    return { x: Math.floor(event.clientX - rect.left), y: Math.floor(event.clientY - rect.top) };
  };

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.button !== 2) return;

    press = { pointerId: event.pointerId, button: event.button, fromX: event.clientX, fromY: event.clientY, appliedX: 0, appliedY: 0 };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (press === null || event.pointerId !== press.pointerId) return;

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

    if (finished.button === 2) {
      // A right press that panned is a pan; one that did not is an order. The
      // shift makes it an attack-move, which is the same choice `a` arms — and
      // an armed order wins, because a Player who pressed `a` has already said
      // what the next click means.
      if (finished.appliedX === 0 && finished.appliedY === 0) {
        const at = local(event);
        target.orderAt(armed ?? (event.shiftKey ? 'attackMove' : 'move'), at.x, at.y);
        armed = null;
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

    if (armed !== null) {
      target.orderAt(armed, to.x, to.y);
      armed = null;
      return;
    }

    target.selectAt(to.x, to.y, additive);
  });

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
      if (target.scrollHudAt(at.x, at.y, event.deltaY < 0 ? -3 : 3)) return;
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
        target.pageHud(event.shiftKey, event.key === 'PageUp' ? -1 : 1);
        event.preventDefault();
        break;
      case 'a':
      case 'A':
        armed = 'attackMove';
        break;
      case 's':
      case 'S':
        target.orderNow('hold');
        break;
      case 'w':
      case 'W':
        target.orderNow('withdraw');
        break;
      case 'l':
      case 'L':
        target.setFormation('line');
        break;
      case 'c':
      case 'C':
        target.setFormation('column');
        break;
      case 'Escape':
        if (armed !== null) armed = null;
        else target.clearSelection();
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
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const width = Math.max(1, Math.abs(to.x - from.x));
  const height = Math.max(1, Math.abs(to.y - from.y));
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
