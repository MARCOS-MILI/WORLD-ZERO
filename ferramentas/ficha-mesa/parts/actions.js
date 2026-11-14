/* ================= sessão e dados compartilhados ================= */
var TIPO = { pc: 'Jogador', npc: 'NPC', inimigo: 'Inimigo', aliado: 'Aliado' };
var noop = function () { };
var SES = { mode: 'carregando', gm: false, uid: null, db: null, user: null, canWrite: true, known: false, names: {}, loaded: false };
var RAW = { f: {}, n: {} }, SH = {}, sel = null, shown = null, gmNotes = '';
var pend = {}, timers = {}, flying = {}, dirty = {}, fil = '', bannerKind = '', notesTimer = null, toastTimer = null, tipoFor = '';

function cur() { var s = SH[sel]; return s ? s.data : null; }
function curPage() { var h = (location.hash || '').replace('#', ''); return PAGES.indexOf(h) < 0 ? 'mesa' : h; }
function canCreate() { return SES.mode === 'local' || SES.gm || !!(SES.canWrite && SES.uid); }
function canEdit(s) {
  if (!s) return false;
  if (SES.mode === 'local' || SES.gm) return true;
  return !!(SES.canWrite && SES.uid && s.store === 'f' && s.owner === SES.uid);
}
function myTarget(kind) {
  if (SES.gm || SES.mode === 'local') return kind === 'npc' ? { store: 'n', owner: '' } : { store: 'f', owner: 'mesa' };
  return SES.canWrite && SES.uid ? { store: 'f', owner: SES.uid } : null;
}
function ownerLabel(s) {
  if (s.store === 'n') return 'Só o mestre vê';
  if (s.owner === 'mesa') return s.data.jogador || 'Mestre';
  if (SES.uid && s.owner === SES.uid) return 'Você';
  return SES.names[s.owner] || s.data.jogador || 'Jogador';
}

function banner(text, kind, tag) { bannerKind = text ? (tag || kind || 'info') : ''; setMsg('banner', kind || 'info', text || ''); }
function status(t) { setT('sync', t); }
function flash(t) {
  var e = document.getElementById('toast');
  if (!e) { e = document.createElement('div'); e.id = 'toast'; e.className = 'toast'; e.setAttribute('role', 'status'); document.body.appendChild(e); }
  e.textContent = t; e.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { e.hidden = true; }, 3200);
}

/* ---- dados crus -> fichas ---- */
function rebuild() {
  var next = {};
  Object.keys(RAW.f).forEach(function (owner) {
    var ch = (RAW.f[owner] && RAW.f[owner].chars) || {};
    Object.keys(ch).forEach(function (cid) {
      var key = 'f|' + owner + '|' + cid;
      next[key] = (dirty[key] && SH[key]) ? SH[key] : { key: key, store: 'f', owner: owner, id: cid, data: fix(clone(ch[cid])) };
    });
  });
  Object.keys(RAW.n).forEach(function (cid) {
    var key = 'n||' + cid;
    next[key] = (dirty[key] && SH[key]) ? SH[key] : { key: key, store: 'n', owner: '', id: cid, data: fix(clone(RAW.n[cid])) };
  });
  SH = next;
}
function putRaw(store, owner, id, data) {
  if (store === 'n') RAW.n[id] = clone(data);
  else { var d = RAW.f[owner] || (RAW.f[owner] = {}); (d.chars || (d.chars = {}))[id] = clone(data); }
}
function delRaw(store, owner, id) {
  if (store === 'n') delete RAW.n[id];
  else if (RAW.f[owner] && RAW.f[owner].chars) delete RAW.f[owner].chars[id];
}
function patchRaw(s, patch) {
  if (s.store === 'n') { if (RAW.n[s.id]) deepMerge(RAW.n[s.id], clone(patch)); }
  else if (RAW.f[s.owner] && RAW.f[s.owner].chars && RAW.f[s.owner].chars[s.id]) deepMerge(RAW.f[s.owner].chars[s.id], clone(patch));
}
function resolveNames() {
  var u = SES.user; if (!u || typeof u.profiles !== 'function') return;
  var ids = {};
  Object.keys(SH).forEach(function (k) { var o = SH[k].owner; if (o && o !== 'mesa' && !(o in SES.names)) ids[o] = 1; });
  var list = Object.keys(ids); if (!list.length) return;
  list.forEach(function (i) { SES.names[i] = ''; });
  Promise.resolve(u.profiles(list)).then(function (ps) {
    var any = false;
    list.forEach(function (i) { var n = ps && ps[i] && ps[i].name; if (n) { SES.names[i] = n; any = true; } });
    if (any) renderNow();
  }).catch(noop);
}

