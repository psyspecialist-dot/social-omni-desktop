// Native roles preserve platform shortcuts, IME input and OS clipboard behavior.
function installEditing({ app, Menu, clipboard, ipcMain, assertTrustedSender, getWindow }) {
  const roles = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'];
  const edit = { label: 'Edit / تحرير', submenu: roles.map(role => ({ role })) };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    edit, { role: 'windowMenu' },
  ]));
  ipcMain.handle('socialomni:copy-text', (event, value) => {
    assertTrustedSender(event);
    if (typeof value !== 'string' || value.length > 6000) throw new Error('Invalid clipboard text.');
    clipboard.writeText(value);
    if (clipboard.readText() !== value) throw new Error('Clipboard verification failed.');
    return true;
  });
  return window => {
    window.webContents.on('context-menu', (_event, params) => {
      const flags = params.editFlags || {};
      const entries = params.isEditable ? [
        { role: 'undo', enabled: flags.canUndo }, { role: 'redo', enabled: flags.canRedo },
        { type: 'separator' }, { role: 'cut', enabled: flags.canCut },
        { role: 'copy', enabled: flags.canCopy }, { role: 'paste', enabled: flags.canPaste },
        { type: 'separator' }, { role: 'selectAll' },
      ] : params.selectionText ? [{ role: 'copy' }, { role: 'selectAll' }] : [];
      if (entries.length) Menu.buildFromTemplate(entries).popup({ window: getWindow() });
    });
  };
}
module.exports = { installEditing };
