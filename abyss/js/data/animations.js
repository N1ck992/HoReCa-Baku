// =====================================================================
// Реестр анимаций (GDD §2.9, §11). Каждая анимация привязана к персонажу
// и действию. sheet — спрайт-лист из ASSET MANIFEST; пока его нет,
// ANIMATION MANAGER проигрывает процедурную заглушку с тем же ID.
// =====================================================================

AB.ANIMATIONS = [
  { id: 'ANIM-CHAR001-01', owner: 'CHAR-001', action: 'walk',     loop: true,  sheet: null, desc: 'Ходьба' },
  { id: 'ANIM-CHAR001-02', owner: 'CHAR-001', action: 'run',      loop: true,  sheet: null, desc: 'Бег' },
  { id: 'ANIM-CHAR001-03', owner: 'CHAR-001', action: 'interact', loop: false, sheet: null, desc: 'Взаимодействие', duration: 0.7 },
  { id: 'ANIM-CHAR001-04', owner: 'CHAR-001', action: 'hurt',     loop: false, sheet: null, desc: 'Получение урона', duration: 0.5 },
  // Добавлены для этапов 2–3, ждут утверждения (в GDD v0.1 их нет):
  { id: 'ANIM-CHAR001-05', owner: 'CHAR-001', action: 'idle',     loop: true,  sheet: null, desc: 'Ожидание (дыхание)', pending: true },
  { id: 'ANIM-CHAR001-06', owner: 'CHAR-001', action: 'wake',     loop: false, sheet: null, desc: 'Выход из криокапсулы', duration: 3.2, pending: true },
];

AB.ANIMATIONS.forEach((a) => AB.ID.register(a.id, a));
