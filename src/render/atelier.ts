/**
 * The Atelier: the whole catalogue on one page, at several zoom levels (ticket B2, PLAN §3).
 *
 * Art nobody can see is art nobody can fix, and the plan's answer to procedural
 * art's quality ceiling is to look at all of it, early and often (PLAN §8). The
 * page is also the surface an agent inspects: it renders the same `PixelBuffer`
 * the generator produced, through the same adapter the game uses, and it publishes
 * its own geometry and pixel read-back on `window.__SPQR`, so an agent can check
 * the art instead of guessing at it from source.
 *
 * One stage, one plate, one column per magnification. Each column is a container
 * the camera is applied to, which is the same code path the game's world takes:
 * nothing here is drawn by a second renderer that could disagree with the first.
 */

import { Container } from 'pixi.js';
import { formationStudy, STUDY_SIZE } from './formation-study.ts';
import { PLATE_BACKGROUND, PLATE_INK, cataloguePlate } from '../art/catalogue.ts';
import type { Rgba } from '../art/pixel-buffer.ts';
import { textPlate } from '../art/font.ts';
import { ATELIER_ZOOMS, atelierLayout, type AtelierLayout } from './atelier-layout.ts';
import { createCamera } from './camera.ts';
import { applyCamera, createStage, frameReport, samplesOf, type FrameReport, type PixelPoint } from './stage.ts';

/** The Atelier's debug surface: what is on the page, and what its pixels are. */
export interface AtelierHooks {
  /** The page's geometry: canvas size, and every column's zoom and rectangle. */
  readonly report: AtelierLayout;
  /** The magnifications on the page, in the order they are laid out. */
  readonly zooms: readonly number[];
  /** Reads pixels out of the rendered page, one extraction for all of them. */
  samples(points: readonly PixelPoint[]): readonly Rgba[];
}

/** The running Atelier page. */
export interface AtelierView extends AtelierHooks {
  /** What the renderer did when the page was built. */
  readonly probe: FrameReport;
}

/**
 * Builds the page: every catalogue column at its own magnification, captions in
 * the generated font, one frame drawn.
 */
export async function createAtelier(mount: HTMLElement): Promise<AtelierView> {
  const query = new URLSearchParams(location.search);
  const study = query.get('study') === '67';
  const treatment = query.get('treatment');
  const plate = study ? formationStudy(query.get('faction') === 'carthage' ? 'carthage' : 'rome',
    treatment === 'compact' || treatment === 'fine' ? treatment : 'native', query.get('scene') === 'proportions') : cataloguePlate();
  const layout = atelierLayout(study ? STUDY_SIZE : plate, study ? [Number(query.get('zoom') ?? 2)] : ATELIER_ZOOMS);

  const stage = await createStage(mount, {
    width: layout.width,
    height: layout.height,
    background: PLATE_BACKGROUND,
  });

  for (const section of layout.sections) {
    // The wrapper holds the column's place on the page; the camera scales the
    // plate inside it, so the two never fight over the same container.
    const column = new Container();
    column.position.set(section.x, section.y);
    const world = new Container();
    column.addChild(world);
    const image = stage.spriteOf(plate);
    if (study) image.scale.set(0.5);
    world.addChild(image);
    applyCamera(world, createCamera({ zoom: section.zoom }));
    stage.root.addChild(column);

    // The caption is a `PixelBuffer` like everything else: `zoom 4` over a column
    // is a glyph run, not a browser label, so the page has no text on it that did
    // not come out of the art library (ADR-0002).
    const caption = stage.spriteOf(textPlate(section.label, PLATE_INK));
    caption.position.set(section.labelX, section.labelY);
    stage.root.addChild(caption);
  }

  stage.render();

  return {
    report: layout,
    zooms: layout.sections.map((section) => section.zoom),
    samples: (points) => samplesOf(stage, points),
    probe: frameReport(stage),
  };
}


