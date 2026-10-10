// Dispatch real work only. Historical rehearsals remain records, never executions.
module.exports = function createWorker({ get, save, recordActivity, onLive }) {
  let closed = false;
  function kick(id) {
    if (closed) return;
    const state = get(id);
    const legacy = state.jobs.filter(j => j.mode !== 'live' && ['Pending', 'Running'].includes(j.status));
    for (const job of legacy) {
      job.status = 'Cancelled'; job.phase = 'Simulation disabled'; job.nextActionAt = null;
      job.error = 'Legacy simulation stopped. No platform action occurred.';
    }
    if (legacy.length) {
      recordActivity(state, 'Legacy simulations cancelled. Only real provider workers execute.', 'warning');
      save(id, state);
    }
    onLive?.(id);
  }
  return { kick, close: () => { closed = true; } };
};
