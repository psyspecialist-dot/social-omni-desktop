import { useEffect, useState } from 'react';
import type { SimulationJob } from '@/lib/api';
import { useI18n } from '@/i18n';

const useNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const id = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(id); }, [active]);
  return now;
};

export default function SimQueue({ job, testId }: { job: SimulationJob; testId: string }) {
  const { t } = useI18n();
  const live = job.status === 'Pending' || job.status === 'Running';
  const now = useNow(live && Boolean(job.nextActionAt));
  const targets = job.targets || [];
  const isWa = job.kind === 'whatsapp';
  const isFilter = job.action === 'filter';
  const isInbox = job.action === 'inbox';
  const total = job.totalCount ?? targets.length;
  const done = job.completedCount ?? (isWa ? targets.filter(tg => tg.sendStatus === 'Sent').length : targets.filter(tg => tg.postStatus === 'Posted').length);
  const joined = targets.filter(tg => tg.joinStatus === 'Joined').length;
  const posted = targets.filter(tg => tg.postStatus === 'Posted').length;
  const remaining = job.nextActionAt ? Math.max(0, Math.ceil((new Date(job.nextActionAt).getTime() - now) / 1000)) : 0;
  const waiting = live && job.phase === 'Waiting' && job.nextActionAt;
  const phase = job.status === 'Cancelled' ? 'Cancelled' : job.status === 'Failed' ? 'Failed' : job.phase || job.status;
  const pct = Math.max(0, Math.min(100, job.progress));
  return <div className="sq" data-testid={`queue-${testId}`}>
    <div className="sq-top">
      <div className="sq-counters">
        {isWa
          ? <span className="sq-count" data-testid={`text-sent-${testId}`}>{isFilter ? t('Checked {a} / {b}', { a: done, b: total }) : isInbox ? t('Replies accepted {a}', { a: done }) : t('Sent {a} / {b}', { a: done, b: total })}</span>
          : <><span className="sq-count">{t('Joined {a} / {b}', { a: joined, b: total })}</span><span className="sq-count">{t('Posted {a} / {b}', { a: posted, b: total })}</span></>}
        <span className="mono-tag">{job.mode === 'live' ? t('LIVE · LOCAL BROWSER') : t('Simulated')}</span>
      </div>
      <span className="status" data-testid={`status-phase-${testId}`}>{waiting ? t('Waiting {n}s', { n: remaining }) : t(phase)}</span>
    </div>
    {isInbox ? <p role="status">{t('Synced {n} messages', { n: job.currentStep })}</p>
      : <div className="wa-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>}
    {(job.accountName || job.mediaName) && <div className="sq-meta">{job.accountName && <span>{t('Account:')} {job.accountName}</span>}{job.mediaName && <span>{t('Media:')} {job.mediaName}</span>}</div>}
    {targets.length > 0 ? <div className="sq-table-wrap"><table className="sq-table" aria-label={isWa ? t('Recipient queue') : t('Group queue')}>
      <thead><tr><th>{isWa ? t('Recipient') : job.mode === 'live' ? t('Approved group') : t('Hypothetical group')}</th>{!isWa && <th>{t('Join status')}</th>}<th>{isFilter ? t('Check progress') : isWa ? t('Send status') : t('Post status')}</th></tr></thead>
      <tbody>{targets.map((tg, index) => <tr key={tg.id}><td className="sq-name">{tg.name}{tg.error && <small role="note" style={{ display: 'block', whiteSpace: 'normal' }}>{t(tg.error)}</small>}</td>
        {isWa
          ? <td><span className={`sq-chip ${!isFilter && tg.sendStatus === 'Sent' ? 'on' : ''}`}>{isFilter ? index < done ? t('Checked · see WaFilter results') : t('Pending check') : tg.sendStatus === 'Sent' ? job.mode === 'live' ? t('Sent · server accepted') : t('Sent (simulated)') : t(tg.sendStatus)}</span></td>
          : <><td><span className={`sq-chip ${tg.joinStatus === 'Joined' ? 'on' : ''}`}>{tg.joinStatus === 'Joined' ? job.mode === 'live' ? t('Joined') : t('Joined (simulated)') : t(tg.joinStatus)}</span></td>
            <td><span className={`sq-chip ${tg.postStatus === 'Posted' ? 'on' : ''}`}>{tg.postStatus === 'Posted' ? job.mode === 'live' ? t('Posted') : t('Posted (simulated)') : t(tg.postStatus)}</span></td></>}
      </tr>)}</tbody>
    </table></div> : <p className="sq-empty">{job.mode === 'live' ? t('Sign-in and discovery progress appears here and in the live console.') : t('Queue entries appear when the simulation starts.')}</p>}
  </div>;
}
