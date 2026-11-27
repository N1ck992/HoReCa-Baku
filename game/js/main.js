// =====================================================================
// Точка входа: загрузка, обработка нажатий, игровой цикл.
// =====================================================================

function structureKey() {
  // Если что-то из этого изменилось — вкладку нужно перерисовать целиком.
  return JSON.stringify([S.buildings, S.build && S.build.id, S.training && S.training.unit,
    S.units, S.missions.cleared, Object.keys(S.heroes).length,
    S.march && S.march.target, S.march && S.march.phase]);
}

function save() {
  SaveStore.save(S);
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'built') toast(`${BUILDINGS[e.id].icon} ${BUILDINGS[e.id].name}: уровень ${e.level}`, 'good');
    if (e.type === 'trained') toast(`${UNITS[e.unit].icon} Обучено: ${UNITS[e.unit].name} ×${e.count}`, 'good');
    if (e.type === 'battle') {
      if (e.result.win) MapScene.select(Math.min(MISSION_COUNT, S.missions.cleared + 1));
      // отряд дошёл до цели: показываем бой, если ничего другого не открыто
      if ($('#modal').hidden) showBattle(e.result);
      else toast(e.result.win ? '🏆 Отряд победил в секторе' : '☠ Отряд проиграл бой', e.result.win ? 'good' : 'bad');
    }
    if (e.type === 'returned') toast(e.recalled ? '↩ Отряд вернулся на базу' : '🚩 Отряд вернулся на базу', 'good');
  }
}

function onAction(btn) {
  const { action, id } = btn.dataset;
  switch (action) {
    case 'upgrade':
      if (startUpgrade(id)) toast(`Строительство начато: ${BUILDINGS[id].name}`);
      break;
    case 'speedup-build':
      if (speedupBuild()) handleEvents(tick());
      break;
    case 'count': {
      const max = Math.max(1, maxTrainable(id));
      trainCounts[id] = Math.min(max, Math.max(1, trainCounts[id] + Number(btn.dataset.delta)));
      break;
    }
    case 'count-max':
      trainCounts[id] = Math.max(1, maxTrainable(id));
      break;
    case 'train':
      if (startTraining(id, trainCounts[id])) toast(`Обучение: ${UNITS[id].name} ×${trainCounts[id]}`);
      break;
    case 'speedup-train':
      if (speedupTraining()) toast('Обучение завершено', 'good');
      break;
    case 'squad':
      if (!toggleSquad(id)) toast('Все слоты отряда заняты', 'bad');
      break;
    case 'recruit': {
      const r = recruit();
      if (r) { save(); showRecruit(r); return; }
      break;
    }
    case 'mission':
      if (launchMarch(Number(id))) {
        toast(`🚩 Отряд выступил: ${fmtTime(marchTime(Number(id)))} в пути`);
        if (currentTab !== 'map') currentTab = 'map';
        MapScene.focus(Number(id));
      }
      break;
    case 'recall':
      if (recallMarch()) toast('Отряд разворачивается');
      break;
    case 'battle-report':
      if (S.march && S.march.result) showBattle(S.march.result);
      return;
    case 'select-building':
      BaseScene.select(id);
      $('#base-panel').innerHTML = buildingCard(id);
      markChips(id);
      refresh();
      return;
    case 'map-zoom':
      MapScene.zoomBy(btn.dataset.delta === 'in' ? 1.25 : 0.8);
      return;
    case 'map-home':
      MapScene.focus(0, false);
      return;
    case 'map-follow':
      MapScene.focusMarch();
      return;
    case 'skip-battle':
      showBattle.skip && showBattle.skip();
      return;
    case 'close-modal':
      closeModal();
      return;
    case 'settings':
      showSettings();
      return;
    case 'reset':
      // подтверждение внутри игры (системный confirm() работает не везде)
      openModal(`
        <h2>Сбросить прогресс?</h2>
        <p class="muted">Все постройки, войска и герои будут удалены. Это нельзя отменить.</p>
        <div class="row between">
          <button class="btn ghost" data-action="settings">Отмена</button>
          <button class="btn danger" data-action="reset-confirm">Да, начать заново</button>
        </div>`);
      return;
    case 'reset-confirm':
      SaveStore.clear();
      S = START_STATE();
      save();
      closeModal();
      toast('Основана новая колония');
      return;
  }
  save();
  render();
}

function welcomeBack(before, awaySec) {
  const gained = ['metal', 'energy', 'food']
    .map((r) => [r, Math.floor(S.res[r] - before[r])])
    .filter(([, v]) => v > 0);
  if (gained.length && awaySec > 60) {
    openModal(`
      <h2>С возвращением, командир!</h2>
      <p class="muted">Вас не было ${fmtTime(awaySec)}. Колония продолжала работу:</p>
      <div class="cost big">${gained.map(([r, v]) => `<span class="cost-item">${RESOURCES[r].icon} +${fmt(v)}</span>`).join('')}</div>
      <button class="btn full" data-action="close-modal">К делу</button>`);
  }
}

function init() {
  document.title = GAME_TITLE;
  S = SaveStore.load() || START_STATE();

  // офлайн-прогресс: начисляем всё, что накопилось с последнего визита
  const before = { ...S.res };
  const awaySec = (now() - S.lastTick) / 1000;
  const offlineEvents = tick();
  renderResBar();
  render();
  handleEvents(offlineEvents);
  welcomeBack(before, awaySec);

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) return setTab(tab.dataset.tab);
    const btn = e.target.closest('[data-action]');
    if (btn && !btn.disabled) onAction(btn);
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && !battleTimer) closeModal();
  });

  let key = structureKey();
  setInterval(() => {
    const events = tick();
    handleEvents(events);
    const k = structureKey();
    if (k !== key && $('#modal').hidden) {
      key = k;
      render();
    } else {
      refresh();
    }
  }, 250);
  // анимация сцен базы и карты
  const frame = () => {
    if (!document.hidden) {
      if (currentTab === 'base') BaseScene.draw();
      if (currentTab === 'map') MapScene.draw();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);
  save();
}

document.addEventListener('DOMContentLoaded', init);
