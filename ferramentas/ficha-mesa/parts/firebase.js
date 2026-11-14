/* ================= Firebase (versão do GitHub) ================= */
function fbConfigured() {
  var c = window.WZ_FIREBASE;
  return !!(c && c.apiKey && c.projectId && String(c.apiKey).indexOf('COLE') < 0 && window.firebase && firebase.firestore && firebase.auth);
}
function flatten(o, pre, out) {
  Object.keys(o).forEach(function (k) {
    var v = o[k], p = pre.concat(k);
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flatten(v, p, out); else out.push([p, v]);
  });
  return out;
}
/* Mesmo formato do banco do Claude. O update do Firestore troca mapas inteiros, então o patch vira caminhos de campo (FieldPath), que mexem só no que mudou.
   Valor null no patch = apagar o campo (FieldValue.delete), usado para remover item ou lançamento do inventário. */
function FireDB(fs, FP, FV) { this.fs = fs; this.FP = FP; this.FV = FV; }
FireDB.prototype.doc = function (path) {
  var FP = this.FP, FV = this.FV, ref = this.fs.doc(path);
  return {
    id: ref.id, path: path,
    get: function () { return ref.get(); },
    set: function (data, opt) { return opt ? ref.set(data, opt) : ref.set(data); },
    update: function (patch) {
      var pairs = flatten(patch, [], []), args = [];
      if (!pairs.length) return Promise.resolve();
      pairs.forEach(function (pr) { args.push(new FP(...pr[0]), pr[1] === null && FV ? FV.delete() : pr[1]); });
      return ref.update.apply(ref, args);
    },
    delete: function () { return ref.delete(); },
    onSnapshot: function (next, err) { return ref.onSnapshot(next, err); }
  };
};
FireDB.prototype.collection = function (path) {
  var ref = this.fs.collection(path);
  return { onSnapshot: function (next, err) { return ref.onSnapshot(next, err); } };
};

