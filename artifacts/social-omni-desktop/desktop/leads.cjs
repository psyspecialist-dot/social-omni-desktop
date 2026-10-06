const { randomUUID } = require('node:crypto');
const { text, bad } = require('./validation.cjs');

const defaults = () => ({ keyword: '', city: '', targetCount: 10, results: [] });
const draft = body => {
  const keyword = text(body.keyword, 'Target niche / keyword', 100);
  const city = text(body.city, 'Target city / location', 150);
  const targetCount = Number(body.targetCount);
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 200) throw bad('Lead count must be a whole number from 1 to 200.');
  return { keyword, city, targetCount };
};
const createJob = state => {
  const config = draft(state.leads);
  if (!config.keyword || !config.city) throw bad('Enter a target niche and city before starting the lead simulation.');
  if (state.leads.results.length + config.targetCount > 2000) throw bad('This workspace supports 2,000 simulated leads. Export and clear existing results first.');
  const id = randomUUID();
  const targets = Array.from({ length: config.targetCount }, (_, i) => {
    const label = String(i + 1).padStart(3, '0');
    const lead = {
      id: randomUUID(), businessName: `Demo ${config.keyword} ${label}`,
      // Reserved fictional NANP range, never a real scraped contact.
      phoneNumber: `+1202555${String(100 + (i % 100)).padStart(4, '0')}`,
      address: `${100 + i} Example Street, ${config.city} (synthetic)`,
      website: `https://business-${label}.example`,
      keyword: config.keyword, city: config.city, jobId: id,
      createdAt: new Date().toISOString(), simulated: true,
    };
    return { id: lead.id, name: lead.businessName, joinStatus: 'Pending', postStatus: 'Pending', sendStatus: 'Pending', lead };
  });
  return {
    id, kind: 'leads', campaignId: null, status: 'Pending', progress: 0, currentStep: 0,
    steps: ['Prepare saved niche and location', 'Generate synthetic businesses', 'Export simulation results'],
    createdAt: new Date().toISOString(), delayMin: 1, delayMax: 1,
    targets, completedCount: 0, totalCount: targets.length, nextActionAt: null,
    phase: 'Queued', accountName: 'Local lead simulator',
  };
};
module.exports = { defaults, draft, createJob };
