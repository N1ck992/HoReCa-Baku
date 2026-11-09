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
  AB.Bus.on('weapon:overheat', () => toast('Плазмомёт перегрет — пара секунд на остывание', 'info'));
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
    if (!p) { ui.prompt.classList.remove('show'); lastPrompt = ''; return; }
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
      return `<button class="pm ${lead ? 'lead' : ''} ${dead ? 'dead' : ''}" data-i="${i}" aria-pressed="${lead}" title="${d.name}: снаряжение и здоровье${lead ? ' · ведёт отряд' : ' · Q — передать управление'}"><b>${d.name}</b><span>${chip(AB.Inventory.weapon(m.id))}</span>`
        + `<i class="hp" style="width:${Math.round(hp * 100)}%"></i>${ht ? `<i class="heat ${ht.over ? 'over' : ''}" style="width:${Math.round(ht.heat * 100)}%"></i>` : ''}</button>`;
    }).join('');
    if (html !== lastParty) { ui.party.innerHTML = html; lastParty = html; }
    // задание: текущие цели из системы заданий основной игры
    const qh = AB.Quests.active().map((q) => `<b>${q.name}</b>${q.objectives.map((o) => `<div class="${o.ok ? 'ok' : ''}">${o.text}</div>`).join('')}`).join('');
    if (qh !== lastQuest) { ui.quest.innerHTML = qh; lastQuest = qh; }
    ui.skip.hidden = !AB.IsoStory.isRunning();
    // испытание «Гнездо»: время, этапы прохода, убито, уровень и опыт
    const ns = AB.IsoNest.state();
    $('#iso-nest').hidden = !ns;
    if (ns) {
      const g = AB.ID.get('ARENA-001').goal, P = AB.Progress;
      const pips = Array.from({ length: g.stages }, (_, i) => `<u class="${i < ns.stage ? 'ok' : i === ns.stage ? 'cur' : ''}">${i === ns.stage && !ns.over ? `<s style="width:${Math.round(ns.prog * 100)}%"></s>` : ''}</u>`).join('');
      const nh = `<b>Гнездо</b><span class="t">${ns.over ? 'Затихли' : `${Math.floor(ns.t / 60)}:${String(Math.floor(ns.t % 60)).padStart(2, '0')}`}</span><span class="rp">Проход ${pips}</span><span class="k">Убито: ${ns.kills}</span><span class="xp">Ур. ${P.level()} <em><i style="width:${Math.round((P.xp() / P.need()) * 100)}%"></i></em></span>`;
      if (nh !== lastNest) { $('#iso-nest').innerHTML = nh; lastNest = nh; }
    }
  }
  let lastQuest = '', lastNest = '';
  AB.Bus.on('nest:start', ({ stages }) => toast(`Гнездо проснулось! Спуск на склад заклинило — почините его (${stages} этапа)`, 'bad'));
  AB.Bus.on('nest:stage', ({ stage, stages }) => toast(stage < stages ? `Проход: этап ${stage} из ${stages} готов` : 'Проход починен!', 'good'));
  AB.Bus.on('nest:won', () => toast('Гнездо затихло', 'good'));
  AB.Bus.on('nest:order', ({ id, on }) => toast(`${AB.ID.get(id).name}: ${on ? 'чинит проход' : 'за мной'}`, 'info'));
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
  AB.Bus.on('dialog:line', (l) => {
    ui.dialog.hidden = false;
    ui.dialog.innerHTML = `<b>${l.name}</b><p>${l.text}</p><span class="muted">${isTouch ? 'Коснитесь' : 'E, пробел или нажатие'} — ${l.last ? 'закрыть' : 'дальше'}</span>`;
  });
  AB.Bus.on('dialog:end', () => { ui.dialog.hidden = true; });
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
  AB.Bus.on('act:end', ({ act }) => {
    $('#iso-act .act-no').textContent = `Конец ${act === 1 ? 'первого' : act} акта`;
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
    // выйти за борт: экран конца акта закрывается, Марк в экзокостюме — на дне (№54)
    $('#iso-act-out').addEventListener('click', () => { $('#iso-act').hidden = true; clearFade(); AB.IsoOverworld.enter(); });
    AB.IsoOverworld.init();
    $('#iso-act-stay').addEventListener('click', () => { $('#iso-act').hidden = true; clearFade(); });
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
      if (!busy) AB.IsoCombat.update(dt, input);
      if (Math.random() < 0.1) AB.Quests.check();
      AB.Anim.update(dt);
      AB.IsoRender.frame(dt);
      AB.IsoMap.draw(dt);
      updateHud();
      updatePrompt();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