function fireNeedLogin(msg) {
  SES.mode = 'login'; SES.gm = false; SES.uid = null; SES.verifiedUid = null;
  RAW = { f: {}, n: {} }; SH = {}; sel = null; shown = null;
  banner('');
  setupUI();
  if (msg) setMsg('msg-login', 'bad', msg);
}
/* Descobre o papel da conta: mestre (consegue ler gm/notas) ou jogador (qualquer outra conta que entrou). */
function fireAccess(u) {
  return SES.fs.doc('gm/notas').get().then(function () { return { gm: true, ok: true }; }, function () { return { gm: false, ok: true }; });
}
function fireEnter(u, r) {
  if (SES.verifiedUid === u.uid && SES.mode === 'compartilhada') return;
  SES.verifiedUid = u.uid; SES.anon = !!u.isAnonymous; SES.gm = r.gm; SES.uid = u.uid; SES.canWrite = true; SES.known = true; SES.mode = 'compartilhada'; SES.loaded = false;
  setMsg('msg-login', '', '');
  setupUI(); subscribe();
}
/* Quem volta (sessão guardada no aparelho) entra direto. */
function fireVerify(u) {
  if (SES.verifyingUid === u.uid) return;
  SES.verifyingUid = u.uid;
  fireAccess(u).then(function (r) {
    SES.verifyingUid = null;
    fireEnter(u, r);
  });
}
/* Depois de entrar com o Google (ou sem conta): mestre e jogadores entram; o jogador ganha o próprio documento com o nome. */
function fireJoin(u) {
  SES.verifyingUid = u.uid;
  var end = function () { SES.verifyingUid = null; };
  var typed = $('#l-nome').value.trim().slice(0, 30);
  return fireAccess(u).then(function (r) {
    if (r.gm) { end(); fireEnter(u, r); return; }
    var nome = typed || String(u.displayName || '').trim().slice(0, 30);
    if (!nome) { end(); fireNeedLogin('Preencha o seu nome.'); return; }
    var ref = SES.fs.doc('fichas/' + u.uid);
    return ref.get().then(function (snap) {
      var d = snap.exists ? (snap.data() || {}) : {};
      if (snap.exists && d.nome && !typed) return;
      return ref.set({ nome: nome }, { merge: true });
    }).then(function () { end(); fireEnter(u, r); }, function (err) {
      end();
      var c = err && err.code;
      fireNeedLogin(c === 'permission-denied' ? 'Sem permissão no banco. Confira se as regras do Firestore foram publicadas.' : 'Não consegui entrar (' + (c || 'erro desconhecido') + ').');
    });
  });
}
function startFirebase() {
  try { firebase.initializeApp(window.WZ_FIREBASE); } catch (e) { }
  SES.fire = true; SES.auth = firebase.auth(); SES.fs = firebase.firestore();
  SES.db = new FireDB(SES.fs, firebase.firestore.FieldPath, firebase.firestore.FieldValue);
  SES.mode = 'carregando'; SES.known = true; renderNow();
  var to = setTimeout(function () { if (SES.mode === 'carregando') useLocal('Não consegui falar com o Firebase a tempo.'); }, 12000);
  SES.auth.onAuthStateChanged(function (u) {
    clearTimeout(to);
    if (SES.joining) return;
    if (!u) fireNeedLogin(''); else fireVerify(u);
  });
}
function googleErr(err) {
  SES.joining = false;
  var c = err && err.code;
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') { setMsg('msg-login', '', ''); return; }
  setMsg('msg-login', 'bad',
    c === 'auth/popup-blocked' ? 'O navegador bloqueou a janela do Google. Libere pop-ups para este site e tente de novo.' :
    c === 'auth/unauthorized-domain' ? 'Este endereço ainda não está liberado no Firebase (Authentication > Configurações > Domínios autorizados).' :
    c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation' ? 'Este tipo de login não está ligado no Firebase (Authentication > Método de login).' :
    c === 'auth/network-request-failed' ? 'Sem internet. Confira a conexão e tente de novo.' :
    c === 'auth/invalid-api-key' || c === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' ? 'A chave do Firebase (apiKey) em firebase-config.js está errada.' :
    'Não consegui entrar (' + (c || 'erro desconhecido') + ').');
}
$('#b-google').addEventListener('click', function () {
  if (!SES.fire) return;
  var p;
  SES.joining = true; setMsg('msg-login', 'info', 'Abrindo o login do Google...');
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  p = SES.auth.signInWithPopup(provider).then(function (c) { return c.user; });
  p.then(function (u) { SES.joining = false; setMsg('msg-login', 'info', 'Entrando...'); return fireJoin(u); }, googleErr);
});
$('#b-anon').addEventListener('click', function () {
  if (!SES.fire) return;
  var nome = $('#l-nome').value.trim();
  if (!nome) { setMsg('msg-login', 'bad', 'Preencha o seu nome.'); return; }
  SES.joining = true; setMsg('msg-login', 'info', 'Entrando...');
  var u0 = SES.auth.currentUser;
  (u0 ? Promise.resolve(u0) : SES.auth.signInAnonymously().then(function (c) { return c.user; })).then(function (u) {
    SES.joining = false; return fireJoin(u);
  }, googleErr);
});
var sairTimer = null;
$('#b-sair').addEventListener('click', function (e) {
  var b = e.currentTarget, hint = $('#sair-hint');
  if (SES.anon && !b.classList.contains('armed')) {
    b.classList.add('bad', 'armed'); b.textContent = 'Confirmar saída'; hint.hidden = false;
    clearTimeout(sairTimer);
    sairTimer = setTimeout(function () { b.classList.remove('bad', 'armed'); b.textContent = 'Sair da mesa'; hint.hidden = true; }, 7000);
    return;
  }
  clearTimeout(sairTimer);
  var done = function () { location.reload(); };
  if (SES.auth) SES.auth.signOut().then(done, done); else done();
});

