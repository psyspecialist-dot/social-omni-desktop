import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Film } from 'lucide-react';
import { apiRequest, type ApiState, type MediaAsset } from '@/lib/api';
import { isDesktop } from '@/lib/persistence';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
const MAX = 5 * 1024 * 1024;
type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('The file could not be read.'));
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
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const asset = media.find(m => m.id === mediaId) || null;
  const missing = Boolean(mediaId) && !asset;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    if (!mediaId || !asset) { setPreview(null); setPreviewError(''); return; }
    if (preview?.id === mediaId) return;
    let cancelled = false;
    setPreviewError('');
    apiRequest('GET', `/media/${mediaId}`).then(data => {
      if (cancelled) return;
      if (data.mediaContent?.dataUrl) setPreview({ id: mediaId, url: data.mediaContent.dataUrl });
      else setPreviewError('Preview is not available for this file.');
    }).catch(e => { if (!cancelled) setPreviewError(e instanceof Error ? e.message : 'Preview failed to load.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, asset?.id]);

  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!ALLOWED.includes(file.type)) { setError('Use a PNG, JPEG, WebP, GIF, MP4, or WebM file.'); return; }
    if (file.size > MAX) { setError(`That file is ${sizeLabel(file.size)}. The limit is 5 MiB.`); return; }
    setBusy(true);
    try {
      const data = await toBase64(file);
      const next = await perform('POST', '/media', { name: file.name, mime: file.type, data });
      const newest = next.media[0];
      if (!newest) throw new Error('Upload finished but no media record came back.');
      onChange(newest.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const deleteAsset = async () => {
    if (!asset || !window.confirm(`Permanently delete ${asset.name} from workspace storage? Saved drafts must be detached first.`)) return;
    setBusy(true); setError('');
    try { await perform('DELETE', `/media/${asset.id}`); onChange(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete this attachment.'); }
    finally { setBusy(false); }
  };
  const isVideo = asset?.mime.startsWith('video/');
  return <div className="media-upload" data-testid={`${testId}-upload`}>
    {media.length > 0 && <div className="field-group"><label className="field-label" htmlFor={`${testId}-saved`}>Saved attachments</label><select id={`${testId}-saved`} className="field-select" style={{ width: '100%' }} value={mediaId ?? ''} disabled={busy} onChange={e => onChange(e.target.value || null)} data-testid={`select-${testId}-saved`}><option value="">No attachment</option>{media.map(m => <option key={m.id} value={m.id}>{m.name} · {sizeLabel(m.size)}</option>)}</select></div>}
    <input ref={input} type="file" hidden accept={ALLOWED.join(',')} onChange={e => { void pick(e.target.files?.[0]); }} data-testid={`input-${testId}-file`} />
    {asset ? <div className="media-card">
      <div className="media-thumb">{preview?.id === asset.id
        ? (isVideo ? <video src={preview.url} controls muted preload="metadata" /> : <img src={preview.url} alt={`Preview of ${asset.name}`} />)
        : (isVideo ? <Film /> : <ImagePlus />)}</div>
      <div className="media-meta"><b title={asset.name}>{asset.name}</b><span>{asset.mime} · {sizeLabel(asset.size)}</span>
        {!preview && !previewError && <span>Loading preview…</span>}
        {previewError && <span className="media-err" role="alert">{previewError}</span>}</div>
      <div className="media-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => input.current?.click()} data-testid={`button-${testId}-replace`}>Replace</button>
        <button type="button" className="small-icon" disabled={busy} aria-label="Remove attachment from draft" onClick={() => onChange(null)} data-testid={`button-${testId}-remove`}><Trash2 /></button>
        <button type="button" className="small-icon" disabled={busy} title="Delete unused file from SQLite storage" aria-label="Delete unused file from storage" onClick={() => { void deleteAsset(); }} data-testid={`button-${testId}-delete`}><Trash2 /></button>
      </div>
    </div> : <button type="button" className="media-drop" disabled={busy} onClick={() => input.current?.click()} data-testid={`button-${testId}-choose`}>
      <ImagePlus /><b>{busy ? 'Uploading…' : 'Attach image or video'}</b><span>PNG, JPEG, WebP, GIF, MP4, WebM · up to 5 MiB</span></button>}
    {missing && <div className="media-err" role="alert">The saved attachment is no longer available. Choose a new file or leave it empty.</div>}
    {error && <div className="media-err" role="alert" data-testid={`error-${testId}`}>{error}</div>}
    <div className="media-note">Ready storage: {isDesktop ? 'saved in SQLite on this computer' : 'saved in SQLite on the hosted preview server (not your device)'}. Simulated use only; the file is never posted anywhere.</div>
  </div>;
}
