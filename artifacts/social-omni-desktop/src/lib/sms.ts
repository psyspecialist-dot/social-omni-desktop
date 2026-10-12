const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';
export interface SmsEstimate { encoding: 'GSM-7' | 'UCS-2'; units: number; segments: number; perSegment: number; overLimit: boolean }
export const SMS_MAX_CHARS = 1600;
/** Estimates segments for one rendered body. Estimate only; the carrier decides the final count and price. */
export function estimateSms(body: string): SmsEstimate {
  let gsm = true; let units = 0;
  for (const ch of body) {
    if (GSM_BASIC.includes(ch)) units += 1; else if (GSM_EXT.includes(ch)) units += 2; else { gsm = false; break; }
  }
  if (!gsm) units = body.length; // UTF-16 code units
  const single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  return { encoding: gsm ? 'GSM-7' : 'UCS-2', units, segments, perSegment: segments > 1 ? multi : single, overLimit: body.length > SMS_MAX_CHARS };
}
export const renderSms = (tpl: string, name: string, phone: string) => tpl.replace(/\{\{(name|phone)\}\}/g, (_match, key: 'name' | 'phone') => key === 'name' ? name : phone);
export const SMS_TEST_BODY = 'Hello {{name}}, this is your approved Social Najhin SMS test for {{phone}}.';
export const isE164ish = (v: string) => /^\+[1-9]\d{7,14}$/.test(v.trim().replace(/[\s().-]/g, ''));
/** Maps a Twilio status to an English label key (translated by callers). */
export function smsStatusLabel(s?: string): string {
  const k = (s || '').toLowerCase();
  if (['queued', 'accepted', 'scheduled', 'sending'].includes(k)) return 'Accepted/queued — not delivered';
  if (k === 'sent') return 'Sent to carrier';
  if (k === 'delivered') return 'Delivered (carrier-reported, not read)';
  if (k === 'failed') return 'Failed';
  if (k === 'undelivered') return 'Undelivered';
  if (k === 'canceled' || k === 'cancelled') return 'Cancelled';
  return s ? 'Unconfirmed' : '';
}
