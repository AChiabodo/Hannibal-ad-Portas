import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMMAND_KINDS, validateCommand, type Command, type CommandKind } from '../../src/sim/command';
import { ONE_OF_EACH } from './one-of-each';

/**
 * The vocabulary is documented in one place, for someone writing an external
 * agent (A3), and this is what stops the document and the code from drifting
 * apart. It is the one test in the repository that reads prose: a table and a
 * block of examples are the contract an agent author works from, so they are
 * checked as data rather than trusted.
 */
const DOCUMENT = 'docs/COMMANDS.md';
const PATH = fileURLToPath(new URL('../../docs/COMMANDS.md', import.meta.url));

/** The text between two of the HTML comments the document carries to be read this way. */
function between(start: string, end: string): string {
  const opening = DOCUMENT_TEXT.indexOf(start);
  const closing = DOCUMENT_TEXT.indexOf(end);
  if (opening < 0 || closing < 0 || closing < opening) {
    throw new Error(`${DOCUMENT} is missing the ${start} … ${end} markers`);
  }

  return DOCUMENT_TEXT.slice(opening + start.length, closing);
}

const DOCUMENT_TEXT = readFileSync(PATH, 'utf8');

/** One row of the vocabulary table: a Command kind, and the fields the document gives it. */
interface DocumentedRow {
  readonly kind: string;
  readonly fields: readonly string[];
}

/** The vocabulary table, read as rows: a first cell naming a kind, a second listing its fields. */
function documentedRows(): readonly DocumentedRow[] {
  return between('<!-- vocabulary:start -->', '<!-- vocabulary:end -->')
    .split('\n')
    .filter((line) => line.trim().startsWith('| `'))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim());

      return {
        kind: (cells[1] ?? '').replaceAll('`', ''),
        fields: Array.from(cells[2]?.matchAll(/`([^`]+)`/g) ?? [], (match) => match[1] ?? ''),
      };
    });
}

/** The example block, parsed and read through the vocabulary's own reader. */
function documentedExamples(): readonly { readonly line: string; readonly command: Command }[] {
  return between('<!-- examples:start -->', '<!-- examples:end -->')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return { line, command: validateCommand(JSON.parse(line)) };
      } catch (error) {
        throw new Error(`${DOCUMENT} has an example that is not a Command: ${line}`, { cause: error });
      }
    });
}

describe('the Command documentation', () => {
  it('documents every Command in the vocabulary, in the vocabulary’s order, and nothing else', () => {
    expect(documentedRows().map((row) => row.kind)).toEqual([...COMMAND_KINDS]);
  });

  it('gives every Command the fields the code carries, and no others', () => {
    const example = new Map(ONE_OF_EACH.map((command) => [command.kind, command]));

    for (const row of documentedRows()) {
      const fields = Object.keys(example.get(row.kind as CommandKind) ?? {}).filter(
        (field) => field !== 'kind',
      );

      expect(new Set(row.fields), row.kind).toEqual(new Set(fields));
    }
  });

  it('shows an example for every Command, and every example passes the vocabulary’s reader', () => {
    const examples = documentedExamples();

    expect(examples.map((example) => example.command.kind)).toEqual([...COMMAND_KINDS]);
  });
});
