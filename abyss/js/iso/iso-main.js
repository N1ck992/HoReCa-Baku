// =====================================================================
// ISO MAIN (дополнения №45–49). Точка входа изометрического прохождения
// бункера (iso.html): игровой цикл и интерфейс — помещение и задание
// слева вверху, герои справа внизу (нажатие — окно героя), подсказка
// действия, сообщения, диалоги, «Пропустить сцену», «Начать сначала».
// Старая игра (index.html, вид сбоку) не меняется и работает как раньше.
// =====================================================================

(() => {
  const $ = (s) => document.querySelector(s);
  const ui = { room: $('#iso-room'), quest: $('#iso-quest'), party: $('#iso-party'), zoom: $('#iso-zoom'), prompt: $('#iso-prompt'), toast: $('#iso-toast'),
    dialog: $('#iso-dialog'), skip: $('#iso-skip') };
  const isTouch = matchMedia('(pointer: coarse)').matches;
  let lastParty = '', lastRoom = '', lastPrompt = '', toastT = null;

  function toast(text, kind = 'bad') {
    ui.toast.textContent = text;
    ui.toast.className = `show ${kind}`;
    clearTimeout(toastT);
    toastT = setTimeout(() => ui.toast.classList.remove('show'), 2400);
  }
  const itemName = (id) => AB.ID.get(id).name;
  // сообщения тех же систем, что в основной игре
  AB.Bus.on('item:pickup', ({ charId, by, itemId, added }) => {
    if (added) toast(`${AB.ID.get(itemId).weapon && AB.Inventory.weapon(charId) && AB.Inventory.weapon(charId).item === itemId ? `В руках у ${AB.ID.get(charId).name}` : 'В инвентаре'}: ${itemName(itemId)}`, 'good');
    else toast('Не помещается');
  });
  AB.Bus.on('equip:blocked', ({ text }) => toast(text, 'info'));
  AB.Bus.on('equip:info', ({ text }) => toast(text, 'good'));
  AB.Bus.on('equip:changed', ({ text }) => toast(text, 'good'));
  AB.Bus.on('equip:shared', ({ from, itemId }) => toast(`${itemName(itemId)} — из рюкзака: ${AB.ID.get(from).name}`, 'info'));
  AB.Bus.on('door:denied', ({ reason }) => toast(reason, 'info'));
  AB.Bus.on('iso:toast', ({ text, kind }) => toast(text, kind));
  AB.Bus.on('inventory:exchange', ({ toId, given, taken }) => {
    const to = AB.ID.get(toId).name;
    toast(given && taken ? `Обмен с ${to}: ${itemName(given)} ⇄ ${itemName(taken)}` : given ? `${to} получает: ${itemName(given)}` : `Взято у ${to}: ${itemName(taken)}`, 'good');
  });
  AB.Bus.on('iso:door', ({ state, name }) => toast(`${name}: ${state === 'open' ? 'открыта' : 'закрыта'}`, 'info'));
  AB.Bus.on('combat:noweapon', () => toast('Нечем драться: найдите что-нибудь тяжёлое', 'info'));
  AB.Bus.on('weapon:overheat', () => toast('Терминал перегрет — пара секунд на остывание', 'info'));
  AB.Bus.on('enemy:dead', ({ name }) => toast(`${name} убит`, 'good'));
  // гибель Марка или Миры — конец, как в основной игре; остальные — отряд идёт дальше
  AB.Bus.on('char:dead', ({ charId }) => {
    if (charId !== 'CHAR-001' && charId !== 'CHAR-002') { toast(`${AB.ID.get(charId).name} погибла`); return; }
    $('#iso-death h2').textContent = charId === 'CHAR-001' ? 'Вы погибли' : 'Её больше нет';
    setTimeout(() => { $('#iso-death').hidden = false; }, 1400);
  });

  // подсказка действия; на телефоне она же — кнопка
  function updatePrompt() {
    const p = AB.IsoInteract.prompt();
    document.body.classList.toggle('quiet', !!p || AB.Dialog.isOpen());   // подсказка или диалог — без строки помощи
    if (!p || AB.Dialog.isOpen()) { ui.prompt.classList.remove('show'); lastPrompt = ''; return; }
    const html = p.progress !== undefined
      ? `${p.label}<span class="bar"><i style="width:${Math.round(p.progress * 100)}%"></i></span>`
      : `${isTouch ? '' : `<kbd class="${p.ok ? '' : 'no'}">E</kbd> `}${p.label}`;
    ui.prompt.classList.toggle('no', !p.ok);
    if (html !== lastPrompt) { ui.prompt.innerHTML = html; lastPrompt = html; }
    ui.prompt.classList.add('show');
  }

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
      // на карточке — оружие в руках; подробно — в окне героя (нажатие на карточку)
      const chip = (sl) => (sl ? `<u title="${itemName(sl.item)}">${AB.ID.get(sl.item).short}</u>` : '<u class="empty">—</u>');
      const c = AB.Chars.get(m.id), hp = c ? Math.max(0, c.hp / d.stats.maxHp) : 1, dead = c && c.dead;
      const ht = AB.Inventory.heat(m.id);
      return `<button class="pm ${lead ? 'lead' : ''} ${dead ? 'dead' : ''}" data-i="${i}" aria-pressed="${lead}" title="${d.name}: снаряжение и здоровье${lead ? ' · ведёт отряд' : ' · Q — передать управление'}"><b>${AB.IsoSuit.suited(m) ? 'Экзокостюм' : d.name}</b><span>${AB.IsoSuit.suited(m) ? '<u title="Манипуляторы: удар на 2 клетки">МНП</u>' : chip(AB.Inventory.weapon(m.id))}</span>`
        + `<i class="hp" style="width:${Math.round(hp * 100)}%"></i>${ht ? `<i class="heat ${ht.over ? 'over' : ''}" style="width:${Math.round(ht.heat * 100)}%"></i>` : ''}</button>`;
    }).join('');
    if (html !== lastParty) { ui.party.innerHTML = html; lastParty = html; }
    // задание: текущие цели из системы заданий основной игры
    const qh = AB.Quests.active().map((q) => `<b>${q.name}</b>${q.objectives.map((o) => `<div class="${o.ok ? 'ok' : ''}">${o.text}</div>`).join('')}`).join('');
    if (qh !== lastQuest) { ui.quest.innerHTML = qh; lastQuest = qh; }
    ui.skip.hidden = !AB.IsoStory.isRunning();
    // испытание «Гнездо»: время, этапы прохода, убито, уровень и опыт
    // оборона оружейной и бой с Колоссом (№57): полоса сверху
    const ns = AB.IsoNest.state(), bs = AB.IsoBoss.state();
    $('#iso-nest').hidden = !ns && !bs;
    let nh = '';
    if (ns) {
      const P = AB.Progress, bio = AB.IsoStash.count('ITEM-007'), cost = AB.IsoNest.RULES.turretCost, tn = AB.IsoNest.config().turrets.length;
      nh = `<b>Гнездо</b><span class="t">${ns.over ? 'Затихли' : `${Math.floor(ns.t / 60)}:${String(Math.floor(ns.t % 60)).padStart(2, '0')}`}</span>`
        + `<span class="rp">Взлом <u><s style="width:${Math.round(ns.prog * 100)}%"></s></u> ${Math.round(ns.prog * 100)}%</span>`
        + `<span class="k">Био: ${bio} · у Миры ${ns.bank}/${cost} · турели ${ns.turrets}/${tn}</span>`
        + `<span class="k">Убито: ${ns.kills}</span><span class="xp">Ур. ${P.level()} <em><i style="width:${Math.round((P.xp() / P.need()) * 100)}%"></i></em></span>`;
    } else if (bs) {
      const L = AB.IsoBoss.config(), col = AB.IsoEnemies.get(L.enemy), hp = col ? Math.round((col.hp / AB.ID.get(L.enemy).hp) * 100) : 0;
      nh = `<b>Колосс</b><span class="rp">Броня <u><s style="width:${hp}%"></s></u> ${hp}%</span>`
        + `<span class="k">Био: ${AB.IsoStash.count('ITEM-007')} · пушки ${bs.on.filter(Boolean).length}/${L.cannons.length} (${bs.bank.map((b, i) => (bs.on[i] ? '✓' : `${b}/${L.cost}`)).join(' · ')})</span>`;
    }
    if (nh && nh !== lastNest) { $('#iso-nest').innerHTML = nh; lastNest = nh; }
  }
  let lastQuest = '', lastNest = '';
  AB.Bus.on('nest:start', () => toast(AB.IsoNest.config().start || 'Гнездо проснулось!', 'bad'));
  AB.Bus.on('nest:won', () => toast(`${AB.IsoNest.config().done || ''} Гнездо затихло`, 'good'));
  AB.Bus.on('nest:reset', () => toast('Миру ударили — взлом сброшен, всё заново!', 'bad'));
  AB.Bus.on('nest:breach', () => toast('Дверь выбита! Теперь они идут без остановки', 'bad'));
  AB.Bus.on('nest:bio', ({ n, bank }) => toast(`Мира: биоматериал +${n} (${bank}/${AB.IsoNest.RULES.turretCost})`, 'good'));
  AB.Bus.on('nest:turret', ({ n, of }) => toast(`Турель ${n} из ${of} включена!`, 'good'));
  AB.Bus.on('boss:start', () => toast('Плазма его почти не берёт! Биоматериал с выводка — на приёмники у пушек', 'bad'));
  AB.Bus.on('boss:bio', ({ bank, cost }) => toast(`Пушка: биоматериал ${bank}/${cost}`, 'info'));
  AB.Bus.on('boss:cannon', ({ n, of }) => toast(`Пушка ${n} из ${of} ожила!`, 'good'));
  AB.Bus.on('nest:order', ({ id, on }) => toast(`${AB.ID.get(id).name}: ${on ? 'работает у замка' : 'за мной'}`, 'info'));
  // новый уровень: пауза и выбор одного из трёх улучшений (черновик PERK-001…009)
  let paused = false;
  AB.Bus.on('progress:level', () => setTimeout(showPerks, 300));
  function showPerks() {
    if (paused || AB.Progress.unspent() <= 0) return;
    const cards = AB.Perks.offer(3);
    paused = true;
    $('#iso-perks h2').textContent = `Уровень ${AB.Progress.level() - AB.Progress.unspent() + 1}: улучшение`;
    $('#iso-perks .perk-list').innerHTML = cards.map((p) => `<button class="perk" data-perk="${p.id}"><b>${p.name}</b><span>${p.desc}</span></button>`).join('') || '<button class="perk" data-perk="">Продолжить</button>';
    $('#iso-perks').hidden = false;
  }

  // диалоги — та же система (AB.Dialog), реплики из данных
  // над окном — портреты по пояс: Марк слева, собеседник справа; говорит — ярко, слушает — приглушён (№55)
  let talk = null;
  AB.Bus.on('dialog:line', (l) => {
    ui.dialog.hidden = false;
    if (!talk || talk.id !== l.id) {
      const who = [...new Set(AB.ID.get(l.id).lines.map((q) => q.speaker))];
      const left = who.includes('CHAR-001') ? 'CHAR-001' : who[0], right = who.find((q) => q !== left && String(q).startsWith('CHAR-')) || null;
      talk = { id: l.id, left, right };
    }
    talk.speaker = l.speaker;
    ui.dialog.classList.toggle('log', !String(l.speaker).startsWith('CHAR-'));
    ui.dialog.querySelector('.tx').innerHTML = `<b>${l.name}</b><p>${l.text}</p><span class="muted">${isTouch ? 'Коснитесь' : 'E, пробел или нажатие'} — ${l.last ? 'закрыть' : 'дальше'}</span>`;
    ui.dialog.classList.toggle('right', l.speaker === talk.right);
  });
  AB.Bus.on('dialog:end', () => { ui.dialog.hidden = true; talk = null; });
  function drawPortraits() {
    if (!talk || ui.dialog.hidden) return;
    const [cl, cr] = ui.dialog.querySelectorAll('.pt');
    cl.classList.toggle('dim', talk.speaker !== talk.left); cr.classList.toggle('dim', talk.speaker !== talk.right);
    cr.style.visibility = talk.right ? 'visible' : 'hidden';
    AB.IsoRender.portrait(cl, talk.left, 1);
    if (talk.right) AB.IsoRender.portrait(cr, talk.right, -1);
  }
  AB.Bus.on('quest:start', ({ name }) => toast(`Новое задание: ${name}`, 'info'));
  AB.Bus.on('quest:done', ({ name }) => toast(`Задание выполнено: ${name}`, 'good'));
  AB.Bus.on('world:power', ({ on }) => { if (on) setTimeout(() => toast('Питание корабля восстановлено', 'good'), 1200); });
  AB.Bus.on('container:looted', ({ label, found, full }) => toast(found.length ? `${label}: ${found.map(([id, n]) => `${itemName(id)} ×${n}`).join(', ')}${full ? ' · остальное — рядом на полу' : ''}` : `${label}: инвентарь полон — находки рядом на полу`, 'good'));
  AB.Bus.on('container:empty', ({ label }) => toast(`${label}: пусто`, 'info'));
  AB.Bus.on('iso:travel', ({ sector }) => toast(AB.IsoGame.sectorName(sector), 'info'));
  AB.Bus.on('enemy:retreat', ({ id }) => { if (AB.ID.get(id).type === 'pursuer') toast('Он отступил в темноту', 'info'); });
  AB.Bus.on('quest:done', ({ id }) => { if (id === 'QUEST-002') setTimeout(() => toast('Безопасная зона: переборки заблокированы изнутри', 'good'), 1400); });
  // оружие, найденное при занятых руках, — в общий инвентарь: подсказать
  AB.Bus.on('inventory:changed', ({ charId, itemId, delta }) => {
    if (charId === null && delta > 0 && AB.ID.get(itemId).weapon) setTimeout(() => toast(`${itemName(itemId)} — в вещах отряда: дайте в руки (I)`, 'info'), 900);
  });
  // конец акта: тот же текст, что в основной игре; остаться в бункере или начать сначала
  // №55: карточки актов I–III — js/data/iso-acts.js
  let actNow = 1;
  AB.Bus.on('act:end', ({ act }) => {
    actNow = act;
    const a = AB.ISO_ACTS[act];
    $('#iso-act .act-no').textContent = a.no;
    $('#iso-act h2').textContent = a.title;
    $('#iso-act p:not(.act-next):not(.muted)').textContent = a.text;
    $('#iso-act .act-next').textContent = a.next;
    $('#iso-act-out').textContent = a.cont;
    $('#iso-act').hidden = false;
  });

  let last = 0;
  const clearFade = () => Object.assign(AB.IsoStory.fx, { fade: 0, fadeTo: 0, fadeDur: 0, fadeFrom: 0, actEnd: 0 });
  // вернулись с дна — отряд у внешнего люка шлюза
  AB.Bus.on('ow:exit', () => {
    clearFade();
    if (AB.IsoGame.sector() !== 'SECTOR-003') AB.IsoGame.travel('SECTOR-003', 78.5, 28.5);
    else { AB.IsoParty.placeAll(78.5, 28.5); AB.IsoRender.snap(); }
    last = performance.now();
    toast('Шлюз «Абисса»', 'info');
  });
  function boot() {
    AB.Assets.load();
    AB.IsoRender.init($('#iso'));
    AB.Quests.init();
    AB.IsoGame.start();                                   // пробуждение в криоотсеке (или тестовая сцена)
    AB.IsoInventory.init();
    AB.IsoInput.init($('#iso'));
    AB.IsoMap.init($('#iso-map'));
    AB.IsoInput.stick($('#iso-stick'));
    ui.party.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) AB.IsoInventory.openHero(AB.IsoParty.members()[Number(b.dataset.i)].id);
    });
    ui.dialog.addEventListener('pointerdown', (e) => { e.stopPropagation(); AB.Dialog.next(); });
    ui.skip.addEventListener('click', () => AB.IsoStory.skip());
    for (const el of [ui.skip, $('#iso-restart')]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.zoom.addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]');
      if (b) AB.IsoRender.zoom(parseFloat(b.dataset.z));
    });
    $('#iso-ids').addEventListener('click', () => { AB.isoShowIds = !AB.isoShowIds; });
    $('#iso-restart').addEventListener('click', () => AB.IsoGame.restart());
    $('#iso-act-new').addEventListener('click', () => AB.IsoGame.restart());
    // дальше: следующий акт (после третьего — остаться на карте дна)
    $('#iso-act-out').addEventListener('click', () => { $('#iso-act').hidden = true; clearFade(); last = performance.now(); AB.IsoActs.next(actNow); });
    AB.IsoOverworld.init();
    $('#iso-act').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('#iso-perks').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('#iso-perks').addEventListener('click', (e) => {
      const b = e.target.closest('[data-perk]');
      if (!b) return;
      if (b.dataset.perk) { AB.Perks.choose(b.dataset.perk); toast(`Улучшение: ${AB.ID.get(b.dataset.perk).name}`, 'good'); }
      AB.Progress.spend();
      $('#iso-perks').hidden = true; paused = false; last = performance.now();
      if (AB.Progress.unspent() > 0) setTimeout(showPerks, 400);
    });
    $('#iso-restart-top').addEventListener('click', () => AB.IsoGame.restart());
    $('#iso-restart-top').addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const el of [ui.party, ui.zoom]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); AB.IsoInteract.actNearest(); });

    last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (paused || AB.IsoOverworld.isOpen()) { requestAnimationFrame(loop); return; }   // выбор улучшения или дно — бункер стоит
      // сцена, диалог или переход — управление у сцены
      const busy = AB.IsoStory.locked() || AB.IsoGame.busy();
      const raw = AB.IsoInput.update(dt), input = busy ? { x: 0, y: 0, walk: false } : raw;
      AB.IsoStory.update(dt);
      AB.IsoGame.update(dt);
      AB.IsoParty.update(dt, input);
      AB.IsoBridge.sync();
      AB.IsoInteract.update(dt, input);
      AB.IsoEnemies.update(dt);
      AB.IsoNest.update(dt, input);
      AB.IsoBoss.update(dt);
      if (!busy) AB.IsoCombat.update(dt, input);
      if (Math.random() < 0.1) AB.Quests.check();
      AB.Anim.update(dt);
      AB.IsoRender.frame(dt);
      AB.IsoMap.draw(dt);
      updateHud();
      updatePrompt();
      drawPortraits();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
