/**
 * Central injectable clock for controllable testing.
 *
 * SAFETY INVARIANT:
 * Mocking time is STRICTLY FORBIDDEN unless NODE_ENV === 'test'.
 * In production or development, calling setSystemTime() will immediately throw.
 */

let mockedTimestamp = null;

function now() {
  if (process.env.NODE_ENV === 'test' && mockedTimestamp !== null) {
    return new Date(mockedTimestamp);
  }
  return new Date();
}

function nowIso() {
  return now().toISOString();
}

function setSystemTime(target) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('[SECURITY ERROR] setSystemTime() dilarang keras di luar lingkungan NODE_ENV=test!');
  }
  if (!target) {
    mockedTimestamp = null;
    return;
  }
  const d = typeof target === 'string' || typeof target === 'number' ? new Date(target) : target;
  if (isNaN(d.getTime())) {
    throw new Error(`[CLOCK ERROR] Format waktu tidak valid: ${target}`);
  }
  mockedTimestamp = d.getTime();
}

function resetSystemTime() {
  mockedTimestamp = null;
}

function getSystemTime() {
  return now();
}

module.exports = {
  now,
  nowIso,
  setSystemTime,
  resetSystemTime,
  getSystemTime,
};
