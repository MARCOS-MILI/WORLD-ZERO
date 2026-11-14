/* ================= estado e armazenamento ================= */
function clone(o) { return JSON.parse(JSON.stringify(o)); }
/* Aplica um patch: null apaga a chave (é assim que se remove item ou lançamento do inventário). */
function deepMerge(a, b) {
  Object.keys(b).forEach(function (k) {
    var v = b[k];
    if (v === null) delete a[k];
    else if (v && typeof v === 'object' && !Array.isArray(v)) a[k] = deepMerge(a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? a[k] : {}, v);
    else a[k] = v;
  });
  return a;
}
/* Junta dois patches ainda não enviados, mantendo o null (marcador de apagar) para ir ao banco. */
function mergePatch(a, b) {
  Object.keys(b).forEach(function (k) {
    var v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) mergePatch(a[k], v);
    else a[k] = v && typeof v === 'object' ? clone(v) : v;
  });
  return a;
}
function nest(path, val) {
  var k = path.split('.'), o = {}, t = o;
  for (var i = 0; i < k.length - 1; i++) { t[k[i]] = {}; t = t[k[i]]; }
  t[k[k.length - 1]] = val;
  return o;
}
function blank() {
  var z = function () { return { car: '', con: '', des: '', 'for': '', int: '', pre: '' }; };
  return { id: '', tipo: 'pc', dono: '', criado: 0, nome: '', jogador: '', race: '', cls: '', nivel: '1', xp: '', base: { car: '0', con: '1', des: '2', 'for': '3', int: '4', pre: '5' }, rb: z(), up: z(),
    pvAtual: '', pmAtual: '', sanAtual: '', extra: { pv: '', pm: '', ca: '', cr: '', carga: '' }, over: { pv: '', pvd: '', pm: '', pmn: '', tr: '' }, pvMode: 'media', pvRolls: '',
    dtAttr: 'int', dado: 'd20', form: 'pg', per: {}, tal: [], q: {}, pontosIni: '', inv: '', gil: '', notas: '', itens: {}, caixa: {} };
}
function fix(f) {
  var b = blank();
  Object.keys(b).forEach(function (k) {
    if (f[k] === undefined || f[k] === null) f[k] = b[k];
    else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) f[k] = Object.assign({}, b[k], f[k]);
  });
  if (!Array.isArray(f.tal)) f.tal = [];
  return fixInv(f);
}
function exemplo() {
  var f = blank();
  Object.assign(f, { nome: 'Personagem de exemplo', jogador: 'Exemplo', race: 'Humano', cls: 'Guerreiro espadachim', nivel: '5', xp: '15000',
    notas: 'Ficha de exemplo para ver as contas funcionando. O mestre pode excluir.' });
  f.base = { car: '2', con: '3', des: '4', 'for': '5', int: '1', pre: '0' };
  f.rb.con = '1'; f.up['for'] = '1';
  f.per = { luta: 1, atletismo: 1 };
  f.inv = 'Espada longa, armadura de couro';
  return f;
}

/* Banco local: mesmo formato do banco compartilhado, usado quando a página abre fora do Claude. */
function LocalDB(ns, acl) {
  var self = this; this.k = 'wzdb:' + ns; this.acl = acl || null; this.subs = []; this.mem = null;
  window.addEventListener('storage', function (e) { if (e.key === self.k) self.emit(); });
}
LocalDB.prototype.read = function () { try { var r = window.localStorage.getItem(this.k); return r ? JSON.parse(r) : {}; } catch (e) { return this.mem ? JSON.parse(this.mem) : {}; } };
LocalDB.prototype.write = function (o) { var s = JSON.stringify(o); try { window.localStorage.setItem(this.k, s); } catch (e) { this.mem = s; } this.emit(); };
LocalDB.prototype.can = function (kind, path) { return !this.acl || this.acl[kind](path); };
LocalDB.prototype.snapDoc = function (path) {
  var d = this.read()[path], ok = d !== undefined && this.can('read', path);
  return { id: path.split('/').pop(), exists: ok, data: function () { return ok ? JSON.parse(JSON.stringify(d)) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } };
};
LocalDB.prototype.snapCol = function (path) {
  var self = this, all = this.read(), pre = path + '/';
  var docs = Object.keys(all).filter(function (p) { return p.indexOf(pre) === 0 && p.slice(pre.length).indexOf('/') < 0 && self.can('read', p); }).sort().map(function (p) { return self.snapDoc(p); });
  return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
};
LocalDB.prototype.sig = function (col, snap) { return JSON.stringify(col ? snap.docs.map(function (d) { return [d.id, d.data()]; }) : [snap.exists, snap.data()]); };
LocalDB.prototype.emit = function () {
  var self = this;
  this.subs.slice().forEach(function (s) {
    var snap = s.col ? self.snapCol(s.path) : self.snapDoc(s.path), sg = self.sig(s.col, snap);
    if (sg !== s.sig) { s.sig = sg; s.next(snap); }
  });
};
LocalDB.prototype.listen = function (path, col, next) {
  var self = this, s = { path: path, col: col, next: next, sig: null };
  this.subs.push(s);
  setTimeout(function () {
    if (self.subs.indexOf(s) < 0) return;
    var snap = col ? self.snapCol(path) : self.snapDoc(path); s.sig = self.sig(col, snap); next(snap);
  }, 0);
  return function () { self.subs = self.subs.filter(function (x) { return x !== s; }); };
};
LocalDB.prototype.doc = function (path) {
  var db = this;
  function deny() { var e = new Error('negado'); e.code = 'invalid_argument'; throw e; }
  return {
    id: path.split('/').pop(), path: path,
    get: function () { return Promise.resolve(db.snapDoc(path)); },
    set: function (data) { return new Promise(function (ok) { if (!db.can('write', path)) deny(); var a = db.read(); a[path] = clone(data); db.write(a); ok(); }); },
    update: function (data) { return new Promise(function (ok) { if (!db.can('write', path)) deny(); var a = db.read(); if (a[path] === undefined) deny(); a[path] = deepMerge(a[path], clone(data)); db.write(a); ok(); }); },
    delete: function () { return new Promise(function (ok) { if (!db.can('write', path)) deny(); var a = db.read(); delete a[path]; db.write(a); ok(); }); },
    onSnapshot: function (next) { return db.listen(path, false, next); }
  };
};
LocalDB.prototype.collection = function (path) {
  var db = this;
  return { path: path, doc: function (id) { return db.doc(path + '/' + (id || 'x' + uid())); }, onSnapshot: function (next) { return db.listen(path, true, next); }, get: function () { return Promise.resolve(db.snapCol(path)); } };
};

