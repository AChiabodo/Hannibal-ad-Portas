import { expect, test } from './fixtures';
import { cataloguePlate } from '../src/art/catalogue';
import { pixelAt, type PixelBuffer } from '../src/art/pixel-buffer';
import { ATELIER_ZOOMS, atelierLayout } from '../src/render/atelier-layout';
import { atelierReport, samples } from './hooks';

/**
 * The Atelier, against the generator (ticket B2).
 *
 * The page's whole job is to show the catalogue without lying about it, so the
 * test does not settle for "the canvas exists": it generates the plate in Node,
 * reads the page's own geometry back off the debug hooks, and then checks that
 * every column of the page is the plate magnified by exactly its zoom — and that
 * inside one magnified pixel every screen pixel is the same colour, which is what
 * "no smoothing at any zoom level" means once it reaches a screen.
 */

/** The plate the page is showing, computed in Node. */
const PLATE: PixelBuffer = cataloguePlate();

/** The page's own layout, computed in Node from the same inputs. */
const LAYOUT = atelierLayout(PLATE, ATELIER_ZOOMS);

/**
 * How far apart the lattice of plate pixels this page is checked against stands.
 *
 * Every fifth pixel and no sparser: the plate is the whole catalogue and the
 * figures section is the tallest of it, so the test is tens of thousands of
 * comparisons at every zoom and wants a longer bound than the default. C4 added
 * the Carthaginian roster, which made the plate taller and this test slower; the
 * bound below is what keeps it honest rather than the sampling.
 */
const SAMPLE_STEP = 5;



test('renders the whole catalogue on one page, at several zoom levels', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/atelier.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const report = await atelierReport(page);
  expect(report).toEqual(LAYOUT);
  expect(report.sections.map((section) => section.zoom)).toEqual([1, 2, 4]);

  await expect(page.locator('#app canvas')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('shows every column as the catalogue plate magnified by exactly its zoom', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/atelier.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const report = await atelierReport(page);

  for (const section of report.sections) {
    const points: [number, number][] = [];
    const expected: [number, number][] = [];

    for (let y = 0; y < PLATE.height; y += SAMPLE_STEP) {
      for (let x = 0; x < PLATE.width; x += SAMPLE_STEP) {
        points.push([section.x + x * section.zoom, section.y + y * section.zoom]);
        expected.push([x, y]);
      }
    }

    const drawn = await samples(page, 'atelier', points);
    for (let index = 0; index < points.length; index += 1) {
      const [plateX, plateY] = expected[index] ?? [0, 0];
      expect(drawn[index], `zoom ${String(section.zoom)}: plate (${String(plateX)}, ${String(plateY)})`).toEqual(
        pixelAt(PLATE, plateX, plateY),
      );
    }
  }
});

test('magnifies a pixel into a whole square of the same colour, at 2× and 4×', async ({ page }) => {
  await page.goto('/atelier.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const report = await atelierReport(page);

  for (const section of report.sections.filter((candidate) => candidate.zoom > 1)) {
    for (const [plateX, plateY] of [
      [0, 0],
      [3, 9],
      [50, 120],
      [PLATE.width - 1, PLATE.height - 1],
    ] as const) {
      const points: [number, number][] = [];
      for (let dy = 0; dy < section.zoom; dy += 1) {
        for (let dx = 0; dx < section.zoom; dx += 1) {
          points.push([section.x + plateX * section.zoom + dx, section.y + plateY * section.zoom + dy]);
        }
      }

      const drawn = await samples(page, 'atelier', points);
      const wanted = pixelAt(PLATE, plateX, plateY);
      // Every screen pixel of the magnified one, at its centre and every corner:
      // a linear filter would put a different colour at the edges.
      expect(drawn, `zoom ${String(section.zoom)}: plate (${String(plateX)}, ${String(plateY)})`).toEqual(
        points.map(() => wanted),
      );
    }
  }
});
