import type { Store } from './workspace';
import type { WaSuite, AdvancedSuite } from '@workspace/api-client-react';

export interface SimulationSettings {
  theme: 'light' | 'dark';
  keywords: string;
  delayMin: number;
  delayMax: number;
  phoneNumbers: string;
  messageContent: string;
  mediaId: string | null;
  accountId: string | null;
  licenseKey: string;
  language?: 'en' | 'ar';
}
export interface MediaAsset { id: string; name: string; mime: string; size: number }
export interface SimulationTarget {
  id: string; name: string;
  joinStatus: 'Pending' | 'Joined' | 'Requested' | 'Needs review';
  postStatus: 'Pending' | 'Posted' | 'Not posted' | 'Unconfirmed';
  sendStatus: 'Pending' | 'Sent' | 'Unconfirmed' | 'Failed';
  error?: string;
}
export interface SimulationJob {
  mode?: 'live';
  platform?: 'WhatsApp' | 'Facebook' | 'Maps';
  accountId?: string | null;
  action?: string;
  discoveredGroups?: { name: string; url: string }[];
  id: string;
  kind: 'campaign' | 'whatsapp' | 'leads';
  campaignId: string | null;
  status: 'Pending' | 'Running' | 'Completed' | 'Cancelled' | 'Failed';
  progress: number;
  currentStep: number;
  steps: string[];
  createdAt: string;
  targets?: SimulationTarget[];
  completedCount?: number;
  totalCount?: number;
  nextActionAt?: string | null;
  phase?: string;
  error?: string;
  accountName?: string;
  mediaName?: string | null;
  mediaId?: string | null;
  replyToExistingUnread?: boolean;
  messageContent?: string;
}
export interface Lead {
  id: string; businessName: string; phoneNumber: string; address: string; website: string;
  keyword: string; city: string; jobId: string; createdAt: string; simulated: boolean;
}
export interface LeadWorkspace { keyword: string; city: string; targetCount: number; results: Lead[] }
export interface SimulationAnalytics { messagesSent: number; realMessagesSent?: number }
export interface LicenseStatus {
  native: boolean; configured: boolean;
  status: 'active' | 'disabled' | 'not_activated' | 'invalid' | 'unconfigured' | 'desktop_only';
  mode?: 'online' | 'offline'; enabled?: boolean;
  machineId: string | null; licenseId: string | null; maxDevices: number | null; devicesUsed: number | null;
  kind: 'standard' | 'reseller' | null; supportPlan: 'none' | 'monthly' | 'yearly' | null;
  supportUntil: string | null; supportActive: boolean; activatedAt: string | null; serverUrl: string; error: string | null;
}
export interface ApiState {
  license?: LicenseStatus;
  waSuite?: WaSuite;
  advanced?: AdvancedSuite;
  automationAvailable?: boolean;
  store: Store;
  settings: SimulationSettings;
  jobs: SimulationJob[];
  initialized: boolean;
  media: MediaAsset[];
  mediaContent?: MediaAsset & { dataUrl: string };
  leads: LeadWorkspace;
  analytics: SimulationAnalytics;
}
const workspaceKey = 'socialomni.workspace.id';
function workspaceId(): string {
  const existing = localStorage.getItem(workspaceKey);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(workspaceKey, id);
  return id;
}
export async function apiRequest(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', route: string, body?: unknown): Promise<ApiState> {
  if (window.socialOmni?.startBrowserJob && method === 'POST' && route === '/browser/jobs') {
    return window.socialOmni.startBrowserJob(body) as Promise<ApiState>;
  }
  if (window.socialOmni) return window.socialOmni.apiRequest(method, route, body) as Promise<ApiState>;
  const response = await fetch(`/api/socialomni${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-socialomni-workspace': workspaceId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Local API request failed (${response.status}).`);
  return result as ApiState;
}
