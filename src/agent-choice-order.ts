import type { AgentType } from './types.ts';

/** Prioritize the preferred agents without changing other choices or selection state. */
export function orderAgentChoices<T extends { value: AgentType }>(choices: readonly T[]): T[] {
  const priority = (agent: AgentType) => (agent === 'aipro' ? 0 : agent === 'claude-code' ? 1 : 2);
  return [...choices].sort((a, b) => priority(a.value) - priority(b.value));
}
