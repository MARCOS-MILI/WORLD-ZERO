/* ================= início ================= */
function setupUI() {
  var chip = $('#chip-role');
  chip.hidden = SES.mode === 'carregando' || SES.mode === 'login';
  var writer = SES.mode === 'local' || SES.gm || !!(SES.canWrite && SES.uid);
  chip.textContent = SES.mode === 'local' ? 'Modo local' : SES.gm ? 'Mestre' : writer ? 'Jogador' : 'Só leitura';
  chip.className = 'chip role' + (SES.gm ? '' : ' mut');
  if (SES.mode === 'compartilhada' && !writer) banner('Seu acesso é só de leitura. Peça ao mestre para liberar a edição para você.', 'warn', 'leitura');
  renderNow();
}
function useLocal(msg) {
  SES.mode = 'local'; SES.gm = true; SES.uid = 'local'; SES.canWrite = true; SES.known = true;
  SES.db = new LocalDB('local');
  banner(msg + ' Modo local: as fichas ficam só neste navegador.', 'info', 'local');
  setupUI(); subscribe();
}
function startSession() {
  var c = window.claude, done = false, to;
  if (!c || typeof c.use !== 'function') {
    if (window.WZ_FIREBASE) {
      if (fbConfigured()) { startFirebase(); return; }
      useLocal(window.firebase ? 'A mesa compartilhada ainda não foi configurada: falta colar a configuração do Firebase.' : 'Não consegui carregar o Firebase. Confira a internet.');
      return;
    }
    useLocal('Esta página não está conectada à mesa compartilhada.'); return;
  }
  to = setTimeout(function () { if (!done) { done = true; useLocal('O Claude não respondeu a tempo.'); } }, 10500);
  Promise.all([c.use('db'), c.use('user')]).then(function (r) {
    if (done) return; done = true; clearTimeout(to);
    if (!r[0]) { useLocal('Para ver a mesa compartilhada, entre no Claude e abra o link que o mestre mandou.'); return; }
    var u = r[1];
    SES.db = r[0]; SES.user = u; SES.mode = 'compartilhada';
    SES.gm = !!(u && typeof u.isOwner === 'function' && u.isOwner());
    return Promise.all([u && typeof u.id === 'function' ? u.id() : null, u && typeof u.can === 'function' ? u.can('data.write') : null]).then(function (v) {
      SES.uid = v[0] || null; SES.known = v[1] === true || v[1] === false; SES.canWrite = v[1] !== false;
      setupUI(); subscribe();
    });
  }).catch(function () { if (!done) { done = true; useLocal('Não consegui conectar à mesa.'); } });
}
buildSelects(); buildAttrs(); buildSkills(); buildQuals(); applyTema(); route();
window.__wzLocalDB = LocalDB;
window.__wz = { compute: compute, blank: blank, exemplo: exemplo, CLASSES: CLASSES, skillTotal: skillTotal, SES: SES, SH: function () { return SH; } };
startSession();
})();
