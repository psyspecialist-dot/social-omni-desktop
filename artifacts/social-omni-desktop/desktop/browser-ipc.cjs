// One restricted transport for the generic API and dedicated browser controls.
module.exports = function registerBrowserIpc({ ipcMain, assertTrustedSender, getConnection, fetchImpl = fetch }) {
  async function request(event, method, route, body) {
    assertTrustedSender(event);
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || typeof route !== 'string' || !/^\/[a-z0-9/-]{1,120}$/i.test(route)) {
      throw new Error('Invalid local API request.');
    }
    const { port, secret, workspace } = getConnection();
    try {
      const result = await fetchImpl(`http://127.0.0.1:${port}/api/socialomni${route}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-socialomni-secret': secret, 'x-socialomni-workspace': workspace },
        body: body === undefined ? undefined : JSON.stringify(body),
        // Browser jobs are queued promptly; do not shorten other providers' auth calls.
        signal: ['/browser/jobs', '/suite/session', '/state'].includes(route) ? AbortSignal.timeout(15000) : undefined,
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || `Local request failed (${result.status}).`);
      return data;
    } catch (error) {
      if (['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new Error('The local backend did not respond. Check the live console and current task before retrying.');
      }
      throw error;
    }
  }
  ipcMain.handle('socialomni:api-request', request);
  ipcMain.handle('socialomni:start-browser-job', (event, body) => request(event, 'POST', '/browser/jobs', body));
};
