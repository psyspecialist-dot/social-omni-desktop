const platforms = ['Instagram', 'Facebook', 'TikTok', 'WhatsApp'];
const statuses = ['Draft', 'Scheduled', 'Ready for review', 'Paused', 'Sent', 'Failed'];
const defaults = () => ({
  theme: 'light', keywords: '', delayMin: 3, delayMax: 5,
  phoneNumbers: '', messageContent: '', mediaId: null, accountId: null, licenseKey: '',
});
const bad = message => Object.assign(new Error(message), { status: 400 });
const text = (value, name, max = 1000) => {
  if (typeof value !== 'string' || value.length > max) throw bad(`${name} must be text of at most ${max} characters.`);
  return value.trim();
};
const oneOf = (value, options, name) => {
  if (!options.includes(value)) throw bad(`Invalid ${name}.`);
  return value;
};
const optionalId = (value, name) => value == null || value === '' ? null : text(value, name, 100);
const groupCount = value => {
  const count = Number(value ?? 50);
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw bad('Target group count must be a whole number from 1 to 1000.');
  return count;
};
const campaignInput = body => {
  const title = text(body.title, 'Title');
  if (!title) throw bad('A campaign title is required.');
  const status = oneOf(body.status, statuses, 'campaign status');
  const scheduledAt = text(body.scheduledAt, 'Scheduled time', 100);
  if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) throw bad('Choose a valid planned time.');
  if (status === 'Scheduled' && !scheduledAt) throw bad('Choose a planned time for a scheduled campaign.');
  return {
    title, status, scheduledAt, platform: oneOf(body.platform, platforms, 'platform'),
    caption: text(body.caption, 'Caption'), keywords: text(body.keywords ?? '', 'Target keywords'),
    targetGroupCount: groupCount(body.targetGroupCount),
    mediaId: optionalId(body.mediaId, 'Media ID'), accountId: optionalId(body.accountId, 'Account ID'),
  };
};
const accountInput = body => {
  const displayLabel = text(body.displayLabel, 'Account name');
  if (!displayLabel) throw bad('An account name is required.');
  const demoSession = text(body.demoSession ?? '', 'Demo session reference', 200);
  if (demoSession && !/^demo-[a-z0-9_-]{1,190}$/i.test(demoSession)) throw bad('Use a fake reference starting with demo-. Never enter a real cookie or session key.');
  return {
    displayLabel, demoSession, platform: oneOf(body.platform, platforms, 'platform'),
    handle: text(body.handle, 'Phone or username'),
    status: oneOf(body.status, ['Active (simulated)', 'Paused (simulated)', 'Active label', 'Paused label'], 'simulated account status'),
  };
};
const contactInput = body => {
  const name = text(body.name, 'Name'), value = text(body.value, 'Contact value');
  if (!name || !value) throw bad('Name and contact value are required.');
  const channel = oneOf(body.channel, ['Email', 'Phone'], 'channel');
  if (channel === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw bad('Enter a valid email address.');
  if (channel === 'Phone' && !/^\+?[\d\s().-]{7,30}$/.test(value)) throw bad('Enter a valid phone number.');
  if (typeof body.optedIn !== 'boolean') throw bad('Consent indicator must be a boolean.');
  return { name, value, channel, optedIn: body.optedIn, list: text(body.list, 'List') || 'Unlisted' };
};
const parsePhones = value => {
  const source = text(value, 'Target phone numbers', 10000);
  const numbers = [...new Set(source.split(/[,\n\r]+/).map(p => p.trim()).filter(Boolean).map(p => {
    const normalized = p.replace(/[\s().-]/g, '');
    if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) throw bad(`Invalid phone number: ${p}. Use international numbers, separated by commas or new lines.`);
    return `+${normalized.replace(/^\+/, '')}`;
  }))];
  if (numbers.length > 200) throw bad('A rehearsal supports up to 200 unique phone numbers.');
  return numbers;
};
module.exports = { platforms, statuses, defaults, bad, text, oneOf, optionalId, campaignInput, accountInput, contactInput, parsePhones };
