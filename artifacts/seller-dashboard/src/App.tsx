import { useEffect, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetSellerSessionQueryKey,
  setAuthTokenGetter,
  useGenerateSellerLicense,
  useGetSellerSession,
  useLoginSeller,
  useLogoutSeller,
} from '@workspace/api-client-react';

const TOKEN_KEY = 'najhin-seller-session';
const readToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const writeToken = (t: string) => {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
};
const clearToken = () => {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};
setAuthTokenGetter(readToken);

const queryClient = new QueryClient();
const REQ = { headers: { 'X-Seller-Dashboard': '1' } };
const HEX64 = /^[a-fA-F0-9]{64}$/;
const PLANS = [
  { value: 'lifetime', label: 'Lifetime' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'none', label: 'None' },
] as const;
type Plan = (typeof PLANS)[number]['value'];

function errMsg(e: unknown, fallback: string): string {
  const d = (e as { data?: unknown } | null)?.data;
  if (d && typeof d === 'object' && typeof (d as { error?: unknown }).error === 'string') {
    return (d as { error: string }).error;
  }
  return fallback;
}
const isUnauthorized = (e: unknown) => (e as { status?: number } | null)?.status === 401;

const field =
  'w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30 disabled:opacity-50';
const btn =
  'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:brightness-125`;
const btnGhost = `${btn} border border-input bg-card hover:bg-secondary`;

function Notice({ tone, children, id }: { tone: 'error' | 'warn'; children: React.ReactNode; id?: string }) {
  const c =
    tone === 'error'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-accent/50 bg-accent/15 text-foreground';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} data-testid={id} className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${c}`}>
      {children}
    </div>
  );
}