/* ---- escrita ---- */
function writeFailed(e) {
  var code = e && e.code;
  status('Não salvou');
  if (code === 'invalid_argument' && !SES.known) { SES.canWrite = false; setupUI(); }
  flash(code === 'quota_exceeded' || code === 'resource-exhausted' ? 'O limite gratuito de dados da mesa foi atingido por hoje.' : code === 'permission-denied' ? 'Sem permissão para salvar isso. Só o dono da ficha e o mestre editam.' : 'Não consegui salvar. Confira se você tem permissão para editar.');
}
function writePatch(s, patch) {
  if (s.store === 'n') return SES.db.doc('npcs/' + s.id).update(patch);
  var o = {}; o[s.id] = patch;
  return SES.db.doc('fichas/' + s.owner).update({ chars: o });
}
function queue(s, patch) {
  dirty[s.key] = true; pend[s.key] = mergePatch(pend[s.key] || {}, patch);
  clearTimeout(timers[s.key]); timers[s.key] = setTimeout(function () { flush(s.key); }, 450);
  status('Salvando...');
}
function flush(key) {
  if (flying[key]) return;
  var patch = pend[key]; if (!patch) return;
  var s = SH[key]; pend[key] = null;
  if (!s) { dirty[key] = false; return; }
  flying[key] = true;
  Promise.resolve().then(function () { return writePatch(s, patch); }).then(function () { patchRaw(s, patch); status('Salvo'); }, writeFailed).then(function () {
    flying[key] = false;
    if (pend[key]) flush(key); else { dirty[key] = false; rebuild(); renderNow(); }
  });
}
function editSheet(key, path, value) {
  var s = SH[key]; if (!s || !canEdit(s)) return;
  if (value === null) unsetPath(s.data, path); else setPath(s.data, path, value && typeof value === 'object' ? clone(value) : value);
  queue(s, nest(path, value));
}
/* inventário: na Mesa grava na ficha aberta com as mesmas permissões das outras edições */
function invCan() { return canEdit(SH[sel]); }
function invSet(path, value) { editSheet(sel, path, value); }
function invWho() { return SES.mode === 'local' ? '' : SES.gm ? 'Mestre' : (SES.names[SES.uid] || 'Jogador'); }
function createSheet(store, owner, data) {
  var id = 'c' + uid(); data.id = id; data.criado = Date.now();
  var key = store === 'n' ? 'n||' + id : 'f|' + owner + '|' + id, p;
  if (store === 'n') p = SES.db.doc('npcs/' + id).set(data);
  else {
    var ref = SES.db.doc('fichas/' + owner);
    p = ref.get().then(function (snap) { var o = {}; o[id] = data; return snap.exists ? ref.update({ chars: o }) : ref.set({ chars: o }); });
  }
  putRaw(store, owner, id, data); rebuild();
  return p.then(function () { return key; }, function (e) { delRaw(store, owner, id); rebuild(); writeFailed(e); throw e; });
}
function deleteSheet(s) {
  var p;
  if (s.store === 'n') p = SES.db.doc('npcs/' + s.id).delete();
  else {
    var ref = SES.db.doc('fichas/' + s.owner);
    p = ref.get().then(function (snap) { if (!snap.exists) return; var d = clone(snap.data()); if (d.chars) delete d.chars[s.id]; return ref.set(d); });
  }
  return p.then(function () { delRaw(s.store, s.owner, s.id); rebuild(); }, function (e) { writeFailed(e); throw e; });
}
function openSheet(key) {
  sel = key; shown = null;
  try { window.localStorage.setItem('wz-sel', key); } catch (e) { }
  if (curPage() === 'ficha') renderFicha(); else location.hash = '#ficha';
}
function newSheet(kind) {
  var t = myTarget(kind);
  if (!t) { flash('Você não tem permissão para criar fichas aqui.'); return; }
  var f = blank(); f.tipo = kind === 'npc' ? 'npc' : 'pc'; f.dono = t.owner === 'mesa' ? '' : t.owner;
  createSheet(t.store, t.owner, f).then(openSheet, noop);
}

