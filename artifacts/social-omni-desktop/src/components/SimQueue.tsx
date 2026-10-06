import { useEffect, useState } from 'react';
import type { SimulationJob } from '@/lib/api';

const useNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, [active]);
  return now;
};

export default function SimQueue({ job, testId }: { job: SimulationJob; testId: string }) {
  const live = job.status === 'Pending' || job.status === 'Running';
  const now = useNow(live && Boolean(job.nextActionAt));
  const targets = job.targets || [];
  const isWa = job.kind === 'whatsapp';
  const total = job.totalCount ?? targets.length;
  const done = job.completedCount ?? (isWa ? targets.filter(t => t.sendStatus === 'Sent').length : targets.filter(t => t.postStatus === 'Posted').length);
  const joined = targets.filter(t => t.joinStatus === 'Joined').length;
  const posted = targets.filter(t => t.postStatus === 'Posted').length;
  const remaining = job.nextActionAt ? Math.max(0, Math.ceil((new Date(job.nextActionAt).getTime() - now) / 1000)) : 0;
  const waiting = live && job.phase === 'Waiting' && job.nextActionAt;
  const phase = job.status === 'Cancelled' ? 'Cancelled' : job.status === 'Failed' ? 'Failed' : job.phase || job.status;
  const pct = Math.max(0, Math.min(100, job.progress));
  return <div className="sq" data-testid={`queue-${testId}`}>
    <div className="sq-top">
      <div className="sq-counters">
        {isWa
          ? <span className="sq-count" data-testid={`text-sent-${testId}`}>Sent {done} / {total}</span>
          : <><span className="sq-count">Joined {joined} / {total}</span><span className="sq-count">Posted {posted} / {total}</span></>}
        <span className="mono-tag">{job.mode === 'live' ? 'LIVE · LOCAL BROWSER' : 'Simulated'}</span>
      </div>
      <span className="status" data-testid={`status-phase-${testId}`}>{waiting ? `Waiting ${remaining}s` : phase}</span>
    </div>
    <div className="wa-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
    {(job.accountName || job.mediaName) && <div className="sq-meta">{job.accountName && <span>Account: {job.accountName}</span>}{job.mediaName && <span>Media: {job.mediaName}</span>}</div>}
    {targets.length > 0 ? <div className="sq-table-wrap"><table className="sq-table" aria-label={isWa ? 'Recipient queue' : 'Group queue'}>
      <thead><tr><th>{isWa ? 'Recipient' : job.mode === 'live' ? 'Approved group' : 'Hypothetical group'}</th>{!isWa && <th>Join status</th>}<th>{isWa ? 'Send status' : 'Post status'}</th></tr></thead>
      <tbody>{targets.map(t => <tr key={t.id}><td className="sq-name">{t.name}</td>
        {isWa
          ? <td><span className={`sq-chip ${t.sendStatus === 'Sent' ? 'on' : ''}`}>{t.sendStatus === 'Sent' ? job.mode === 'live' ? 'Sent · server accepted' : 'Sent (simulated)' : t.sendStatus}</span></td>
          : <><td><span className={`sq-chip ${t.joinStatus === 'Joined' ? 'on' : ''}`}>{t.joinStatus === 'Joined' ? job.mode === 'live' ? 'Joined' : 'Joined (simulated)' : t.joinStatus}</span></td>
            <td><span className={`sq-chip ${t.postStatus === 'Posted' ? 'on' : ''}`}>{t.postStatus === 'Posted' ? job.mode === 'live' ? 'Posted' : 'Posted (simulated)' : t.postStatus}</span></td></>}
      </tr>)}</tbody>
    </table></div> : <p className="sq-empty">{job.mode === 'live' ? 'Sign-in and discovery progress appears here and in the live console.' : 'Queue entries appear when the simulation starts.'}</p>}
  </div>;
}
