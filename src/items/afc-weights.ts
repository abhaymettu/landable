// Agent Friendly Code signal weights per agent, lib/scoring/weights.ts at commit 8d59f22 (MIT).
export const AFC_AGENTS = ["claude-code","cursor","devin","gpt-5-codex","kimi-cli","gemini-cli","aider","openhands","pi"] as const;
export type AfcAgent = (typeof AFC_AGENTS)[number];

export const AFC_WEIGHTS: Readonly<Record<string, Readonly<Record<AfcAgent, number>>>> = {
  "agents_md": {"claude-code": 1, cursor: 0.8, devin: 0.6, "gpt-5-codex": 0.9, "kimi-cli": 1, "gemini-cli": 0.7, aider: 0.3, openhands: 0.5, pi: 1},
  "cursor_rules": {"claude-code": 0, cursor: 1, devin: 0.3, "gpt-5-codex": 0, "kimi-cli": 0, "gemini-cli": 0, aider: 0, openhands: 0, pi: 0},
  "gemini_md": {"claude-code": 0, cursor: 0, devin: 0, "gpt-5-codex": 0, "kimi-cli": 0, "gemini-cli": 1, aider: 0, openhands: 0, pi: 0},
  "openhands_setup": {"claude-code": 0, cursor: 0, devin: 0, "gpt-5-codex": 0, "kimi-cli": 0, "gemini-cli": 0, aider: 0, openhands: 1, pi: 0},
  "aider_conf": {"claude-code": 0, cursor: 0, devin: 0, "gpt-5-codex": 0, "kimi-cli": 0, "gemini-cli": 0, aider: 1, openhands: 0, pi: 0},
  "agent_skills": {"claude-code": 0, cursor: 0.4, devin: 0.4, "gpt-5-codex": 0.4, "kimi-cli": 0.4, "gemini-cli": 0.4, aider: 0, openhands: 0.4, pi: 0.4},
  "readme": {"claude-code": 0.7, cursor: 1, devin: 0.7, "gpt-5-codex": 0.8, "kimi-cli": 0.7, "gemini-cli": 0.9, aider: 0.6, openhands: 0.7, pi: 0.7},
  "tests": {"claude-code": 1, cursor: 0.7, devin: 0.9, "gpt-5-codex": 0.8, "kimi-cli": 0.9, "gemini-cli": 0.9, aider: 1, openhands: 0.9, pi: 0.9},
  "ci": {"claude-code": 0.5, cursor: 0.4, devin: 0.7, "gpt-5-codex": 0.7, "kimi-cli": 0.4, "gemini-cli": 0.6, aider: 0.3, openhands: 1, pi: 0.4},
  "linter": {"claude-code": 0.6, cursor: 0.8, devin: 0.5, "gpt-5-codex": 0.6, "kimi-cli": 0.6, "gemini-cli": 0.7, aider: 1, openhands: 0.6, pi: 0.8},
  "deps_manifest": {"claude-code": 0.7, cursor: 0.8, devin: 0.9, "gpt-5-codex": 0.7, "kimi-cli": 0.7, "gemini-cli": 0.8, aider: 0.7, openhands: 1, pi: 0.7},
  "dev_env": {"claude-code": 0.9, cursor: 0.5, devin: 1, "gpt-5-codex": 0.7, "kimi-cli": 0.7, "gemini-cli": 0.7, aider: 0.5, openhands: 1, pi: 0.6},
  "type_config": {"claude-code": 0.6, cursor: 1, devin: 0.5, "gpt-5-codex": 0.7, "kimi-cli": 0.6, "gemini-cli": 0.9, aider: 0.5, openhands: 0.5, pi: 0.6},
  "license": {"claude-code": 0.3, cursor: 0.3, devin: 0.3, "gpt-5-codex": 0.3, "kimi-cli": 0.3, "gemini-cli": 0.3, aider: 0.2, openhands: 0.4, pi: 0.2},
  "contributing": {"claude-code": 0.4, cursor: 0.3, devin: 0.5, "gpt-5-codex": 0.4, "kimi-cli": 0.4, "gemini-cli": 0.4, aider: 0.3, openhands: 0.7, pi: 0.3},
  "pre_commit": {"claude-code": 0.4, cursor: 0.3, devin: 0.5, "gpt-5-codex": 0.4, "kimi-cli": 0.4, "gemini-cli": 0.4, aider: 0.3, openhands: 0.6, pi: 0.4},
  "size": {"claude-code": 0.5, cursor: 0.4, devin: 0.6, "gpt-5-codex": 0.5, "kimi-cli": 0.4, "gemini-cli": 0.5, aider: 0.4, openhands: 0.7, pi: 0.5},
};