/* ---- leitura ao vivo ---- */
function onErr(e) {
  var c = e && e.code;
  if (c === 'revoked') banner('O seu acesso a esta mesa foi retirado.', 'warn');
  else if (c === 'permission-denied' && SES.fire) fireNeedLogin('Seu acesso à mesa não está liberado. Entre de novo com o código da mesa.');
  else banner('Não consegui ler os dados da mesa agora. Recarregue a página em instantes.', 'bad');
}
function changed() {
  Object.keys(RAW.f).forEach(function (o) { var n = RAW.f[o] && RAW.f[o].nome; if (n && o !== 'mesa') SES.names[o] = String(n); });
  rebuild(); resolveNames();
  if (SES.loaded) {
    if (!sel) { try { var k = window.localStorage.getItem('wz-sel'); if (k && SH[k]) sel = k; } catch (e) { } }
    if (sel && !SH[sel]) { sel = null; shown = null; }
  }
  renderNow();
}
function subscribe() {
  var timer = setTimeout(function () { if (!SES.loaded) banner('A mesa ainda não respondeu. O que aparece pode estar desatualizado.', 'warn', 'timeout'); }, 10000);
  function got(snap) {
    if (!snap.metadata || !snap.metadata.fromCache) { SES.loaded = true; clearTimeout(timer); if (bannerKind === 'timeout') banner(''); }
  }
  SES.db.collection('fichas').onSnapshot(function (snap) {
    got(snap); RAW.f = {};
    snap.docs.forEach(function (d) { RAW.f[d.id] = clone(d.data() || {}); });
    changed();
  }, onErr);
  if (SES.gm) {
    SES.db.collection('npcs').onSnapshot(function (snap) {
      RAW.n = {};
      snap.docs.forEach(function (d) { RAW.n[d.id] = clone(d.data() || {}); });
      changed();
    }, onErr);
    SES.db.doc('gm/notas').onSnapshot(function (snap) {
      gmNotes = snap.exists ? String((snap.data() || {}).texto || '') : '';
      var ta = $('#gm-notas'); if (ta && document.activeElement !== ta && ta.value !== gmNotes) ta.value = gmNotes;
    }, onErr);
  }
}

