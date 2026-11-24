export const SKILL_ROLES = ["generator", "verifier", "coach"] as const;
export type SkillRole = typeof SKILL_ROLES[number];

export type PublishedSkillInstructions = {
  role: SkillRole;
  version_id: string;
  sha256: string;
  instructions: string;
};

export function isSkillRole(role: unknown): role is SkillRole {
  return SKILL_ROLES.some(value => value === role);
}
