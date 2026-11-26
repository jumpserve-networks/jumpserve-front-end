import schema from './jumpserve-synthetic-activity-schema.json' with { type: 'json' };

function programName(command) {
  if (typeof command !== 'string') return undefined;
  const shell = /^(?:\/[\w/.-]+\/)?(?:bash|sh|zsh)\s+-(?:lc|c)\s+['"]?\s*/.exec(command);
  const executable = /^(?:\/[\w/.-]+\/)?([\w.-]+)(?=\s|$)/.exec(command.slice(shell?.[0].length ?? 0))?.[1];
  return schema.programs.includes(executable) ? executable : undefined;
}

export function codexActivity(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  switch (event?.type) {
    case 'turn.started': return { kind: 'turn_started' };
    case 'turn.completed': return { kind: 'turn_completed' };
    case 'turn.failed': return { kind: 'turn_failed' };
    case 'item.started':
    case 'item.completed': {
      const complete = event.type === 'item.completed';
      if (complete && event.item?.type === 'file_change') return { kind: 'file_changed' };
      if (event.item?.type !== 'command_execution') return null;
      const program = programName(event.item.command);
      const exit = event.item.exit_code;
      return {
        kind: complete ? 'command_completed' : 'command_started',
        ...(program ? { program } : {}),
        ...(complete && Number.isInteger(exit) && exit >= 0 && exit <= 255 ? { exitCode: exit } : {}),
      };
    }
    default: return null;
  }
}