/* ---- telas ---- */
function renderNow() { var p = curPage(); if (p === 'mesa') renderMesa(); else if (p === 'ficha') renderFicha(); }
function listSheets(pred) {
  var t = norm(fil);
  return Object.keys(SH).map(function (k) { return SH[k]; }).filter(pred).filter(function (s) {
    if (!t) return true; var f = s.data;
    return norm([f.nome, f.race, f.cls, f.jogador, ownerLabel(s)].join(' ')).indexOf(t) >= 0;
  }).sort(function (a, b) { return String(a.data.nome || '').localeCompare(String(b.data.nome || ''), 'pt'); });
}
function bar(kind, cur, max, label) {
  var p = max ? cl(Math.round(cur / max * 100), 0, 100) : 0;
  var k = kind === 'pv' ? (p < 25 ? ' bad' : p < 50 ? ' warn' : '') : ' pm';
  return '<div class="mbar' + k + '" role="img" aria-label="' + label + ' ' + cur + ' de ' + (max == null ? '?' : max) + '"><span style="width:' + p + '%"></span><em>' + label + ' ' + cur + (max == null ? '' : '/' + max) + '</em></div>';
}
function sheetCard(s) {
  var f = s.data, c = compute(f), ed = canEdit(s);
  var pvc = has(f.pvAtual) ? num(f.pvAtual) : (c.pv == null ? 0 : c.pv);
  var pmc = has(f.pmAtual) ? num(f.pmAtual) : (c.pm == null ? 0 : c.pm);
  var k = esc(s.key), tp = TIPO[f.tipo] || 'Jogador';
  var h = '<article class="mcard' + (SES.uid && s.owner === SES.uid ? ' mine' : '') + '" data-open="' + k + '">' +
    '<div class="mc-top"><button type="button" class="mc-open" data-open="' + k + '">' + esc(f.nome || 'Sem nome') + '</button><span class="chip' + (f.tipo === 'pc' || !f.tipo ? '' : ' mut') + '">' + tp + '</span></div>' +
    '<div class="mc-sub">' + esc((f.race || 'Sem raça') + ' · ' + (f.cls || 'Sem classe') + ' · Nv ' + c.L) + '<br>' + esc(ownerLabel(s)) + '</div>' +
    (c.pv == null && !has(f.pvAtual) ? '<div class="mbar"><em>PV: escolha uma classe</em></div>' : bar('pv', pvc, c.pv, 'PV')) + (c.pm != null ? bar('pm', pmc, c.pm, 'PM') : '') +
    '<div class="mc-stats"><span>CA ' + c.ca + '</span><span>CR ' + c.cr + '</span><span>DT ' + c.dt + '</span><span>LCM ' + c.lcm + '</span><span>Gil ' + fGil(saldoGil(f)) + '</span></div>';
  if (ed) {
    var b = function (what, d, lab, al) { return '<button type="button" class="btn" data-k="' + k + '" data-adj="' + what + '" data-d="' + d + '" aria-label="' + al + '">' + lab + '</button>'; };
    h += '<div class="mc-adj"><span class="lab">PV</span>' + b('pv', -5, '−5', 'PV menos 5') + b('pv', -1, '−1', 'PV menos 1') + b('pv', 1, '+1', 'PV mais 1') + b('pv', 5, '+5', 'PV mais 5') + '</div>' +
      (c.pm != null ? '<div class="mc-adj"><span class="lab">PM</span>' + b('pm', -1, '−1', 'PM menos 1') + b('pm', 1, '+1', 'PM mais 1') + '</div>' : '');
  }
  return h + '</article>';
}
function group(title, list, empty) {
  if (!list.length && !empty) return '';
  return '<div class="sec"><h2>' + title + ' <span class="small">(' + list.length + ')</span></h2>' +
    (list.length ? '<div class="mgrid">' + list.map(sheetCard).join('') + '</div>' : '<p class="hint">' + empty + '</p>') + '</div>';
}
function adjust(key, what, d) {
  var s = SH[key]; if (!s || !canEdit(s)) return;
  var c = compute(s.data), f = s.data, field = what === 'pv' ? 'pvAtual' : 'pmAtual', max = what === 'pv' ? c.pv : c.pm;
  var curv = has(f[field]) ? num(f[field]) : (max == null ? 0 : max);
  var nv = Math.max(0, curv + d); if (max != null) nv = Math.min(nv, max);
  editSheet(key, field, String(nv)); renderNow();
}
function renderMesa() {
  var lg = $('#login'), login = SES.mode === 'login';
  if (lg) lg.hidden = !login;
  $('#mesa-acc').hidden = !(SES.fire && SES.mode === 'compartilhada');
  var sb = $('#b-sair'); if (!sb.classList.contains('armed')) sb.textContent = SES.gm ? 'Sair (mestre)' : 'Sair da mesa';
  $('#mesa-busca').hidden = login;
  if (login) {
    setT('mesa-lede', 'Entre para ver as fichas da mesa.');
    $('#mesa-new').innerHTML = ''; $('#mesa-body').innerHTML = ''; $('#mesa-notas').hidden = true;
    return;
  }
  var gm = SES.gm || SES.mode === 'local', me = SES.uid, h = '';
  var lede = SES.mode === 'carregando' ? 'Conectando à mesa...' :
    gm ? 'Você é o mestre: vê e edita todas as fichas e guarda NPCs ocultos, que os jogadores não veem.' :
      'Aqui estão as fichas da mesa. Você edita as suas; as dos outros ficam só para ver.';
  setT('mesa-lede', lede);
  var nb = '';
  if (SES.mode !== 'carregando') {
    if (gm) nb = '<button class="btn pri" type="button" data-new="pc">Nova ficha de jogador</button><button class="btn" type="button" data-new="npc">Novo NPC</button>';
    else if (canCreate()) nb = '<button class="btn pri" type="button" data-new="pc">Nova ficha</button>';
  }
  var nbEl = $('#mesa-new'); if (nbEl.innerHTML !== nb) nbEl.innerHTML = nb;
  $('#mesa-notas').hidden = !gm || SES.mode === 'carregando';
  if (SES.mode === 'carregando' || (SES.mode === 'compartilhada' && !SES.loaded)) { $('#mesa-body').innerHTML = '<p class="hint">Carregando as fichas...</p>'; return; }
  if (gm) {
    h += group('Jogadores', listSheets(function (s) { return s.store === 'f' && (s.data.tipo || 'pc') === 'pc'; }), fil ? '' : 'Ainda não tem ficha de jogador. Cada jogador cria a dele ao abrir o link, ou você cria uma em "Nova ficha de jogador".');
    h += group('Na mesa (jogadores veem)', listSheets(function (s) { return s.store === 'f' && (s.data.tipo || 'pc') !== 'pc'; }), '');
    h += group('NPCs ocultos (só você vê)', listSheets(function (s) { return s.store === 'n'; }), fil ? '' : 'Nenhum NPC oculto. Use "Novo NPC" para criar um e depois "Mostrar aos jogadores" quando quiser revelar.');
  } else {
    h += group('Minhas fichas', listSheets(function (s) { return s.store === 'f' && s.owner === me; }), fil ? '' : (canCreate() ? 'Você ainda não tem ficha. Toque em "Nova ficha".' : 'Você está só olhando: seu acesso não permite criar fichas.'));
    h += group('Outros jogadores', listSheets(function (s) { return s.store === 'f' && s.owner !== me && (s.data.tipo || 'pc') === 'pc'; }), '');
    h += group('NPCs e aliados da mesa', listSheets(function (s) { return s.store === 'f' && s.owner !== me && (s.data.tipo || 'pc') !== 'pc'; }), '');
  }
  if (fil && !h) h = '<p class="hint">Nada encontrado para "' + esc(fil) + '".</p>';
  var body = $('#mesa-body'); if (body.innerHTML !== h) body.innerHTML = h;
}

