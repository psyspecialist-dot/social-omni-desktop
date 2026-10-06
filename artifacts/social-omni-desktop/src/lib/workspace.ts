import { z } from 'zod';

export const STORAGE_KEY = 'socialomni.renderer.v1';
export const THEME_KEY = 'socialomni.theme';
export const platforms = ['Instagram', 'Facebook', 'TikTok', 'WhatsApp'];
export const statuses = ['Draft', 'Scheduled', 'Ready for review', 'Paused', 'Sent', 'Failed'] as const;
const text = z.string().max(1000);
const campaignSchema = z.object({
  id: text, title: text, platform: text, caption: text, scheduledAt: text,
  status: z.enum(statuses), createdAt: text, updatedAt: text,
  keywords: text.optional(), targetGroupCount: z.number().int().optional(),
  mediaId: text.nullable().optional(), accountId: text.nullable().optional(),
});
const accountSchema = z.object({ id: text, platform: text, displayLabel: text, handle: text, status: text, demoSession: text.optional() });
const contactSchema = z.object({
  id: text, name: text, channel: z.enum(['Email', 'Phone']), value: text,
  optedIn: z.boolean(), createdAt: text, list: text,
});
const activitySchema = z.object({
  id: text, timestamp: text, level: z.enum(['info', 'success', 'warning']), message: text,
});
const storeSchema = z.object({
  campaigns: z.array(campaignSchema), accounts: z.array(accountSchema),
  contacts: z.array(contactSchema), lists: z.array(text), activity: z.array(activitySchema),
});
export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignStatus = Campaign['status'];
export type Account = z.infer<typeof accountSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type ActivityEntry = z.infer<typeof activitySchema>;
export type Store = z.infer<typeof storeSchema>;
export const newId = () => crypto.randomUUID();
export const isoIn = (days: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const yesterday = new Date(Date.now() - 86_400_000).toISOString();
export const seedStore: Store = {
  campaigns: [
    { id: 'example-1', title: 'Example: a look behind the scenes', platform: 'Instagram', caption: 'A short look at the ideas and work behind our next project.', scheduledAt: isoIn(0, 15), status: 'Ready for review', createdAt: yesterday, updatedAt: yesterday },
    { id: 'example-2', title: 'Example: weekly video update', platform: 'TikTok', caption: 'Three things we learned this week. Add your own working notes here.', scheduledAt: isoIn(1, 9), status: 'Scheduled', createdAt: yesterday, updatedAt: yesterday },
    { id: 'example-3', title: 'Example: community announcement', platform: 'Facebook', caption: 'A draft announcement for review before publishing on the official site.', scheduledAt: isoIn(3, 11), status: 'Draft', createdAt: yesterday, updatedAt: yesterday },
  ],
  accounts: [
    { id: 'example-a1', platform: 'Instagram', displayLabel: 'Example studio account', handle: '@yourhandle', status: 'Active label' },
    { id: 'example-a2', platform: 'TikTok', displayLabel: 'Example video account', handle: '@yourhandle', status: 'Active label' },
    { id: 'example-a3', platform: 'WhatsApp', displayLabel: 'Example business label', handle: 'Your business', status: 'Active label' },
  ],
  contacts: [
    { id: 'example-p1', name: 'Example contact', channel: 'Email', value: 'sample@example.com', optedIn: false, createdAt: yesterday, list: 'Example list' },
  ],
  lists: ['Example list'],
  activity: [
    { id: 'example-log', timestamp: new Date().toISOString(), level: 'info', message: 'Example records loaded. Replace them with your own or clear the workspace in Settings.' },
  ],
};
export function parseStore(serialized: string | null): Store {
  if (serialized === null) return seedStore;
  const result = storeSchema.safeParse(JSON.parse(serialized));
  if (!result.success) throw new Error('Saved records have an unexpected format. They have not been changed.');
  return result.data;
}
