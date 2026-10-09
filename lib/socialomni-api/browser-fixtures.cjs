// Local test pages only. No live platform credentials or external submissions.
module.exports = function fixture(url) {
  const u = new URL(url);
  if (u.hostname === 'web.whatsapp.com') {
    const invalid = u.searchParams.get('phone')?.endsWith('102');
    return `<div id="pane-side">Chats</div>${invalid ? '<p>Phone number shared via url is invalid</p>' : `
      <div id="main"><div id="messages"></div><footer>
      <div role="textbox" contenteditable="true" aria-label="Message"></div>
      <button aria-label="Send" onclick="const e=document.createElement('div');e.className='message-out';
      const t=document.createElement('span');t.textContent=document.querySelector('footer [contenteditable]').innerText;
      e.append(t);const c=document.createElement('span');c.setAttribute('data-icon','msg-check');c.textContent='✓';e.append(c);
      document.querySelector('#messages').append(e);window.submissions=(window.submissions||0)+1">
      <span data-icon="send"></span></button></footer></div>`}`;
  }
  if (u.hostname === 'www.facebook.com') {
    const profile = '<button>Your profile</button>';
    if (u.pathname === '/groups/234567/') return profile + `<button onclick="this.textContent='Cancel request';window.joinRequests=(window.joinRequests||0)+1">Join group</button>`;
    if (u.pathname.startsWith('/search/groups/')) return profile + '<nav><a href="https://www.facebook.com/groups/999999/">Unrelated sidebar group</a></nav><main><a href="https://www.facebook.com/groups/123456/">Fixture permitted group</a></main>';
    if (u.pathname.startsWith('/groups/')) return profile + `<button>Joined</button><button onclick="document.querySelector('[role=dialog]').hidden=false">Write something</button>
      <div role="dialog" hidden><div contenteditable="true" role="textbox"></div>
      <button onclick="const e=document.createElement('p');e.textContent=document.querySelector('[role=dialog] [contenteditable]').innerText;
      document.body.append(e);document.querySelector('[role=dialog]').hidden=true;window.submissions=(window.submissions||0)+1">Post</button></div>`;
    if (u.pathname.startsWith('/search/')) return profile + `<a href="https://www.facebook.com/search/groups/?q=${encodeURIComponent(u.searchParams.get('q') || '')}">Groups</a>`;
    return profile + `<input role="combobox" aria-label="Search Facebook" onkeydown="if(event.key==='Enter')location.href='https://www.facebook.com/search/top/?q='+encodeURIComponent(this.value)">`;
  }
  if (u.hostname === 'www.google.com') {
    if (u.pathname.startsWith('/maps/search/')) return '<div role="feed"><a href="https://www.google.com/maps/place/Alpha">Fixture Alpha</a><a href="https://www.google.com/maps/place/Beta">Fixture Beta</a></div>';
    const name = u.pathname.endsWith('Alpha') ? 'Fixture Alpha' : 'Fixture Beta';
    return `<h1>${name}</h1><button data-item-id="address" aria-label="Address: 1 Fixture Road">1 Fixture Road</button>
      <button data-item-id="phone:tel:+12025550101">+12025550101</button><a data-item-id="authority" href="https://fixture.example/">Website</a>`;
  }
  return '<p>Unexpected fixture URL</p>';
};