function loadForm(skip) {
  var f = cur(), ae = document.activeElement;
  $$('[data-bind]').forEach(function (el) {
    if (skip && el === ae) return;
    var v = getPath(f, el.dataset.bind);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : String(v);
  });
  $$('[data-q]').forEach(function (el) { if (!(skip && el === ae)) el.checked = !!f.q[el.dataset.q]; });
}
function applyAccess(s) {
  var ed = canEdit(s);
  $$('#p-ficha [data-bind], #p-ficha [data-sk], #p-ficha [data-q], #p-ficha [data-tal]').forEach(function (el) { el.disabled = !ed; });
  $('#backup-sec').hidden = !ed;
}
function updateToolbar(s) {
  var f = s.data, ed = canEdit(s), hid = s.store === 'n', mesa = s.store === 'f' && s.owner === 'mesa';
  setT('tb-title', f.nome || 'Sem nome'); setT('tb-tipo', TIPO[f.tipo] || 'Jogador'); setT('tb-owner', ownerLabel(s)); setT('tb-mode', ed ? 'Você pode editar' : 'Só leitura');
  $('#tb-mode').className = 'chip' + (ed ? '' : ' mut');
  var rv = $('#b-reveal'); rv.hidden = !(SES.gm && (hid || (mesa && f.tipo !== 'pc')));
  rv.textContent = hid ? 'Mostrar aos jogadores' : 'Ocultar dos jogadores';
  $('#b-del').hidden = !ed;
  var dp = $('#b-dup'); dp.hidden = !(ed || canCreate()); dp.textContent = ed ? 'Duplicar' : 'Copiar para mim';
  var tw = $('#tb-tipo-wrap'); tw.hidden = !(((SES.gm || SES.mode === 'local')) && (hid || mesa));
  var tf = hid ? 'n' : 'f';
  if (tipoFor !== tf) {
    tipoFor = tf;
    $('#sel-tipo').innerHTML = (hid ? ['npc', 'inimigo', 'aliado'] : ['pc', 'npc', 'inimigo', 'aliado']).map(function (t) { return '<option value="' + t + '">' + TIPO[t] + '</option>'; }).join('');
    $('#sel-tipo').value = f.tipo || 'pc';
  }
  setMsg('msg-ro', 'info', ed ? '' : 'Você está só olhando esta ficha. Só o dono dela e o mestre editam.');
}
function renderFicha() {
  var s = SH[sel], empty = $('#ficha-empty'), body = $('#ficha-body'), tb = $('#tb');
  if (!s) { empty.hidden = false; body.hidden = true; tb.hidden = true; return; }
  empty.hidden = true; body.hidden = false; tb.hidden = false;
  var fresh = shown !== sel;
  if (fresh) { shown = sel; talCount = -1; habKey = ''; showAll = false; tipoFor = ''; $('#out-json').value = ''; $('#in-json').value = ''; setMsg('msg-copy', '', ''); setMsg('msg-imp', '', ''); }
  loadForm(!fresh);
  recalc();
  $$('.tal input').forEach(function (el) { if (el !== document.activeElement) el.value = s.data.tal[+el.dataset.tal] || ''; });
  updateToolbar(s);
  applyAccess(s);
}

