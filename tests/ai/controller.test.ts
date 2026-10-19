import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';
import type { Command } from '../../src/sim/command.ts';
import type { Observation } from '../../src/sim/observation.ts';

interface Visible {
  readonly year: number;
  readonly season: string;
}

function look(tick: number, season = 'spring', year = 1): Observation<Visible> {
  return { faction: 'rome', tick, visible: { year, season } };
}

describe('the AI Controller', () => {
  it('can watch with no registered behaviour and explains doing nothing on each clock', () => {
    const ai = createAi<Visible>({ ticksPerSecond: 10 });

    expect(ai.decide(look(0))).toEqual([]);
    expect(ai.readLog()).toEqual(['strategic', 'operational', 'tactical'].map((layer) => ({
      faction: 'rome', tick: 0, year: 1, season: 'spring', layer,
      candidates: [{ behaviour: null, id: 'idle', utility: 0,
        reason: 'Keep the current plan and emit no Commands.', commands: [], contributions: [] }],
      selected: { behaviour: null, id: 'idle', contributions: [] },
    })));
  });

  it('reads Season changes from the Observation and runs the other clocks at 30 seconds and every tick', () => {
    const ai = createAi<Visible>({ ticksPerSecond: 10 });
    for (const tick of [0, 1, 299, 300, 301, 2099]) ai.decide(look(tick));
    ai.decide(look(2100, 'summer'));
    ai.decide(look(2101, 'summer'));
    ai.decide(look(8400, 'spring', 2));

    const ticks = (layer: string) => ai.readLog().filter((entry) => entry.layer === layer).map((entry) => entry.tick);
    expect(ticks('strategic')).toEqual([0, 2100, 8400]);
    expect(ticks('operational')).toEqual([0, 300, 2099, 2100, 8400]);
    expect(ticks('tactical')).toEqual([0, 1, 299, 300, 301, 2099, 2100, 2101, 8400]);
  });

  it('scores alternatives from separate behaviours, resolves ties by id and logs the rejected alternatives', () => {
    const registry = createBehaviourRegistry<Visible, Command>([
      { id: 'military', operational: ({ observation }) => [
        { id: 'reserve', utility: 7, reason: 'Retain a reserve.', commands: [
          { kind: 'hold', faction: observation.faction, squads: [2] },
        ] },
      ] },
      { id: 'economy', operational: ({ observation }) => [
        { id: 'villa', utility: 3, reason: 'A tier can wait.', commands: [] },
        { id: 'granary', utility: 7, reason: 'Protect the next harvest.', commands: [
          { kind: 'build', faction: observation.faction, settlement: 0, building: 'granary' },
        ] },
      ] },
      { id: 'scouting', tactical: () => [
        { id: 'explore', utility: -2, reason: 'Too dangerous.', commands: [] },
      ] },
    ]);
    const ai = createAi({ ticksPerSecond: 10, registry });

    expect(ai.decide(look(0))).toEqual([
      { kind: 'build', faction: 'rome', settlement: 0, building: 'granary' },
    ]);
    const decision = ai.readLog().find((entry) => entry.layer === 'operational');
    expect(decision?.candidates.map(({ behaviour, id, utility }) => [behaviour, id, utility])).toEqual([
      [null, 'idle', 0], ['economy', 'granary', 7], ['economy', 'villa', 3], ['military', 'reserve', 7],
    ]);
    expect(decision?.selected).toEqual({ behaviour: 'economy', id: 'granary',
      contributions: [{ behaviour: 'economy',
        commands: [{ kind: 'build', faction: 'rome', settlement: 0, building: 'granary' }] }] });
    expect(ai.readLog().at(-1)?.selected).toEqual({ behaviour: null, id: 'idle', contributions: [] });
  });

  it('names the behaviour that authored each candidate, and keeps a composed candidate\'s own attribution', () => {
    const attack = { kind: 'attack' as const, faction: 'rome' as const, squads: [1], target: 9 };
    const patrol = { kind: 'move' as const, faction: 'rome' as const, squads: [2], x: 4, y: 4 };
    const registry = createBehaviourRegistry<Visible, Command>([
      { id: 'economy', tactical: () => [
        { id: 'granary', utility: 1, reason: 'Build the granary.',
          commands: [{ kind: 'build', faction: 'rome', settlement: 0, building: 'granary' }] },
      ] },
      { id: 'scouting', tactical: () => [{ id: 'explore', utility: 5, reason: 'Explore with the field.',
        commands: [patrol, attack],
        contributions: [
          { behaviour: 'military', commands: [attack] },
          { behaviour: 'scouting', commands: [patrol] },
        ] }] },
    ]);
    const ai = createAi({ ticksPerSecond: 10, registry });
    ai.decide(look(0));
    const tactical = ai.readLog().find((entry) => entry.layer === 'tactical')!;
    const byId = (id: string) => tactical.candidates.find((candidate) => candidate.id === id)!;
    expect(byId('idle').contributions).toEqual([]);
    expect(byId('granary').contributions).toEqual([
      { behaviour: 'economy', commands: [{ kind: 'build', faction: 'rome', settlement: 0, building: 'granary' }] },
    ]);
    expect(byId('explore').contributions).toEqual([
      { behaviour: 'military', commands: [attack] },
      { behaviour: 'scouting', commands: [patrol] },
    ]);
    expect(tactical.selected).toEqual({ behaviour: 'scouting', id: 'explore',
      contributions: byId('explore').contributions });
  });

  it('carries the selected posture, budget and objective into the faster layers and later ticks', () => {
    const registry = createBehaviourRegistry<Visible, Command>([{
      id: 'military',
      strategic: () => [{
        id: 'defend', utility: 8, reason: 'Winter quarters take priority.', commands: [],
        plan: { posture: 'defensive', budget: { reserve: 100 }, objective: 'home' },
      }],
      operational: ({ observation, plan }) => [{
        id: 'reserve', utility: plan.budget.reserve === 100 ? 5 : -1,
        reason: `Budget for ${plan.objective}.`,
        commands: [{ kind: 'hold', faction: observation.faction, squads: [1] }],
      }],
      tactical: ({ observation, plan }) => [{
        id: 'hold', utility: plan.posture === 'defensive' ? 4 : -1,
        reason: `Follow ${plan.posture} posture.`,
        commands: [{ kind: 'hold', faction: observation.faction, squads: [2] }],
      }],
    }]);
    const ai = createAi({ ticksPerSecond: 10, registry });
    expect(ai.decide(look(0, 'winter'))).toEqual([
      { kind: 'hold', faction: 'rome', squads: [1] },
      { kind: 'hold', faction: 'rome', squads: [2] },
    ]);
    expect(ai.decide(look(1, 'winter'))).toEqual([{ kind: 'hold', faction: 'rome', squads: [2] }]);
    expect(ai.readLog()[0]?.candidates[1]).toMatchObject({
      plan: { posture: 'defensive', budget: { reserve: 100 }, objective: 'home' },
    });
  });

  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('refuses an unreadable utility score %s instead of silently dropping a decision', (utility) => {
    const registry = createBehaviourRegistry<Visible, Command>([{
      id: 'broken', tactical: () => [{ id: 'bad-score', utility, reason: 'A broken score.', commands: [] }],
    }]);
    const ai = createAi({ ticksPerSecond: 10, registry });
    expect(() => ai.decide(look(0))).toThrow(/broken.*bad-score.*utility/);
  });

  it('refuses ambiguous candidate ids within one behaviour on one clock', () => {
    const candidate = { id: 'same', utility: 1, reason: 'A choice.', commands: [] };
    const registry = createBehaviourRegistry<Visible, Command>([{
      id: 'broken', tactical: () => [candidate, candidate],
    }]);
    expect(() => createAi({ ticksPerSecond: 10, registry }).decide(look(0))).toThrow(/broken.*same.*unique/);
  });

  it('keeps one Match and Faction per Controller so clocks and plans cannot leak between Players', () => {
    const ai = createAi<Visible>({ ticksPerSecond: 10 });
    ai.decide(look(0));
    expect(() => ai.decide({ ...look(1), faction: 'carthage' })).toThrow(/fresh.*Controller/);
    expect(() => ai.decide(look(0))).toThrow(/increasing.*tick/);
  });

  it('keeps historical scores and Commands detached from plugins, returned Commands and log readers', () => {
    const candidate = {
      id: 'hold', utility: 4, reason: 'Keep a reserve.',
      commands: [{ kind: 'hold' as const, faction: 'rome' as const, squads: [1] }],
    };
    const registry = createBehaviourRegistry<Visible, Command>([{
      id: 'military', tactical: () => [candidate],
    }]);
    const ai = createAi({ ticksPerSecond: 10, registry });
    const commands = ai.decide(look(0));
    candidate.utility = -99;
    candidate.commands[0]!.squads.push(2);
    const returned = commands[0];
    if (returned?.kind === 'hold') {
      // Deliberately model a JS caller ignoring the readonly type.
      (returned.squads as number[]).push(3);
    }
    const history = ai.readLog();
    (history as unknown[]).pop();
    expect(ai.readLog().at(-1)?.candidates[1]).toEqual({
      behaviour: 'military', id: 'hold', utility: 4, reason: 'Keep a reserve.',
      commands: [{ kind: 'hold', faction: 'rome', squads: [1] }],
      contributions: [{ behaviour: 'military', commands: [{ kind: 'hold', faction: 'rome', squads: [1] }] }],
    });
  });

  it('rejects duplicate registrations instead of merging unrelated modules under one name', () => {
    expect(() => createBehaviourRegistry([{ id: 'economy' }, { id: 'economy' }])).toThrow(/unique.*economy/);
  });
});
