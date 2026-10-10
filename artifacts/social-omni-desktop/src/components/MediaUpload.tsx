import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Film, FileText } from 'lucide-react';
import { apiRequest, type ApiState, type MediaAsset } from '@/lib/api';
import { isDesktop } from '@/lib/persistence';
import { useI18n, type TFn } from '@/i18n';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf'];
const MAX = 5 * 1024 * 1024;
type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;

const toBase64 = (file: File, t: TFn) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(t('The file could not be read.')));
  reader.onload = () => {
    const result = String(reader.result || '');
    const comma = result.indexOf(',');
    resolve(comma >= 0 ? result.slice(comma + 1) : '');
  };
  reader.readAsDataURL(file);
});
const sizeLabel = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`;

export default function MediaUpload({ mediaId, media, perform, onChange, onBusyChange, testId = 'media' }: {
  mediaId: string | null; media: MediaAsset[]; perform: Perform; onChange: (id: string | null) => void; onBusyChange?: (busy: boolean) => void; testId?: string;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const asset = media.find(m => m.id === mediaId) || null;
  const missing = Boolean(mediaId) && !asset;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    if (!mediaId || !asset || asset.mime === 'application/pdf') { setPreview(null); setPreviewError(''); return; }
    if (preview?.id === mediaId) return;
    let cancelled = false;
    setPreviewError('');
    apiRequest('GET', `/media/${mediaId}`).then(data => {
      if (cancelled) return;
      if (data.mediaContent?.dataUrl) setPreview({ id: mediaId, url: data.mediaContent.dataUrl });
      else setPreviewError(t('Preview is not available for this file.'));
    }).catch(e => { if (!cancelled) setPreviewError(e instanceof Error ? e.message : t('Preview failed to load.')); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, asset?.id]);

  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!ALLOWED.includes(file.type)) { setError(t('Use a PNG, JPEG, WebP, GIF, MP4, WebM, or PDF file.')); return; }
    if (file.size > MAX) { setError(t('That file is {size}. The limit is 5 MiB.', { size: sizeLabel(file.size) })); return; }
    setBusy(true);
    try {
      const data = await toBase64(file, t);
      const next = await perform('POST', '/media', { name: file.name, mime: file.type, data });
      const newest = next.media[0];
      if (!newest) throw new Error(t('Upload finished but no media record came back.'));
      onChange(newest.id);
    } catch (e) { setError(e instanceof Error ? e.message : t('Upload failed.')); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const deleteAsset = async () => {
    if (!asset || !window.confirm(t('Permanently delete {name} from workspace storage? Saved drafts must be detached first.', { name: asset.name }))) return;
    setBusy(true); setError('');
    try { await perform('DELETE', `/media/${asset.id}`); onChange(null); }
    catch (e) { setError(e instanceof Error ? e.message : t('Could not delete this attachment.')); }
    finally { setBusy(false); }
  };
  const isVideo = asset?.mime.startsWith('video/');
  const isPdf = asset?.mime === 'application/pdf';
  return <div className="media-upload" data-testid={`${testId}-upload`}>
    {media.length > 0 && <div className="field-group"><label className="field-label" htmlFor={`${testId}-saved`}>{t('Saved attachments')}</label><select id={`${testId}-saved`} className="field-select" style={{ width: '100%' }} value={mediaId ?? ''} disabled={busy} onChange={e => onChange(e.target.value || null)} data-testid={`select-${testId}-saved`}><option value="">{t('No attachment')}</option>{media.map(m => <option key={m.id} value={m.id}>{m.name} · {sizeLabel(m.size)}</option>)}</select></div>}
    <input ref={input} type="file" hidden accept={ALLOWED.join(',')} onChange={e => { void pick(e.target.files?.[0]); }} data-testid={`input-${testId}-file`} />
    {asset ? <div className="media-card">
      <div className="media-thumb">{preview?.id === asset.id
        ? (isVideo ? <video src={preview.url} controls muted preload="metadata" /> : <img src={preview.url} alt={t('Preview of {name}', { name: asset.name })} />)
         : (isPdf ? <FileText /> : isVideo ? <Film /> : <ImagePlus />)}</div>
      <div className="media-meta"><b title={asset.name}>{asset.name}</b><span>{asset.mime} · {sizeLabel(asset.size)}</span>
        {!isPdf && !preview && !previewError && <span>{t('Loading preview…')}</span>}
        {previewError && <span className="media-err" role="alert">{previewError}</span>}</div>
      <div className="media-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => input.current?.click()} data-testid={`button-${testId}-replace`}>{t('Replace')}</button>
        <button type="button" className="small-icon" disabled={busy} aria-label={t('Remove attachment from draft')} onClick={() => onChange(null)} data-testid={`button-${testId}-remove`}><Trash2 /></button>
        <button type="button" className="small-icon" disabled={busy} title={t('Delete unused file from SQLite storage')} aria-label={t('Delete unused file from storage')} onClick={() => { void deleteAsset(); }} data-testid={`button-${testId}-delete`}><Trash2 /></button>
      </div>
    </div> : <button type="button" className="media-drop" disabled={busy} onClick={() => input.current?.click()} data-testid={`button-${testId}-choose`}>
       <ImagePlus /><b>{busy ? t('Uploading…') : t('Attach image, video or PDF')}</b><span>{t('PNG, JPEG, WebP, GIF, MP4, WebM, PDF · up to 5 MiB')}</span></button>}
    {missing && <div className="media-err" role="alert">{t('The saved attachment is no longer available. Choose a new file or leave it empty.')}</div>}
    {error && <div className="media-err" role="alert" data-testid={`error-${testId}`}>{error}</div>}
     <div className="media-note">{isDesktop ? t('Saved in local SQLite. Approved live WhatsApp campaigns can send this attachment.') : t('Saved on the preview server. Live attachment sending requires the desktop app.')}</div>
  </div>;
}