function Shell({ children, onSignOut, busy }: { children: React.ReactNode; onSignOut?: () => void; busy?: boolean }) {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-display text-lg font-bold leading-none">Social Najhin</p>
            <p className="mt-1 text-xs uppercase tracking-widest opacity-70">Seller workspace</p>
          </div>
          {onSignOut && (
            <button
              data-testid="button-sign-out"
              onClick={onSignOut}
              disabled={busy}
              className="rounded-lg border border-white/30 px-3.5 py-2 text-sm font-medium transition hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">{children}</main>
    </div>
  );
}

function Skeleton() {
  return (
    <Shell>
      <div className="space-y-4" data-testid="loading-session">
        <div className="h-9 w-2/3 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    </Shell>
  );
}

function Dashboard() {
  const qc = useQueryClient();
  const sessionKey = getGetSellerSessionQueryKey();
  const polls = useRef(0);
  const session = useGetSellerSession({
    request: REQ,
    query: {
      queryKey: sessionKey,
      retry: false,
      refetchOnWindowFocus: false,
      refetchInterval: (q) => {
        const s = q.state.data;
        if (s && s.authenticated && s.passwordConfigured && !s.issuerReady && polls.current < 5) {
          polls.current += 1;
          return 15000;
        }
        return false;
      },
    },
  });
  const login = useLoginSeller({ request: REQ });
  const logout = useLogoutSeller({ request: REQ });
  const gen = useGenerateSellerLicense({ request: REQ });

  const [password, setPassword] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [plan, setPlan] = useState<Plan>('lifetime');
  const [touched, setTouched] = useState(false);
  const [key, setKey] = useState('');
  const [genError, setGenError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const outRef = useRef<HTMLTextAreaElement>(null);

  const clearOutput = () => {
    setKey('');
    setGenError('');
    setCopyMsg(null);
    gen.reset();
  };

  const handleUnauthorized = () => {
    clearToken();
    clearOutput();
    login.reset();
    qc.setQueryData(sessionKey, {
      authenticated: false,
      passwordConfigured: true,
      issuerReady: false,
      setupError: null,
    });
    qc.removeQueries({ queryKey: ['generateSellerLicense'] });
  };

  const authedFalse = session.data ? !session.data.authenticated : false;
  useEffect(() => {
    if (authedFalse) {
      clearToken();
      setKey('');
      setGenError('');
      setCopyMsg(null);
    }
  }, [authedFalse]);

  useEffect(() => {
    if (session.error && isUnauthorized(session.error)) handleUnauthorized();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.error]);

  if (session.isLoading) return <Skeleton />;

  const s = session.data;
  if (!s) {
    return (
      <Shell>
        <Notice tone="error" id="error-session">
          {errMsg(session.error, 'The dashboard could not reach the server.')}
        </Notice>
        <button data-testid="button-retry" className={`${btnGhost} mt-4`} onClick={() => session.refetch()}>
          Try again
        </button>
      </Shell>
    );
  }

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    login.mutate(
      { data: { password } },
      {
        onSuccess: (data) => {
          setPassword('');
          polls.current = 0;
          const tok = data.sessionToken;
          if (tok) writeToken(tok);
          qc.setQueryData(sessionKey, { ...data, sessionToken: null });
          qc.invalidateQueries({ queryKey: sessionKey });
        },
        onError: (err) => setLoginError(errMsg(err, 'Sign-in failed. Check the password and try again.')),
      },
    );
  };

  const signOut = () => {
    clearOutput();
    const done = () => {
      clearToken();
      setDeviceId('');
      setTouched(false);
      qc.removeQueries({ queryKey: ['generateSellerLicense'] });
      qc.invalidateQueries({ queryKey: sessionKey });
    };
    logout.mutate(undefined, {
      onSuccess: (data) => {
        clearToken();
        qc.setQueryData(sessionKey, data);
        done();
      },
      onError: (err) => {
        clearToken();
        if (isUnauthorized(err)) handleUnauthorized();
        else setGenError(errMsg(err, 'Sign-out failed. Try again.'));
      },
    });
  };

  if (!s.passwordConfigured) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-bold">Setup required</h1>
        <div className="mt-5">
          <Notice tone="warn" id="error-setup">
            <p className="font-semibold">The seller password is not configured.</p>
            <p className="mt-1">
              Add a secret named <code className="font-mono">SELLER_DASHBOARD_PASSWORD</code> in Replit Secrets (16–256 characters), then reload this page.
            </p>
          </Notice>
        </div>
        <button data-testid="button-recheck" className={`${btnGhost} mt-4`} onClick={() => session.refetch()} disabled={session.isFetching}>
          {session.isFetching ? 'Checking…' : 'Check again'}
        </button>
      </Shell>
    );
  }

  if (!s.authenticated) {
    return (
      <Shell>
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-3xl font-bold">Seller sign-in</h1>
          <p className="mt-2 text-muted-foreground">A private workspace for issuing device-bound licenses.</p>
          <form onSubmit={submitLogin} className="mt-6 space-y-4 rounded-2xl border border-card-border bg-card p-6 shadow-sm">
            <label className="block text-sm font-medium">
              Seller password
              <input
                data-testid="input-password"
                type="password"
                autoComplete="current-password"
                className={`${field} mt-1.5`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={256}
                required
              />
            </label>
            {loginError && <Notice tone="error" id="error-login">{loginError}</Notice>}
            <button data-testid="button-sign-in" type="submit" className={`${btnPrimary} w-full`} disabled={login.isPending || !password}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  const idTrim = deviceId.trim();
  const idValid = HEX64.test(idTrim);
  const showIdError = touched && !idValid;
  const canIssue = s.issuerReady && idValid && !gen.isPending;

  const submitGen = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canIssue) return;
    clearOutput();
    gen.mutate(
      { data: { deviceId: idTrim, plan } },
      {
        onSuccess: (r) => setKey(r.licenseKey),
        onError: (err) => {
          setKey('');
          if (isUnauthorized(err)) handleUnauthorized();
          else setGenError(errMsg(err, 'License generation failed. Nothing was issued.'));
        },
      },
    );
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unsupported');
      await navigator.clipboard.writeText(key);
      setCopyMsg({ ok: true, text: 'Copied to clipboard.' });
    } catch {
      outRef.current?.focus();
      outRef.current?.select();
      setCopyMsg({ ok: false, text: 'Copy was blocked by the browser. The key is selected: press Ctrl+C (Cmd+C on Mac) to copy it.' });
    }
  };

  return (
    <Shell onSignOut={signOut} busy={logout.isPending}>
      <h1 className="font-display text-3xl font-bold">Issue a license</h1>
      <p className="mt-2 text-muted-foreground">
        Paste the buyer's Device ID, pick a plan, and generate a key for that device only.
      </p>

      {!s.issuerReady && (
        <div className="mt-6">
          <Notice tone="warn" id="error-issuer">
            <p className="font-semibold">License issuing is unavailable.</p>
            <p className="mt-1">{s.setupError ?? 'The license issuer is not ready.'}</p>
            <button data-testid="button-recheck" className={`${btnGhost} mt-3`} onClick={() => session.refetch()} disabled={session.isFetching}>
              {session.isFetching ? 'Checking…' : 'Check again'}
            </button>
          </Notice>
        </div>
      )}

      <form onSubmit={submitGen} className="mt-6 space-y-5 rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-7">
        <div>
          <label htmlFor="device-id" className="text-sm font-medium">Device ID</label>
          <input
            id="device-id"
            data-testid="input-device-id"
            className={`${field} mt-1.5 font-mono text-[13px] ${showIdError ? 'border-destructive' : ''}`}
            value={deviceId}
            onChange={(e) => { setDeviceId(e.target.value); clearOutput(); }}
            onBlur={() => setTouched(true)}
            spellCheck={false}
            autoComplete="off"
            placeholder="64 hexadecimal characters"
            disabled={!s.issuerReady}
            aria-invalid={showIdError}
          />
          <p className={`mt-1.5 text-xs ${showIdError ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="text-device-hint">
            {showIdError ? 'Device ID must be exactly 64 hexadecimal characters (0-9, a-f).' : `${idTrim.length}/64 characters`}
          </p>
        </div>

        <div>
          <label htmlFor="plan" className="text-sm font-medium">Plan</label>
          <select
            id="plan"
            data-testid="select-plan"
            className={`${field} mt-1.5`}
            value={plan}
            onChange={(e) => { setPlan(e.target.value as Plan); clearOutput(); }}
            disabled={!s.issuerReady}
          >
            {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <p className="mt-2 rounded-lg bg-secondary px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground" data-testid="text-plan-note">
            Every license is perpetual and the app never expires. Monthly and Yearly add a support and updates period.
            Lifetime and None both issue the license with no support period, so neither promises future updates.
          </p>
        </div>

        {genError && <Notice tone="error" id="error-generate">{genError}</Notice>}

        <button data-testid="button-generate" type="submit" className={`${btnPrimary} w-full sm:w-auto`} disabled={!canIssue}>
          {gen.isPending ? 'Generating…' : 'Generate License Key'}
        </button>
      </form>

      {key && (
        <section className="mt-6 rounded-2xl border border-primary/30 bg-card p-5 shadow-sm sm:p-7" data-testid="section-output">
          <label htmlFor="license-out" className="text-sm font-medium">License key</label>
          <textarea
            id="license-out"
            ref={outRef}
            data-testid="textarea-license-key"
            readOnly
            rows={5}
            value={key}
            onFocus={(e) => e.currentTarget.select()}
            className={`${field} mt-1.5 resize-y break-all font-mono text-[13px]`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button data-testid="button-copy" type="button" className={btnPrimary} onClick={copy}>
              Copy to Clipboard
            </button>
            {copyMsg && (
              <span role="status" data-testid="text-copy-status" className={`text-sm ${copyMsg.ok ? 'text-primary' : 'text-destructive'}`}>
                {copyMsg.text}
              </span>
            )}
          </div>
        </section>
      )}
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
