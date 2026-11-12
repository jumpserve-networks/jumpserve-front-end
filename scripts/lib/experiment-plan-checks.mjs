// Bounded, exposed content expectations for prompt development. These checks do
// not establish scientific correctness and are never sent to the planning model.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && [...value].length <= max;
const only = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const ref = value => typeof value === 'string' && /^(access|experiment|data|validate)-[1-8]$/.test(value);
const refs = value => Array.isArray(value) && value.length <= 32 && value.every(ref) && new Set(value).size === value.length;
const lower = value => String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();

export function validatePlanExpectations(value) {
  const fail = () => { throw new Error('Invalid bounded experiment-plan expectations.'); };
  if (!object(value) || !Object.keys(value).length || !only(value, ['experiment_count', 'minimum_steps', 'required_source_refs', 'details', 'forbidden'])) fail();
  if (value.experiment_count !== undefined && (!Number.isSafeInteger(value.experiment_count) || value.experiment_count < 0 || value.experiment_count > 8)) fail();
  if (value.minimum_steps !== undefined && (!Number.isSafeInteger(value.minimum_steps) || value.minimum_steps < 0 || value.minimum_steps > 96)) fail();
  if (value.required_source_refs !== undefined && !refs(value.required_source_refs)) fail();
  if (value.forbidden !== undefined && (!Array.isArray(value.forbidden) || value.forbidden.length > 40 || !value.forbidden.every(term => text(term, 200)))) fail();
  if (value.details !== undefined && (!Array.isArray(value.details) || value.details.length > 40 || !value.details.every(detail =>
    object(detail) && only(detail, ['name', 'scope', 'basis', 'source_refs', 'mentions']) && text(detail.name, 120) &&
    ['step', 'plan', 'open_questions'].includes(detail.scope ?? 'step') &&
    (detail.basis === undefined || ['paper', 'proposed'].includes(detail.basis)) &&
    (detail.source_refs === undefined || refs(detail.source_refs)) &&
    ((detail.basis === undefined && detail.source_refs === undefined) || (detail.scope ?? 'step') === 'step') &&
    Array.isArray(detail.mentions) && detail.mentions.length > 0 && detail.mentions.length <= 20 &&
    detail.mentions.every(group => Array.isArray(group) && group.length > 0 && group.length <= 10 && group.every(term => text(term, 160)))
  ))) fail();
  return value;
}

export function planQualityChecks(plan, expectations) {
  if (expectations === undefined) return [];
  validatePlanExpectations(expectations);
  const steps = plan.experiments.flatMap(experiment => experiment.steps);
  const questions = plan.experiments.flatMap(experiment => experiment.open_questions);
  const narrative = lower(plan.experiments.map(experiment => [experiment.title, ...experiment.steps.map(step => `${step.title} ${step.instructions}`), ...experiment.open_questions]).flat().join(' '));
  const checks = [], add = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  if (expectations.experiment_count !== undefined) add('coherent experiment count', plan.experiments.length === expectations.experiment_count);
  if (expectations.minimum_steps !== undefined) add('implementation steps retained', steps.length >= expectations.minimum_steps);
  if (expectations.required_source_refs) {
    const used = new Set(steps.flatMap(step => step.source_refs));
    for (const source of expectations.required_source_refs) add(`source coverage: ${source}`, used.has(source));
  }
  for (const detail of expectations.details ?? []) {
    const matches = candidate => detail.mentions.every(group => group.some(term => lower(candidate).includes(lower(term))));
    const scope = detail.scope ?? 'step';
    const passed = scope === 'plan' ? matches(narrative) : scope === 'open_questions' ? questions.some(matches) : steps.some(step =>
      (!detail.basis || step.basis === detail.basis) && (detail.source_refs ?? []).every(source => step.source_refs.includes(source)) && matches(`${step.title} ${step.instructions}`));
    add(detail.name, passed);
  }
  for (const term of expectations.forbidden ?? []) add(`forbidden assertion absent: ${term}`, !narrative.includes(lower(term)));
  return checks;
}