/* ---- eventos ---- */
document.addEventListener('input', function (e) {
  var t = e.target, s = SH[sel];
  if (t.id === 'mesa-filtro') { fil = t.value; renderMesa(); return; }
  if (t.id === 'gm-notas') {
    clearTimeout(notesTimer); var v = t.value;
    notesTimer = setTimeout(function () { SES.db.doc('gm/notas').set({ texto: v }).catch(writeFailed); }, 700);
    return;
  }
  if (!s || !canEdit(s) || !t.closest('#p-ficha')) return;
  if (t.matches('[data-bind]')) { editSheet(sel, t.dataset.bind, t.type === 'checkbox' ? t.checked : t.value); recalc(); updateToolbar(s); }
  else if (t.matches('[data-sk]')) { editSheet(sel, 'per.' + t.dataset.sk, +t.value); recalc(); }
  else if (t.matches('[data-q]')) { editSheet(sel, 'q.' + t.dataset.q, t.checked); recalc(); }
  else if (t.matches('[data-tal]')) {
    var arr = (s.data.tal || []).slice(), n = Math.floor((compute(s.data).L + 1) / 2);
    for (var i = 0; i < n; i++) arr[i] = arr[i] || '';
    arr[+t.dataset.tal] = t.value; s.data.tal = arr; queue(s, { tal: arr });
  }
});
document.addEventListener('click', function (e) {
  var adj = e.target.closest('[data-adj]');
  if (adj) { adjust(adj.dataset.k, adj.dataset.adj, +adj.dataset.d); return; }
  var nw = e.target.closest('[data-new]');
  if (nw) { newSheet(nw.dataset.new); return; }
  var op = e.target.closest('[data-open]');
  if (op && !e.target.closest('input,select,textarea,a')) openSheet(op.dataset.open);
});
$('#b-back').addEventListener('click', function () { location.hash = '#mesa'; });
$('#b-empty').addEventListener('click', function () { location.hash = '#mesa'; });
$('#b-dup').addEventListener('click', function () {
  var s = SH[sel]; if (!s) return;
  var d = clone(s.data), own = canEdit(s), t = own ? { store: s.store, owner: s.owner } : myTarget('pc');
  if (!t) { flash('Você não tem permissão para criar fichas aqui.'); return; }
  d.nome = (d.nome || 'Sem nome') + (own ? ' (cópia)' : ''); d.criado = 0;
  if (!own) { d.tipo = 'pc'; d.dono = t.owner; }
  createSheet(t.store, t.owner, d).then(openSheet, noop);
});
var delTimer = null;
$('#b-del').addEventListener('click', function (e) {
  var b = e.currentTarget, s = SH[sel];
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.textContent = 'Confirmar exclusão'; clearTimeout(delTimer);
    delTimer = setTimeout(function () { b.classList.remove('armed'); b.textContent = 'Excluir'; }, 4000); return;
  }
  clearTimeout(delTimer); b.classList.remove('armed'); b.textContent = 'Excluir';
  if (!s) return;
  deleteSheet(s).then(function () { sel = null; shown = null; location.hash = '#mesa'; renderNow(); }, noop);
});
$('#b-reveal').addEventListener('click', function () {
  var s = SH[sel]; if (!s || !SES.gm) return;
  var toHidden = s.store === 'f';
  createSheet(toHidden ? 'n' : 'f', toHidden ? '' : 'mesa', clone(s.data)).then(function (key) {
    return deleteSheet(s).then(function () { openSheet(key); flash(toHidden ? 'Ficha oculta dos jogadores.' : 'Ficha visível para os jogadores.'); });
  }, noop);
});
$('#b-allhab').addEventListener('click', function () { showAll = !showAll; recalc(); });
$('#b-copy').addEventListener('click', function () {
  var ta = $('#out-json'); ta.value = JSON.stringify({ v: 1, ficha: cur() });
  var fallback = function () { ta.focus(); ta.select(); setMsg('msg-copy', 'info', 'Não consegui copiar sozinho. O texto está selecionado: copie manualmente.'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(function () { setMsg('msg-copy', 'ok', 'Ficha copiada.'); }, fallback);
  else fallback();
});
$('#b-imp').addEventListener('click', function () {
  var txt = $('#in-json').value.trim();
  if (!txt) { setMsg('msg-imp', 'bad', 'Cole o texto de uma ficha primeiro.'); return; }
  var t = myTarget('npc') && (SES.gm || SES.mode === 'local') ? myTarget('npc') : myTarget('pc');
  if (!t) { setMsg('msg-imp', 'bad', 'Você não tem permissão para criar fichas.'); return; }
  try {
    var o = JSON.parse(txt), g = o && o.ficha ? o.ficha : o;
    if (!g || typeof g !== 'object' || (!g.base && !g.cls && !g.nome)) throw new Error('x');
    g = fix(g); g.nome = g.nome || 'Ficha importada';
    if (t.store === 'f' && t.owner !== 'mesa') { g.tipo = 'pc'; g.dono = t.owner; } else if (t.store === 'n' && g.tipo === 'pc') g.tipo = 'npc';
    createSheet(t.store, t.owner, g).then(function (key) { $('#in-json').value = ''; openSheet(key); flash('Ficha "' + g.nome + '" importada' + (t.store === 'n' ? ' como NPC oculto.' : '.')); }, noop);
  } catch (err) { setMsg('msg-imp', 'bad', 'Esse texto não parece uma ficha do World Zero.'); }
});
function useOnSheet(field, value) {
  var s = SH[sel];
  if (!s || !canEdit(s)) { flash('Abra uma ficha que você pode editar (aba Mesa) para usar isso.'); return; }
  editSheet(sel, field, value); location.hash = '#ficha'; renderNow();
}

