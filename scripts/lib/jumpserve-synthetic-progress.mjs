const steps = {
  generating: { label: 'Generating', role: 'generator' },
  verifying: { label: 'Verifying', role: 'verifier' },
};

// Bundled workflows carry a checksum. Label them with the matching published revision.
const publishedVersions = {
  generator: {
    '382359be3de8ab459ec601d7cfdef1cef2c797d8e2c7521eba479d9725ae524a': 1,
    '173ce0faf0b4206e53c15750217c88a33d9e85a9091945483672698e90162938': 2,
    'c64477caf8d2f36e0a65ff7c445b8f146d01f128ab96672473d47cdd34a53f16': 3,
    'cf0d9cdc0d1f55ce1c852559aa518606b1579180bd2e50bf6aa85424333c940c': 4,
  },
  verifier: {
    '8c41fd9eeaa0425bd7d88bfb25c3dc516bc775f4555407e497ec5aa1a862231c': 1,
  },
};
const spinnerFrames = ['|', '/', '-', '\\'];

function formatElapsed(milliseconds) {
  const elapsedSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const secondsText = `${seconds} second${seconds === 1 ? '' : 's'}`;
  return minutes ? `${minutes} minute${minutes === 1 ? '' : 's'} ${secondsText}` : secondsText;
}

export function createBatchProgressReporter(guidance, output = process.stdout, now = () => performance.now()) {
  let currentPaper;
  let activeStep;
  let spinner;

  function clearSpinnerLine() {
    output.clearLine(0);
    output.cursorTo(0);
  }

  function finish() {
    if (!activeStep) return;
    if (spinner !== undefined) {
      clearInterval(spinner);
      spinner = undefined;
      clearSpinnerLine();
    }
    output.write(`${activeStep.label}: ${formatElapsed(now() - activeStep.startedAt)}\n`);
    activeStep = undefined;
  }

  function update(paperId, phase, filename, assessmentId) {
    finish();
    if (paperId !== currentPaper) {
      currentPaper = paperId;
      output.write(`\nAssessment ID: ${assessmentId}\nFile Name: ${filename}\n`);
    }

    const step = steps[phase];
    if (!step) {
      output.write(`${phase[0].toUpperCase()}${phase.slice(1)}\n`);
      return;
    }

    const pinned = guidance[step.role];
    const version = pinned.source === 'supabase' ? pinned.version_number : publishedVersions[step.role][pinned.sha256];
    const label = `${step.label} (${version ? `v${version}` : 'bundled'})`;
    activeStep = { label, startedAt: now() };
    if (output.isTTY) {
      let frame = 0;
      const draw = () => {
        clearSpinnerLine();
        output.write(`${label}: ${spinnerFrames[frame]}`);
        frame = (frame + 1) % spinnerFrames.length;
      };
      draw();
      spinner = setInterval(draw, 100);
    }
  }

  return { update, finish };
}
