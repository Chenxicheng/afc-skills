import { describe, expect, it } from 'vitest';
import { orderAgentChoices } from '../src/agent-choice-order.ts';
import { agents, getNonUniversalAgents } from '../src/agents.ts';
import type { AgentType } from '../src/types.ts';

const choices = (values: AgentType[]) =>
  values.map((value) => ({ value, label: agents[value].displayName }));

describe('agent selection order', () => {
  it('puts aipro first and Claude Code second, preserving all other relative order', () => {
    const input = choices(Object.keys(agents) as AgentType[]);
    const original = [...input];
    const ordered = orderAgentChoices(input);
    expect(ordered.slice(0, 2).map((a) => a.value)).toEqual(['aipro', 'claude-code']);
    expect(ordered.slice(2)).toEqual(
      input.filter((a) => !['aipro', 'claude-code'].includes(a.value))
    );
    expect(input).toEqual(original);
    expect(ordered).not.toBe(input);
  });

  it('prioritizes the selectable non-universal list for project and global installation', () => {
    for (const global of [false, true]) {
      const input = choices(
        getNonUniversalAgents().filter(
          (a) => a !== 'eve' && (!global || !!agents[a].globalSkillsDir)
        )
      );
      expect(
        orderAgentChoices(input)
          .slice(0, 2)
          .map((a) => a.value)
      ).toEqual(['aipro', 'claude-code']);
    }
  });

  it('does not add missing agents, reorder other choices, or lose hints', () => {
    const input = [
      { value: 'cursor' as const, hint: 'one' },
      { value: 'codex' as const, hint: 'two' },
    ];
    expect(orderAgentChoices(input)).toEqual(input);
    expect(orderAgentChoices(choices(['cursor', 'claude-code']))[0]?.value).toBe('claude-code');
    expect(orderAgentChoices(choices(['cursor', 'aipro']))[0]?.value).toBe('aipro');
    expect(orderAgentChoices([])).toEqual([]);
  });
});
