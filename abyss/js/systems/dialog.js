// =====================================================================
// DIALOG SYSTEM. Показывает реплики DIALOG-* по одной; дальше — кнопкой
// действия или нажатием. Тексты берутся только из данных (js/data/dialogs.js).
// =====================================================================

AB.Dialog = (() => {
  let cur = null; // { def, i }

  function open(id) {
    const def = AB.ID.get(id);
    if (!def) return false;
    cur = { def, i: 0 };
    AB.Bus.emit('dialog:line', line());
    return true;
  }

  function line() {
    if (!cur) return null;
    const l = cur.def.lines[cur.i];
    const sp = AB.ID.get(l.speaker);
    return { id: cur.def.id, speaker: l.speaker, name: sp ? sp.name : l.speaker, text: l.text, pending: !!cur.def.pending, last: cur.i === cur.def.lines.length - 1 };
  }

  function next() {
    if (!cur) return;
    cur.i++;
    if (cur.i >= cur.def.lines.length) return close();
    AB.Bus.emit('dialog:line', line());
  }

  function close() {
    if (!cur) return;
    const id = cur.def.id;
    cur = null;
    AB.Bus.emit('dialog:end', { id });
  }

  return { open, next, close, line, isOpen: () => !!cur };
})();
