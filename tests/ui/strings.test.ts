/**
 * The string table (ticket B7, PLAN §2.4).
 *
 * Two things are worth asserting here. The first is that the table is *complete
 * and coherent*: every key has Italian, every translated key carries the same
 * placeholders in both languages, and a substitution with a value missing is
 * refused rather than printed with a hole in it. The second is the ticket's own
 * acceptance criterion — that no player-facing string is hard-coded — and that
 * one is asserted against the source rather than against the table, because a
 * literal typed into a HUD module is exactly what the criterion forbids.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  STRING_KEYS,
  STRINGS,
  message,
  placeholders,
  translate,
  translateIn,
  type StringTable,
} from '../../src/ui/strings.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** The interface modules whose text must come from the table. */
const INTERFACE_DIRECTORIES = ['src/ui', 'src/render'];

describe('the string table', () => {
  it('holds a key for every player-facing word the interface needs', () => {
    expect(STRING_KEYS.length).toBeGreaterThan(30);

    // The Italian words the GLOSSARY fixes for the interface. A missing one is a
    // screen that says the wrong thing about the game, which is worse than a
    // screen that says nothing.
    const italian = STRING_KEYS.map((key) => translate(key));
    for (const word of ['Anno', 'Stagione', 'Tesoreria', 'Soldo', 'Insediamento', 'Reparto', 'Roccaforte']) {
      expect(italian, `the table has no ${word}`).toContain(word);
    }
  });

  it('gives every key Italian text, and never an empty one', () => {
    for (const key of STRING_KEYS) {
      const translation = STRINGS[key];

      expect(translation.it, key).toBeTypeOf('string');
      expect(translation.it.trim(), key).not.toBe('');
      expect(translation.it, `${key} must be valid Unicode`).not.toContain('\uFFFD');
      for (const locale of LOCALES) {
        const text = translation[locale];
        if (text === undefined) continue;
        expect(text.trim(), `${key} in ${locale}`).not.toBe('');
      }
    }
  });

  it('keeps the placeholders of a key identical in every language', () => {
    for (const key of STRING_KEYS) {
      const italian = placeholders(STRINGS[key].it);
      for (const locale of LOCALES) {
        const text = STRINGS[key][locale];
        if (text === undefined) continue;

        expect([...placeholders(text)].sort(), `${key} in ${locale}`).toEqual([...italian].sort());
      }
    }
  });

  it('reads Italian by default, and English when asked', () => {
    expect(DEFAULT_LOCALE).toBe('it');
    expect(translate('ui.treasury')).toBe('Tesoreria');
    expect(translate('ui.treasury', 'en')).toBe('Treasury');
  });

  it('falls back to Italian when a language has no string for a key', () => {
    // The English fallback path is the mechanism, not the habit: a key that has
    // been added in Italian and not yet translated still reads, in Italian,
    // rather than as its own name or as a hole.
    const table: StringTable = { 'test.only': { it: 'Solo italiano' } };

    expect(translateIn(table, 'test.only', 'en')).toBe('Solo italiano');
    expect(translateIn(table, 'test.only', 'it')).toBe('Solo italiano');
  });

  it('refuses a key it has no Italian for', () => {
    const table: StringTable = { 'test.english': { en: 'English only' } };

    expect(() => translateIn(table, 'test.english', 'en')).toThrow(/test\.english/);
  });

  it('substitutes named values, and refuses to print a placeholder with no value', () => {
    expect(message('ui.listItem', { name: 'Roccaforte', id: 1 })).toBe('Roccaforte 1');
    expect(message('ui.bootFailed', { message: 'niente WebGL' })).toBe('Avvio fallito: niente WebGL');

    expect(() => message('ui.listItem', { name: 'Roccaforte' })).toThrow(/id/);
  });

  it('extracts the placeholders of a string', () => {
    expect(placeholders('Avvio fallito: {message}')).toEqual(['message']);
    expect(placeholders('{a} e {b}')).toEqual(['a', 'b']);
    expect(placeholders('senza segnaposto')).toEqual([]);
  });
});

describe('the interface draws no literal text', () => {
  it('takes every string the font draws from the table', () => {
    const offenders: string[] = [];

    for (const directory of INTERFACE_DIRECTORIES) {
      for (const file of sourceFilesUnder(resolve(REPO_ROOT, directory))) {
        const relative = file.slice(REPO_ROOT.length + 1).split('\\').join('/');
        if (relative === 'src/ui/strings.ts') continue;

        for (const literal of literalTextArguments(file)) {
          offenders.push(`${relative}:${String(literal.line)}: ${JSON.stringify(literal.text)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the page title in the table as well as in the markup', () => {
    const html = readFileSync(resolve(REPO_ROOT, 'index.html'), 'utf8');
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';

    expect(title).toBe(translate('ui.title'));
  });
});

/** Every TypeScript source file under a directory, sorted. */
function sourceFilesUnder(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFilesUnder(path));
    else if (entry.isFile() && path.endsWith('.ts')) files.push(path);
  }

  return files.sort();
}

/**
 * Every `drawText`/`textPlate` call in a file whose text argument is a string
 * literal: the one shape a hard-coded player-facing string takes.
 */
function literalTextArguments(file: string): { readonly line: number; readonly text: string }[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
  const found: { line: number; text: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && DRAWING.has(node.expression.text)) {
      const [text] = node.arguments;
      if (text !== undefined && ts.isStringLiteral(text)) {
        found.push({ line: source.getLineAndCharacterOfPosition(text.getStart(source)).line + 1, text: text.text });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

/** The functions that put glyphs on a buffer. */
const DRAWING = new Set(['drawText', 'textPlate']);
