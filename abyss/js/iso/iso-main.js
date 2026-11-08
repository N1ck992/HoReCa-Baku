// =====================================================================
// ISO MAIN (этап 1 изометрии, дополнение №45). Точка входа тестовой
// изометрической сцены (iso.html): мир, отряд, камера, управление, интерфейс.
// Старая игра (index.html, вид сбоку) не меняется и работает как раньше.
// =====================================================================

(() => {
  const $ = (s) => document.querySelector(s);
  const SECTOR = 'SECTOR-001';
  const ui = { room: $('#iso-room'), party: $('#iso-party'), zoom: $('#iso-zoom') };
  let lastParty = '', lastRoom = '';

  function updateHud() {
    const l = AB.IsoParty.lead();
    const room = AB.IsoWorld.room(l.x, l.y);
    if (room && room !== lastRoom) {
      const r = AB.ID.get(room);
      ui.room.innerHTML = `<b>${r ? r.name : room}</b><span>${room}</span>`;
      lastRoom = room;
    }
    const html = AB.IsoParty.members().map((m, i) => {
      const d = AB.ID.get(m.id), lead = i === AB.IsoParty.leaderIndex();
      return `<button class="pm ${lead ? 'lead' : ''}" data-i="${i}" aria-pressed="${lead}" title="${lead ? 'Ведёт отряд' : 'Передать управление (Q)'}"><b>${d.name}</b><span>${m.id}</span></button>`;
    }).join('');
    if (html !== lastParty) { ui.party.innerHTML = html; lastParty = html; }
  }

  function boot() {
    AB.Assets.load();
    AB.IsoWorld.build(SECTOR);
    AB.IsoParty.init(AB.ISO_LAYOUTS[SECTOR].party);
    AB.IsoRender.init($('#iso'));
    AB.IsoInput.init($('#iso'));
    ui.party.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) AB.IsoParty.setLeader(Number(b.dataset.i));
    });
    ui.zoom.addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]');
      if (b) AB.IsoRender.zoom(parseFloat(b.dataset.z));
    });
    $('#iso-ids').addEventListener('click', () => { AB.isoShowIds = !AB.isoShowIds; });
    for (const el of [ui.party, ui.zoom]) el.addEventListener('pointerdown', (e) => e.stopPropagation());

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      AB.IsoParty.update(dt, AB.IsoInput.update(dt));
      AB.Anim.update(dt);
      AB.IsoRender.frame(dt);
      updateHud();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
