// Purely local simulation. This module never contacts any platform.
module.exports = function createWorker({ get, save, recordActivity }) {
  const timers = new Map();
  const runnable = state => state.jobs.filter(j => ['Pending', 'Running'].includes(j.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const wait = job => {
    const seconds = job.delayMin + Math.floor(Math.random() * (job.delayMax - job.delayMin + 1));
    job.phase = 'Waiting';
    job.nextActionAt = new Date(Date.now() + seconds * 1000).toISOString();
    return seconds;
  };
  function kick(id) {
    if (timers.has(id)) clearTimeout(timers.get(id));
    timers.delete(id);
    const job = runnable(get(id))[0];
    if (!job) return;
    const timeout = job.status === 'Pending' ? 100 : Math.max(0, Date.parse(job.nextActionAt || '') - Date.now()) || 0;
    timers.set(id, setTimeout(() => tick(id, job.id), timeout));
  }
  function tick(id, jobId) {
    timers.delete(id);
    try {
      const state = get(id), job = state.jobs.find(j => j.id === jobId);
      if (!job || !['Pending', 'Running'].includes(job.status)) { kick(id); return; }
      if (job.status === 'Pending') {
        job.status = 'Running';
        recordActivity(state, `Started ${job.kind} rehearsal using ${job.accountName}; ${job.totalCount} simulated targets.`);
        if (job.mediaName) {
          recordActivity(state, `Simulated uploading “${job.mediaName}” from the saved SQLite attachment. No external upload occurred.`);
          const seconds = wait(job);
          recordActivity(state, `Waiting ${seconds}s before the first simulated action.`);
          save(id, state);
          kick(id);
          return;
        }
      }
      const target = job.targets.find(t => job.kind === 'whatsapp' ? t.sendStatus === 'Pending' : t.postStatus === 'Pending');
      if (!target) throw new Error('Simulation queue has no pending target.');
      if (job.kind === 'whatsapp') {
        target.sendStatus = 'Sent';
        job.completedCount++;
        recordActivity(state, `Simulated message sent to ${target.name} (${job.completedCount}/${job.totalCount}). No message was actually sent.`);
      } else if (target.joinStatus === 'Pending') {
        target.joinStatus = 'Joined';
        recordActivity(state, `Simulated joining “${target.name}”. This is a hypothetical group, not a discovered group.`);
      } else {
        target.postStatus = 'Posted';
        job.completedCount++;
        recordActivity(state, `Simulated posting to “${target.name}” (${job.completedCount}/${job.totalCount}). No external post occurred.`);
      }
      job.currentStep++;
      job.progress = Math.round(job.currentStep / (job.totalCount * (job.kind === 'whatsapp' ? 1 : 2)) * 100);
      if (job.completedCount === job.totalCount) {
        job.status = 'Completed';
        job.phase = 'Completed';
        job.nextActionAt = null;
        recordActivity(state, `Rehearsal completed: ${job.completedCount}/${job.totalCount} simulated ${job.kind === 'whatsapp' ? 'messages' : 'posts'}.`, 'success');
        const campaign = state.store.campaigns.find(c => c.id === job.campaignId);
        if (campaign && campaign.status !== 'Paused') {
          campaign.status = 'Ready for review';
          campaign.updatedAt = new Date().toISOString();
        }
      } else {
        const seconds = wait(job);
        recordActivity(state, `Waiting ${seconds}s before the next simulated action.`);
      }
      save(id, state);
      kick(id);
    } catch (error) {
      try {
        const state = get(id), job = state.jobs.find(j => j.id === jobId);
        if (job) { job.status = 'Failed'; job.phase = 'Failed'; job.nextActionAt = null; }
        recordActivity(state, 'Rehearsal stopped after a worker error. Saved queue results are retained.', 'warning');
        save(id, state);
        kick(id);
      } catch {
        process.emitWarning('SocialOmni simulation stopped: local SQLite is unavailable. Reopen the application to recover.');
      }
    }
  }
  return { kick, close: () => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } };
};
