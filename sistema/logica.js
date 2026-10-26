/* Sistema de Controle de Estoque & CMV — JG Consultoria (V12.1)
   As regras seguem as fórmulas da planilha CONTROLE DE ESTOQUE E CMV v12.1.
   Os dados ficam salvos no navegador (IndexedDB) e podem ser exportados/importados em backup .json. */
var DADOS_PLANILHA = __DADOS_PLANILHA__;
var DB_NAME = 'jg-estoque-cmv', DB_STORE = 'dados', DB_KEY = 'atual', LS_KEY = 'jg-estoque-cmv';
var MOTIVOS = ['Vencido', 'Estragou', 'Queda/Quebra', 'Erro de preparo', 'Sobra descartada', 'Outros'];
var UNIDADES = ['kg', 'g', 'L', 'ml', 'und', 'cx', 'pct'];
var MAX_INS = 300, MAX_CATS = 10, N_FICHAS = 100, N_ING = 20, N_EMB = 5, N_PREP = 15;

var numIn = function (v) { return v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 6, useGrouping: false }); };
var pctIn = function (v) { return v == null || v === '' ? '' : numIn(Math.round(v * 100000) / 1000) + '%'; };
var rep = function (n, f) { var a = []; for (var k = 0; k < n; k++) a.push(f(k)); return a; };

function novaFicha() {
  return { nome: '', cat: '', rev: '', rend: '1', peso: '', preco: '', meta: '30%',
    ings: rep(N_ING, function () { return { cod: '', q: '' }; }), embs: rep(N_EMB, function () { return { cod: '', q: '' }; }),
    taxa: ['', ''], precoApp: ['', ''], prep: rep(N_PREP, function () { return ''; }), obs: '', foto: '' };
}
function novoManual(id) { return { id: id, nome: 'Novo produto', cat: '', desc: '', obs: '', steps: [{ id: id + 's0', titulo: '', desc: '', foto: '' }] }; }
function semanaVazia() { return { ini: '', fim: '', fat: '', meta: '35%', rows: {} }; }

/* dados iniciais = o que está na planilha */
function dbInicial() {
  var P = JSON.parse(JSON.stringify(DADOS_PLANILHA));
  return {
    v: 1, origem: P.origem,
    cfg: { nome: '', mes: P.cfg.mes, metaMes: pctIn(P.cfg.metaMes), metaCmc: pctIn(P.cfg.metaCmc), ordem: 'cad',
      est: { dias: numIn(P.cfg.est.dias), prazo: numIn(P.cfg.est.prazo), margem: pctIn(P.cfg.est.margem), cob: numIn(P.cfg.est.cob) },
      apps: P.cfg.apps.map(function (a) { return { nome: a.nome, com: pctIn(a.com), pag: pctIn(a.pag) }; }), embCat: P.cfg.embCat },
    cats: P.cats, ins: P.ins,
    weeks: P.weeks.map(function (w) { return { ini: w.ini, fim: w.fim, fat: w.fat, meta: pctIn(w.meta), rows: w.rows }; }),
    lanc: P.lanc, perd: P.perd, notas: P.notas, prazo: P.prazo,
    fichas: P.fichas.map(function (f) { return f ? Object.assign(novaFicha(), f, { meta: pctIn(f.meta) }) : null; }),
    mans: [novoManual('m1')], logo: '', manModels: { painel: true }, manCust: {}, manPrint: {}, manInv: true
  };
}
/* completa campos que faltarem (backup de versão antiga, etc.) */
function migrar(d) {
  var b = dbInicial();
  d = Object.assign({}, b, d);
  d.cfg = Object.assign({}, b.cfg, d.cfg); d.cfg.est = Object.assign({}, b.cfg.est, d.cfg.est);
  while (d.weeks.length < 5) d.weeks.push(semanaVazia());
  d.weeks.forEach(function (w) { if (!w.rows) w.rows = {}; });
  while (d.fichas.length < N_FICHAS) d.fichas.push(null);
  if (!d.mans || !d.mans.length) d.mans = [novoManual('m1')];
  return d;
}

/* ---------- gravação no navegador ---------- */
function idb(mode, fn) {
  return new Promise(function (res, rej) {
    if (!window.indexedDB) { rej(new Error('IndexedDB indisponível')); return; }
    var rq = window.indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore(DB_STORE); };
    rq.onerror = function () { rej(rq.error); };
    rq.onsuccess = function () {
      var con = rq.result, tx = con.transaction(DB_STORE, mode), r = fn(tx.objectStore(DB_STORE)), out;
      if (r) r.onsuccess = function () { out = r.result; };
      tx.oncomplete = function () { con.close(); res(out); };
      tx.onerror = tx.onabort = function () { con.close(); rej(tx.error); };
    };
  });
}
function carregarDados() {
  return idb('readonly', function (s) { return s.get(DB_KEY); }).catch(function () {
    try { var t = window.localStorage.getItem(LS_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  });
}
function gravarDados(d) {
  return idb('readwrite', function (s) { return s.put(d, DB_KEY); }).catch(function () {
    window.localStorage.setItem(LS_KEY, JSON.stringify(d));
  });
}
/* foto -> dataURL reduzida (para caber no armazenamento do navegador) */
function lerFoto(e, maxLado, cb) {
  var f = e.target.files && e.target.files[0];
  if (!f) return;
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var s = Math.min(1, maxLado / Math.max(img.width, img.height));
      var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () { cb(fr.result); };
    img.src = fr.result;
  };
  fr.readAsDataURL(f);
  e.target.value = '';
}
function baixarArquivo(nome, texto, tipo) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

class Component extends DCLogic {
  constructor(props) {
    super(props);
    var hoje = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    this.hoje = p2(hoje.getDate()) + '/' + p2(hoje.getMonth() + 1) + '/' + hoje.getFullYear();
    this.state = {
      db: dbInicial(), loaded: false, savedAt: null, saveErr: false,
      screen: 'como', cmvW: 0, prodW: -1, perdW: -1, ft: 0, cat: 'Todas', showEmpty: false, tipoF: 'Todos', estF: 'Todos', msg: '',
      form: { tipo: 'Entrada', data: this.hoje, cod: '', qtd: '', resp: '' },
      pform: { data: this.hoje, cod: '', qtd: '', motivo: 'Vencido' },
      nota: { data: this.hoje, forn: '', nf: '', cat: '', valor: '', obs: '' },
      novo: { nome: '', un: 'kg', rende: '1', compra: '', cat: '', after: '' },
      novaCat: { nome: '', cmv: 'Não' }
    };
  }
  componentDidMount() {
    var self = this;
    carregarDados().then(function (d) {
      if (d && d.ins && d.weeks) self.setState({ db: migrar(d), loaded: true });
      else { self.setState({ loaded: true }); self.persist(); }
    });
  }
  componentWillUnmount() { clearTimeout(this._st); clearTimeout(this._tt); }
  persist() {
    var self = this;
    clearTimeout(this._st);
    this._st = setTimeout(function () {
      gravarDados(self.state.db).then(function () { self.setState({ savedAt: new Date(), saveErr: false }); })
        .catch(function () { self.setState({ saveErr: true }); });
    }, 300);
  }
  renderVals() {
    var self = this, st = this.state, D = st.db, C = D.cfg;
    var brl = function (v) { return v == null ? '–' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
    var nf = function (v, d) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 2 : d }); };
    var pct = function (v) { return v == null ? '–' : (v * 100).toFixed(1).replace('.', ',') + '%'; };
    var pp = function (v) { return (v >= 0 ? '+' : '') + (v * 100).toFixed(1).replace('.', ',') + ' p.p.'; };
    var parse = function (s) { if (s == null) return null; if (typeof s === 'number') return isNaN(s) ? null : s; s = String(s).trim().replace('R$', '').replace('%', '').trim(); if (s === '') return null; if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); var x = parseFloat(s); return isNaN(x) ? null : x; };
    var parsePct = function (s) { var x = parse(s); return x == null ? null : x / 100; };
    var N = function (v) { return v == null || isNaN(v) ? 0 : v; };
    var dash = function (v, f) { return v == null || v === 0 ? '–' : f(v); };
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    var roundUp = function (v) { return v < 0 ? -Math.ceil(-v - 1e-9) : Math.ceil(v - 1e-9); };
    var r3 = function (v) { return Math.round(v * 1000) / 1000; };
    var merge = function (key, k, v) { var o = Object.assign({}, st[key]); o[k] = v; var s = {}; s[key] = o; self.setState(s); };
    var save = function (fn) { fn(D); self.setState({ db: Object.assign({}, D) }); self.persist(); };
    var val = function (e) { return e.target.value; };
    var go = function (s, extra) { return function () { self.setState(Object.assign({ screen: s }, extra || {})); try { window.scrollTo(0, 0); } catch (er) {} }; };
    var toastF = function (m) { self.setState({ toast: m }); clearTimeout(self._tt); self._tt = setTimeout(function () { self.setState({ toast: '' }); }, 5000); };
    var printPage = function () { try { window.print(); } catch (e) { toastF('Não foi possível abrir a impressão neste navegador.'); } };
    var nomeEmp = C.nome && C.nome.trim() ? C.nome.trim() : '[Nome do Restaurante]';
    var anoRef = (function () { var m = String(C.mes || '').match(/(\d{4})/); return m ? +m[1] : new Date().getFullYear(); })();

    /* ================= CATEGORIAS ================= */
    var catList = D.cats;
    var CATS = catList.map(function (c) { return c.nome; });
    var cmvOf = {}; catList.forEach(function (c) { cmvOf[c.nome] = c.cmv; });
    var EMB = C.embCat || 'Embalagem';
    var catCls = function (c) { return cmvOf[c] ? 'pill ok' : (c === EMB ? 'pill warn' : 'pill mute'); };

    /* ================= CADASTRO (cada insumo = CÓD fixo) ================= */
    var insAll = D.ins.map(function (r, k) {
      var rende = parse(r.rende), compra = parse(r.compra);
      var unit = rende && compra ? compra / rende : null; /* F = compra ÷ rende (vazio se faltar um dos dois) */
      var cmvF = cmvOf[r.cat];
      return { cod: r.cod, nome: r.nome, un: r.un, rende: rende, compra: compra, unit: unit, u: N(unit), cat: r.cat,
        cmv: cmvF === true, cmvTxt: cmvF == null ? '–' : (cmvF ? 'Sim' : 'Não'), naCont: r.naCont === 'Não' ? 'Não' : 'Sim',
        label: r.cod + ' · ' + r.nome, pos: k + 1, raw: r };
    });
    var byCod = {}; insAll.forEach(function (i) { byCod[i.cod] = i; });
    var ins = insAll.filter(function (i) { return i.naCont !== 'Não'; });
    var fora = insAll.filter(function (i) { return i.naCont === 'Não'; });
    var qf = function (i, v) { return v == null ? '' : nf(v, 3); };
    var div = function (i) { return i.un === 'kg' || i.un === 'L' ? 1000 : 1; };
    var isUnd = function (i) { return i.un === 'und' || i.un === 'cx' || i.un === 'pct'; };
    var ORD = C.ordem || 'cad';
    var sortIns = function (arr) {
      if (ORD === 'cad') return arr;
      var a = arr.slice();
      a.sort(function (x, y) { if (ORD === 'cat') { var c = CATS.indexOf(x.cat) - CATS.indexOf(y.cat); if (c) return c; } return String(x.nome).localeCompare(String(y.nome), 'pt-BR', { sensitivity: 'base' }); });
      return a;
    };
    var groupRows = function (arr) {
      if (ORD !== 'cat') return arr.length ? [{ hdr: false, nome: '', n: arr.length, rows: arr }] : [];
      var out = [];
      arr.forEach(function (r) { var g = out[out.length - 1]; if (!g || g.nome !== r.cat) { g = { hdr: true, nome: r.cat || 'Sem categoria', n: 0, rows: [] }; out.push(g); } g.rows.push(r); g.n++; });
      return out;
    };
    var ORDS = [['cad', 'Ordem do cadastro'], ['alfa', 'Alfabética (A–Z)'], ['cat', 'Por categoria + A–Z']];
    var ordChips = ORDS.map(function (o) { return { nome: o[1], cls: ORD === o[0] ? 'chip on' : 'chip', pick: function () { save(function (d) { d.cfg.ordem = o[0]; }); } }; });
    var ordNome = ORD === 'cad' ? 'ordem do cadastro' : (ORD === 'alfa' ? 'ordem alfabética' : 'por categoria, em ordem alfabética');
    var ordHint = 'Vale para a Lista de contagem (tela e impressão) e para a digitação no CMV da semana. Os números ficam presos ao produto: trocar a ordem não muda nada do que já foi lançado.';

    /* ================= SEMANAS (datas) ================= */
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var dparts = function (s) { var m = String(s || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/); if (!m) return null; var y = m[3] ? (m[3].length === 2 ? 2000 + (+m[3]) : +m[3]) : anoRef; var d = +m[1], mo = +m[2]; if (d < 1 || d > 31 || mo < 1 || mo > 12) return null; return { d: d, m: mo, y: y }; };
    var dkey = function (s) { var p = dparts(s); return p ? p.y * 400 + p.m * 32 + p.d : null; };
    var shortD = function (s) { var p = dparts(s); return p ? pad2(p.d) + '/' + pad2(p.m) : '—'; };
    var prevDay = function (s) { var p = dparts(s); if (!p) return '—'; var dt = new Date(p.y, p.m - 1, p.d - 1); return pad2(dt.getDate()) + '/' + pad2(dt.getMonth() + 1); };
    var WK = [0, 1, 2, 3, 4].map(function (k) { return { nome: 'Semana ' + (k + 1), short: 'Sem ' + (k + 1) }; });
    WK.forEach(function (w, k) {
      var o = D.weeks[k];
      w.dIni = o.ini ? o.ini : (k === 0 ? '' : WK[k - 1].dFim); /* semana 2 a 5: começa na data final da anterior */
      w.dFim = o.fim || '';
      w.a = dkey(w.dIni); w.b = dkey(w.dFim); w.ok = w.a != null && w.b != null && w.b > w.a;
      w.periodo = w.ok ? shortD(w.dIni) + ' até ' + prevDay(w.dFim) : (!w.dIni && !w.dFim ? 'sem datas' : 'confira as datas');
      w.fat = parse(o.fat); w.meta = parsePct(o.meta);
    });
    /* entra na semana: data inicial ≤ data < data final */
    var weekOf = function (d) { var k = dkey(d); if (k == null) return -1; for (var w = 0; w < 5; w++) { if (WK[w].ok && k >= WK[w].a && k < WK[w].b) return w; } return -1; };
    var lanc = D.lanc, perdL = D.perd;
    var sumBy = function (L, tipo) { var out = [{}, {}, {}, {}, {}]; L.forEach(function (x) { if (tipo && x.tipo !== tipo) return; var w = weekOf(x.data); if (w < 0 || !byCod[x.cod]) return; out[w][x.cod] = (out[w][x.cod] || 0) + N(parse(x.qtd)); }); return out; };
    var prodBy = sumBy(lanc, 'Produção'), entBy = sumBy(lanc, 'Entrada'), perdBy = sumBy(perdL, null);
    var listBy = function (L, tipo) { var out = [[], [], [], [], []]; L.forEach(function (x) { if (tipo && x.tipo !== tipo) return; var w = weekOf(x.data); if (w >= 0 && byCod[x.cod]) out[w].push(x); }); return out; };
    var PRODL = listBy(lanc, 'Produção'), PERD = listBy(perdL, null);

    /* ================= CMV (5 semanas encadeadas, tudo preso ao CÓD) ================= */
    var prevFin = {};
    var weeksC = WK.map(function (w, k) {
      var sr = D.weeks[k].rows || {}, hasFinal = false;
      var items = insAll.map(function (i) {
        var o = sr[i.cod] || {};
        var ini = k === 0 ? parse(o.ini) : (prevFin[i.cod] != null ? prevFin[i.cod] : null); /* G = K da semana anterior */
        var fin = parse(o.fin);
        if (fin != null) hasFinal = true;
        return { i: i, o: o, ini: ini, ent: entBy[k][i.cod] || 0, prod: prodBy[k][i.cod] || 0, fin: fin, perda: perdBy[k][i.cod] || 0 };
      });
      var t = { rIni: 0, rEnt: 0, rProd: 0, rFin: 0, utilTot: 0, utilCmv: 0, perdas: 0, cat: {} };
      items.forEach(function (x) {
        var u = x.i.u;
        /* L = inicial + entradas + produção − final (só depois que algum estoque final da semana for lançado) */
        x.uso = hasFinal ? N(x.ini) + x.ent + x.prod - N(x.fin) : 0;
        x.rs = x.uso * u;
        t.rIni += N(x.ini) * u; t.rEnt += x.ent * u; t.rProd += x.prod * u; t.rFin += N(x.fin) * u;
        t.utilTot += x.rs; if (x.i.cmv) t.utilCmv += x.rs; t.perdas += x.perda * u;
        t.cat[x.i.cat] = (t.cat[x.i.cat] || 0) + x.rs;
      });
      items.forEach(function (x) { prevFin[x.i.cod] = x.fin; });
      return { items: items, hasFinal: hasFinal, t: t };
    });
    var stOf = function (fat, has, cmv, meta) {
      if (!fat) return { cls: 'pill mute', txt: 'Informe o faturamento' };
      if (!has) return { cls: 'pill mute', txt: 'Aguardando estoque final' };
      return cmv <= N(meta) ? { cls: 'pill ok', txt: '✔ Dentro da meta' } : { cls: 'pill warn', txt: '▲ Acima da meta' };
    };
    var metaMes = parsePct(C.metaMes), metaCmc = parsePct(C.metaCmc);
    var SCALE = 400;
    var weekInfo = weeksC.map(function (c, w) { var fat = WK[w].fat, cmv = N(fat) > 0 ? c.t.utilCmv / fat : null; return { c: c, fat: fat, cmv: cmv, s: stOf(fat, c.hasFinal, cmv, WK[w].meta), sm: stOf(fat, c.hasFinal, cmv, metaMes) }; });
    var weeks = weekInfo.map(function (x, w) {
      var c = x.c;
      return {
        nome: WK[w].nome, short: WK[w].short, dIni: WK[w].dIni || '—', dFim: WK[w].dFim || '—',
        fat: x.fat ? brl(x.fat) : '–', util: brl(c.t.utilCmv), cmv: pct(x.cmv), meta: pct(metaMes),
        stCls: x.sm.cls, stTxt: x.fat ? x.sm.txt : 'sem faturamento', perdas: dash(c.t.perdas, brl), prod: dash(c.t.rProd, brl),
        h: x.cmv != null ? Math.min(190, Math.round(x.cmv * SCALE)) : 30, barCls: x.cmv == null ? 'cbar e' : (x.cmv <= N(metaMes) ? 'cbar' : 'cbar o'),
        bw: x.cmv != null ? Math.min(100, Math.round(x.cmv / 0.5 * 100)) : 0, barF: x.cmv != null && x.cmv > N(metaMes) ? 'bar-f o' : 'bar-f',
        fechCls: c.hasFinal ? 'pill ok' : 'pill mute', fechTxt: c.hasFinal ? 'Sim' : 'Não'
      };
    });

    /* tela CMV da semana escolhida */
    var cwI = st.cmvW, cx = weekInfo[cwI], cc = cx.c, cwW = WK[cwI];
    var setRow = function (w, cod, k) {
      return function (e) { var v = val(e); save(function (d) { var r = d.weeks[w].rows[cod] || (d.weeks[w].rows[cod] = {}); r[k] = v; }); };
    };
    var setWk = function (k) { return function (e) { var v = val(e); save(function (d) { d.weeks[cwI][k] = v; }); }; };
    var catMaxW = 0; Object.keys(cc.t.cat).forEach(function (k) { catMaxW = Math.max(catMaxW, cc.t.cat[k]); });
    var cntW = function (w) { var e = 0, pr = 0; lanc.forEach(function (x) { if (weekOf(x.data) === w) { if (x.tipo === 'Entrada') e++; else pr++; } }); return e + ' entrada(s) · ' + pr + ' produção(ões) · ' + PERD[w].length + ' perda(s) neste período'; };
    var cw = {
      nome: cwW.nome, dIni: cwW.dIni, dFim: cwW.dFim, fatStr: D.weeks[cwI].fat, metaStr: D.weeks[cwI].meta,
      onIniD: setWk('ini'), onFimD: setWk('fim'), onFat: setWk('fat'), onMeta: setWk('meta'),
      iniPh: cwI === 0 ? 'dd/mm/aaaa' : 'igual à data final da ' + WK[cwI - 1].nome,
      periodo: cwW.ok ? 'Entram neste CMV as entradas, produções e perdas lançadas de ' + shortD(cwW.dIni) + ' até ' + prevDay(cwW.dFim) + ' (do dia da contagem inicial até o dia anterior à contagem final).' : (!cwW.dIni || !cwW.dFim ? 'Preencha a data inicial (dia da contagem inicial) e a data final (dia da contagem final) para o sistema saber quais lançamentos entram nesta semana.' : 'Confira as datas: a data final precisa ser depois da data inicial.'),
      periodoCont: cntW(cwI),
      cmvTxt: pct(cx.cmv), metaTxt: cwW.meta != null ? 'Meta: ' + pct(cwW.meta) : 'Meta: –', stCls: cx.s.cls, stTxt: cx.s.txt,
      diff: cx.cmv == null ? 'Informe o faturamento' : (cwW.meta == null ? 'Informe a meta' : pp(cx.cmv - cwW.meta)),
      utilCmv: brl(cc.t.utilCmv), utilTot: brl(cc.t.utilTot), perdas: brl(cc.t.perdas), perdaPct: cc.t.utilTot > 0 ? pct(cc.t.perdas / cc.t.utilTot) : '–',
      rIni: brl(cc.t.rIni), rEnt: brl(cc.t.rEnt), rProd: brl(cc.t.rProd), rFin: brl(cc.t.rFin),
      iniHint: cwI === 0 ? 'Semana 1: digite aqui a CONTAGEM INICIAL na coluna Estoque inicial. O estoque final da Semana 1 vira sozinho o estoque inicial da Semana 2 (e assim até a Semana 5).' : 'O estoque inicial vem sozinho do estoque final da ' + WK[cwI - 1].nome + '. Entradas e produção vêm da tela Produção e entrada.',
      iniThCls: cwI === 0 ? 'r fill' : 'r', iniGrp: cwI === 0 ? 'Você preenche' : 'Auto · semana anterior',
      cats: CATS.map(function (k) { var v = cc.t.cat[k] || 0; return { nome: k, rs: brl(v), pct: cc.t.utilTot ? Math.round(v / cc.t.utilTot * 100) + '%' : '–', w: catMaxW > 0 ? Math.max(0, Math.round(v / catMaxW * 100)) : 0 }; })
    };
    var cwRows = cc.items.map(function (x) {
      var i = x.i, o = x.o;
      return {
        cod: i.cod, nome: i.nome, un: i.un, unitTxt: i.unit != null ? brl(i.unit) : 'sem preço', unitCls: i.unit != null ? 'r' : 'r neg', cat: i.cat, catCls: catCls(i.cat), cmvTxt: i.cmvTxt, cat_: i.cat,
        foraCont: i.naCont === 'Não',
        iniEdit: cwI === 0, iniAuto: cwI !== 0, ini: cwI === 0 ? (o.ini != null ? o.ini : '') : (x.ini == null ? '–' : qf(i, x.ini)),
        fin: o.fin != null ? o.fin : '', finTxt: x.fin == null ? '' : qf(i, x.fin), iniTxt: x.ini == null ? '' : qf(i, x.ini),
        ent: x.ent ? qf(i, x.ent) : '–', prod: x.prod ? qf(i, x.prod) : '–',
        uso: cc.hasFinal ? qf(i, x.uso) : '–', usoCls: x.uso < 0 ? 'r neg' : 'r b', rs: cc.hasFinal ? brl(x.rs) : '–',
        perda: x.perda ? qf(i, x.perda) : '–', rsPerda: x.perda ? brl(x.perda * i.u) : '–',
        rsIni: dash(N(x.ini) * i.u, brl), rsEnt: dash(x.ent * i.u, brl), rsProd: dash(x.prod * i.u, brl), rsFin: dash(N(x.fin) * i.u, brl),
        onIni: setRow(cwI, i.cod, 'ini'), onFin: setRow(cwI, i.cod, 'fin')
      };
    });
    var cwBy = {}; cwRows.forEach(function (r) { cwBy[r.cod] = r; });
    var pick = function (arr) { return arr.map(function (i) { return cwBy[i.cod]; }); };
    cw.groups = groupRows(sortIns(ins).map(function (i) { return cwBy[i.cod]; }));
    if (fora.length) cw.groups.push({ hdr: true, nome: 'Fora da lista de contagem (Na contagem? = Não)', n: fora.length, rows: pick(sortIns(fora)) });
    cw.nItens = insAll.length;

    /* ================= MÊS (Fechamento) ================= */
    var fatM = 0, utilM = 0, utilTotM = 0, perdM = 0, prodM = 0, catM = {}, useM = {}, useQ = {};
    weekInfo.forEach(function (x) {
      fatM += N(x.fat); utilM += x.c.t.utilCmv; utilTotM += x.c.t.utilTot; perdM += x.c.t.perdas; prodM += x.c.t.rProd;
      Object.keys(x.c.t.cat).forEach(function (k) { catM[k] = (catM[k] || 0) + x.c.t.cat[k]; });
      x.c.items.forEach(function (it) { useM[it.i.cod] = (useM[it.i.cod] || 0) + it.rs; useQ[it.i.cod] = (useQ[it.i.cod] || 0) + it.uso; });
    });
    var cmvM = fatM > 0 ? utilM / fatM : null;
    var anyFinal = weeksC.some(function (c) { return c.hasFinal; });
    var sM = stOf(fatM, anyFinal, cmvM, metaMes);
    var catTotM = 0; CATS.forEach(function (k) { catTotM += catM[k] || 0; });
    var topArr = insAll.filter(function (i) { return N(useM[i.cod]) > 0; }).sort(function (a, b) { return useM[b.cod] - useM[a.cod]; }).slice(0, 10);
    var useTot = 0; insAll.forEach(function (i) { if (N(useM[i.cod]) > 0) useTot += useM[i.cod]; });
    var mes = {
      ref: C.mes || '—', fat: brl(fatM), util: brl(utilM), utilTot: brl(utilTotM), cmv: pct(cmvM), meta: pct(metaMes), stCls: sM.cls, stTxt: fatM ? sM.txt : 'Informe o faturamento',
      diff: cmvM != null && metaMes != null ? pp(cmvM - metaMes) : '–',
      perdas: brl(perdM), perdaPct: utilTotM > 0 ? pct(perdM / utilTotM) : '–', prod: brl(prodM), prodN: PRODL.reduce(function (a, L) { return a + L.length; }, 0),
      cats: CATS.map(function (k) { var v = catM[k] || 0; return { nome: k, rs: brl(v), pct: catTotM ? Math.round(v / catTotM * 100) + '%' : '–' }; }),
      top10: topArr.map(function (i) { return { nome: i.nome, rs: brl(useM[i.cod]), pct: useTot ? pct(useM[i.cod] / useTot) : '–', w: Math.round(useM[i.cod] / useM[topArr[0].cod] * 100) }; }),
      noTop: !topArr.length,
      onMes: function (e) { var v = val(e); save(function (d) { d.cfg.mes = v; }); }, onMeta: function (e) { var v = val(e); save(function (d) { d.cfg.metaMes = v; }); },
      mesStr: C.mes, metaStr: C.metaMes
    };

    /* ================= RESUMOS PRODUÇÃO / PERDAS ================= */
    /* ranking por R$; enquanto o item estiver sem preço, vale a quantidade (chave = R$ + qtde/10.000.000) */
    var resumo = function (LISTS, BY) {
      var totQ = 0, totR = 0, lanc_ = 0;
      var per = insAll.map(function (i, idx) {
        var q = [0, 1, 2, 3, 4].map(function (w) { return BY[w][i.cod] || 0; });
        var tq = q.reduce(function (a, b) { return a + b; }, 0);
        return { i: i, q: q, tq: tq, rs: tq * i.u, key: tq > 0 ? tq * i.u + tq / 1e7 + (300 - idx) / 1e11 : 0 };
      });
      per.forEach(function (p) { totQ += p.tq; totR += p.rs; });
      LISTS.forEach(function (L) { lanc_ += L.length; });
      var ranked = per.filter(function (p) { return p.key > 0; }).sort(function (a, b) { return b.key - a.key; });
      var semR = [0, 1, 2, 3, 4].map(function (w) { var s = 0; per.forEach(function (p) { s += p.q[w] * p.i.u; }); return s; });
      var semTot = semR.reduce(function (a, b) { return a + b; }, 0);
      var mk = function (p) { var i = p.i;
        return { label: i.label, un: i.un, qtd: qf(i, p.tq), rs: brl(p.rs), pct: totR ? Math.round(p.rs / totR * 100) + '%' : '–', w: ranked[0].key ? Math.round(p.key / ranked[0].key * 100) : 0,
          s0: p.q[0] ? qf(i, p.q[0]) : '–', s1: p.q[1] ? qf(i, p.q[1]) : '–', s2: p.q[2] ? qf(i, p.q[2]) : '–', s3: p.q[3] ? qf(i, p.q[3]) : '–', s4: p.q[4] ? qf(i, p.q[4]) : '–' }; };
      var camp = ranked[0];
      return {
        total: nf(totQ, 3), rsTotal: brl(totR), lanc: lanc_, campeao: camp ? camp.i.nome : '–', campSub: camp ? qf(camp.i, camp.tq) + ' ' + camp.i.un : '', itens: ranked.length,
        dest: [0, 1, 2, 3, 4].map(function (w) {
          var best = null; per.forEach(function (p) { var k = p.q[w] > 0 ? p.q[w] * p.i.u + p.q[w] / 1e7 : 0; if (k > 0 && (!best || k > best.k)) best = { k: k, p: p }; });
          var i = best ? best.p.i : null;
          return { sem: WK[w].nome, item: i ? i.label : '–', qtd: i ? qf(i, best.p.q[w]) : '', un: i ? i.un : '', rsItem: i ? brl(best.p.q[w] * i.u) : '', rsSem: brl(semR[w]), lanc: LISTS[w].length, pct: semTot ? Math.round(semR[w] / semTot * 100) + '%' : '–' };
        }),
        rsSemTot: brl(semTot),
        rank: ranked.slice(0, 15).map(mk), all: ranked.map(mk), vazio: !ranked.length
      };
    };
    var rp = resumo(PRODL, prodBy), rl = resumo(PERD, perdBy);
    var motTot = 0; var motW = MOTIVOS.map(function (m) { var s = [0, 0, 0, 0, 0]; PERD.forEach(function (L, w) { L.forEach(function (p) { if (p.motivo === m) s[w] += N(parse(p.qtd)) * byCod[p.cod].u; }); }); var t = s.reduce(function (a, b) { return a + b; }, 0); motTot += t; return { m: m, s: s, t: t }; });
    var motSem = motW.map(function (x) { return { nome: x.m, s0: dash(x.s[0], brl), s1: dash(x.s[1], brl), s2: dash(x.s[2], brl), s3: dash(x.s[3], brl), s4: dash(x.s[4], brl), tot: brl(x.t), pct: motTot ? Math.round(x.t / motTot * 100) + '%' : '–' }; });

    var listTabs = function (key) {
      var cur = st[key] == null ? -1 : st[key];
      return [{ label: 'Todas', k: -1 }].concat(WK.map(function (w, k) { return { label: w.nome + ' · ' + w.periodo, k: k }; })).concat([{ label: 'Fora das semanas', k: -2 }]).map(function (t) {
        return { label: t.label, cls: cur === t.k ? 'chip on' : 'chip', pick: function () { var s = {}; s[key] = t.k; self.setState(s); } };
      });
    };
    var inTab = function (tab, d) { var w = weekOf(d); return tab === -1 || (tab === -2 ? w < 0 : w === tab); };
    var destTxt = function (d) {
      if (dkey(d) == null) return 'Digite a data (dd/mm/aaaa) para o sistema achar a semana.';
      var w = weekOf(d);
      return w < 0 ? 'Atenção: essa data não está em nenhuma semana do CMV. Confira as datas inicial e final no CMV da semana.' : '→ Vai para o CMV ' + WK[w].nome + ' (período ' + WK[w].periodo + ').';
    };
    var wLabel = function (d) { var w = weekOf(d); return w < 0 ? 'Fora das semanas' : 'CMV ' + WK[w].nome; };
    var semCls = function (d) { return weekOf(d) < 0 ? 'pill warn' : 'pill mute'; };
    var byDate = function (a, b) { return N(dkey(a.data)) - N(dkey(b.data)); };
    var periodos = WK.map(function (w) { return { nome: w.nome, per: w.periodo }; });
    var tabNome = function (t) { return t === -1 ? null : (t === -2 ? 'FORA DAS SEMANAS' : WK[t].nome.toUpperCase() + ' · ' + WK[t].periodo); };

    /* ================= PRODUÇÃO E ENTRADA (por data) ================= */
    var pw = st.prodW == null ? -1 : st.prodW;
    var PL = lanc.filter(function (x) { return byCod[x.cod] && inTab(pw, x.data); });
    var nEnt = 0, nProd = 0, rsE = 0, rsP = 0;
    PL.forEach(function (x) { var r = N(parse(x.qtd)) * byCod[x.cod].u; if (x.tipo === 'Entrada') { nEnt++; rsE += r; } else { nProd++; rsP += r; } });
    var prodBlk = {
      titulo: tabNome(pw) || 'TODOS OS LANÇAMENTOS', rsEnt: brl(rsE), rsProd: brl(rsP),
      info: nEnt + ' entrada(s) · ' + nProd + ' produção(ões)' + (pw < 0 ? '' : '  →  CMV ' + WK[pw].nome.toUpperCase()),
      rows: PL.filter(function (x) { return st.tipoF === 'Todos' || (st.tipoF === 'Entradas' ? x.tipo === 'Entrada' : x.tipo === 'Produção'); }).slice().sort(byDate).map(function (x) {
        var i = byCod[x.cod], q = N(parse(x.qtd));
        return { tipo: x.tipo, tipoCls: x.tipo === 'Entrada' ? 'pill ok' : 'pill mute', data: x.data, label: i.label, un: i.un, rende: i.rende != null ? nf(i.rende, 3) : '–', qtd: qf(i, q), rs: brl(q * i.u), resp: x.resp,
          semana: wLabel(x.data), semCls: semCls(x.data),
          del: function () { save(function (d) { var p = d.lanc.indexOf(x); if (p >= 0) d.lanc.splice(p, 1); }); toastF('Lançamento excluído. O CMV já foi recalculado.'); } };
      })
    };
    prodBlk.vazio = !prodBlk.rows.length;
    var firstCod = insAll[0] ? insAll[0].cod : '';
    var formCod = st.form.cod && byCod[st.form.cod] ? st.form.cod : firstCod;
    var setF = function (k) { return function (e) { merge('form', k, val(e)); }; };
    var form = {
      tipo: st.form.tipo, data: st.form.data, cod: formCod, qtd: st.form.qtd, resp: st.form.resp, un: byCod[formCod] ? byCod[formCod].un : '', destino: destTxt(st.form.data),
      onTipo: setF('tipo'), onData: setF('data'), onCod: setF('cod'), onQtd: setF('qtd'), onResp: setF('resp'),
      add: function () {
        if (!formCod) { toastF('Cadastre um insumo antes de lançar.'); return; }
        if (dkey(st.form.data) == null) { toastF('Informe a data do lançamento (dd/mm/aaaa).'); return; }
        var q = parse(st.form.qtd); if (!q) { toastF('Informe a quantidade antes de lançar.'); return; }
        var w = weekOf(st.form.data), it_ = byCod[formCod], ent = st.form.tipo === 'Entrada';
        save(function (d) { d.lanc.push({ id: 'n' + Date.now(), tipo: st.form.tipo, data: st.form.data, cod: formCod, qtd: q, resp: st.form.resp }); });
        self.setState({ form: Object.assign({}, st.form, { cod: formCod, qtd: '', resp: '' }) });
        toastF((ent ? 'Entrada' : 'Produção') + ' lançada: ' + qf(it_, q) + ' ' + it_.un + ' de ' + it_.nome + ' em ' + st.form.data + '. ' + (w < 0 ? 'Atenção: essa data está fora das semanas do CMV.' : 'Já somou na coluna ' + (ent ? 'ENTRADAS' : 'PRODUÇÃO') + ' do CMV ' + WK[w].nome + '.'));
      }
    };
    var insOpts = insAll.map(function (i) { return { v: i.cod, label: i.label + ' (' + i.un + ')' }; });
    var tipoChips = ['Todos', 'Entradas', 'Produção'].map(function (t) { return { nome: t, cls: st.tipoF === t ? 'chip on' : 'chip', pick: function () { self.setState({ tipoF: t }); } }; });

    /* ================= PERDAS (por data) ================= */
    var qw = st.perdW == null ? -1 : st.perdW;
    var PLs = perdL.filter(function (x) { return byCod[x.cod] && inTab(qw, x.data); }).slice().sort(byDate);
    var rsL = 0;
    var perdBlk = {
      titulo: tabNome(qw) || 'TODAS AS PERDAS',
      rows: PLs.map(function (x) { var i = byCod[x.cod], q = N(parse(x.qtd)), r = q * i.u; rsL += r;
        return { data: x.data, label: i.label, un: i.un, qtd: qf(i, q), motivo: x.motivo, rs: brl(r), semana: wLabel(x.data), semCls: semCls(x.data),
          del: function () { save(function (d) { var p = d.perd.indexOf(x); if (p >= 0) d.perd.splice(p, 1); }); toastF('Perda excluída. O CMV já foi recalculado.'); } }; })
    };
    perdBlk.vazio = !perdBlk.rows.length;
    perdBlk.info = PLs.length + ' lançamento(s) · ' + brl(rsL) + (qw < 0 ? '' : '  →  CMV ' + WK[qw].nome.toUpperCase());
    var pfS = st.pform;
    var pCod = pfS.cod && byCod[pfS.cod] ? pfS.cod : firstCod;
    var setP = function (k) { return function (e) { merge('pform', k, val(e)); }; };
    var pf = {
      data: pfS.data, cod: pCod, qtd: pfS.qtd, motivo: pfS.motivo, un: byCod[pCod] ? byCod[pCod].un : '', destino: destTxt(pfS.data),
      onData: setP('data'), onCod: setP('cod'), onQtd: setP('qtd'), onMotivo: setP('motivo'),
      add: function () {
        if (!pCod) { toastF('Cadastre um insumo antes de lançar.'); return; }
        if (dkey(pfS.data) == null) { toastF('Informe a data da perda (dd/mm/aaaa).'); return; }
        var q = parse(pfS.qtd); if (!q) { toastF('Informe a quantidade perdida.'); return; }
        var w = weekOf(pfS.data), it_ = byCod[pCod];
        save(function (d) { d.perd.push({ id: 'x' + Date.now(), data: pfS.data, cod: pCod, qtd: q, motivo: pfS.motivo }); });
        self.setState({ pform: Object.assign({}, pfS, { cod: pCod, qtd: '' }) });
        toastF('Perda lançada: ' + qf(it_, q) + ' ' + it_.un + ' de ' + it_.nome + ' (' + pfS.motivo + ') em ' + pfS.data + '. ' + (w < 0 ? 'Atenção: data fora das semanas do CMV.' : 'Já entrou no CMV ' + WK[w].nome + '.'));
      }
    };
    var motOpts = MOTIVOS.map(function (m) { return { v: m }; });

    /* ================= DETALHE POR ITEM (Fechamento) ================= */
    var detalhe = insAll.map(function (i) {
      var p = [0, 1, 2, 3, 4].map(function (w) { return prodBy[w][i.cod] || 0; }), pt = p.reduce(function (a, b) { return a + b; }, 0);
      var lq = 0; perdBy.forEach(function (m) { lq += m[i.cod] || 0; });
      var uq = N(useQ[i.cod]);
      return { nome: i.nome, un: i.un, cat: i.cat, cmv: i.cmvTxt, p0: p[0] ? qf(i, p[0]) : '–', p1: p[1] ? qf(i, p[1]) : '–', p2: p[2] ? qf(i, p[2]) : '–', p3: p[3] ? qf(i, p[3]) : '–', p4: p[4] ? qf(i, p[4]) : '–', pt: pt ? qf(i, pt) : '–', prs: dash(pt * i.u, brl), lq: lq ? qf(i, lq) : '–', lrs: dash(lq * i.u, brl), uq: qf(i, uq), urs: brl(N(useM[i.cod])) };
    });

    /* ================= ESTOQUE MÍNIMO ================= */
    var EP = { dias: parse(C.est.dias), prazo: parse(C.est.prazo), margem: parsePct(C.est.margem), cob: parse(C.est.cob) };
    var closed = weeksC.map(function (c) { return c.hasFinal; }), nClosed = closed.filter(Boolean).length;
    var lastClosed = -1; closed.forEach(function (c, w) { if (c) lastClosed = w; });
    var nComprar = 0, nOk = 0, totCompra = 0, comprar = [];
    var estAll = insAll.map(function (i, idx) {
      var uses = weeksC.map(function (c, w) { return closed[w] ? c.items[idx].uso : null; });
      var sum = 0, pico = null; uses.forEach(function (u) { if (u != null) { sum += u; pico = pico == null ? u : Math.max(pico, u); } });
      var med = nClosed ? sum / nClosed : null;                       /* J */
      var dia = med != null && N(EP.dias) ? med / EP.dias : null;     /* L */
      var prazoS = D.prazo[i.cod], pz = N(parse(prazoS)) > 0 ? parse(prazoS) : N(EP.prazo);
      var und = isUnd(i), mg = 1 + N(EP.margem);
      var min = dia == null ? null : (und ? roundUp(dia * pz * mg) : r3(dia * pz * mg));                       /* N */
      var ideal = min == null ? null : (und ? roundUp(min + dia * N(EP.cob)) : r3(min + dia * N(EP.cob)));  /* O */
      var atual = lastClosed >= 0 ? weeksC[lastClosed].items[idx].fin : null;                                 /* P */
      var sit = med == null ? '' : (med <= 0 ? 'SEM USO' : (N(atual) <= min ? 'COMPRAR' : 'OK'));             /* Q */
      var sug = sit === 'COMPRAR' ? (und ? roundUp(Math.max(0, ideal - N(atual))) : r3(Math.max(0, ideal - N(atual)))) : null;
      if (sit === 'COMPRAR') { nComprar++; totCompra += sug * i.u; comprar.push({ nome: i.nome, un: i.un, cat: i.cat, atual: atual == null ? '–' : qf(i, atual), min: qf(i, min), sug: qf(i, sug), rs: i.unit != null ? brl(sug * i.u) : 'sem preço' }); } else if (sit === 'OK') nOk++;
      var fu = function (u) { return u == null ? '' : qf(i, u); };
      return { sit: sit, nome: i.nome, un: i.un, cat: i.cat, s0: fu(uses[0]), s1: fu(uses[1]), s2: fu(uses[2]), s3: fu(uses[3]), s4: fu(uses[4]), med: fu(med), pico: fu(pico), dia: dia == null ? '' : nf(dia, 3),
        prazo: prazoS != null ? prazoS : '', onPrazo: function (e) { var v = val(e); save(function (d) { d.prazo[i.cod] = v; }); },
        min: fu(min), ideal: fu(ideal), atual: atual == null ? '–' : qf(i, atual), stCls: sit === 'COMPRAR' ? 'pill warn' : (sit === 'OK' ? 'pill ok' : 'pill mute'), stTxt: sit || '–',
        sug: sug != null ? qf(i, sug) : '', rs: sug != null ? brl(sug * i.u) : '' };
    });
    var estRows = st.estF === 'Comprar' ? estAll.filter(function (r) { return r.sit === 'COMPRAR'; }) : estAll;
    var setEst = function (k) { return function (e) { var v = val(e); save(function (d) { d.cfg.est[k] = v; }); }; };
    var est = { nClosed: nClosed, nComprar: nComprar, nOk: nOk, total: brl(totCompra), dias: C.est.dias, prazo: C.est.prazo, margem: C.est.margem, cob: C.est.cob,
      onDias: setEst('dias'), onPrazo: setEst('prazo'), onMargem: setEst('margem'), onCob: setEst('cob'),
      chips: ['Todos', 'Comprar'].map(function (t) { return { nome: t === 'Todos' ? 'Todos os itens' : 'Só COMPRAR', cls: st.estF === t ? 'chip on' : 'chip', pick: function () { self.setState({ estF: t }); } }; }),
      vazio: !estRows.length, ultima: lastClosed >= 0 ? WK[lastClosed].nome : 'nenhuma semana fechada' };

    /* ================= CMC ================= */
    var notas = D.notas;
    var compW = [0, 0, 0, 0, 0], compCat = {}, compIn = 0, compCmc = 0, nFora = 0, rsFora = 0;
    notas.forEach(function (n) {
      var v = N(parse(n.valor)), wn = weekOf(n.data);
      if (!v) return;
      if (wn < 0) { nFora++; rsFora += v; return; }
      compIn += v; compCat[n.cat] = (compCat[n.cat] || 0) + v;
      if (cmvOf[n.cat]) { compCmc += v; compW[wn] += v; }
    });
    var cmcPctM = fatM > 0 ? compCmc / fatM : null;
    var cmcSt = cmcPctM == null ? { cls: 'pill mute', txt: 'Informe o faturamento' } : (cmcPctM <= N(metaCmc) ? { cls: 'pill ok', txt: '✔ Dentro da meta' } : { cls: 'pill warn', txt: '▲ Acima da meta' });
    var catCMax = 0; Object.keys(compCat).forEach(function (k) { catCMax = Math.max(catCMax, compCat[k]); });
    var cmvMesReal = fatM > 0 && weeksC[0].hasFinal ? utilM / fatM : null;
    var ntS = st.nota;
    var ntCat = CATS.indexOf(ntS.cat) >= 0 ? ntS.cat : (CATS[0] || '');
    var setN_ = function (k) { return function (e) { merge('nota', k, val(e)); }; };
    var cmc = {
      fora: nFora ? nFora + ' nota(s) · ' + brl(rsFora) : 'nenhuma', pct: pct(cmcPctM), stCls: cmcSt.cls, stTxt: cmcSt.txt, cmc: brl(compCmc), total: brl(compIn),
      diff: cmcPctM != null && metaCmc != null ? pp(cmcPctM - metaCmc) : '–', meta: pct(metaCmc), metaStr: C.metaCmc, mesRef: C.mes || '—',
      onMeta: function (e) { var v = val(e); save(function (d) { d.cfg.metaCmc = v; }); },
      cmvMes: pct(cmvMesReal),
      weeks: weekInfo.map(function (x, w) { var p = N(x.fat) > 0 ? compW[w] / x.fat : null; var s = p == null ? { cls: 'pill mute', txt: 'sem faturamento' } : (p <= N(metaCmc) ? { cls: 'pill ok', txt: '✔ Dentro' } : { cls: 'pill warn', txt: '▲ Acima' });
        var cmvR = x.c.hasFinal && x.cmv != null ? x.cmv : null;
        return { fatStr: D.weeks[w].fat, onFat: function (e) { var v = val(e); save(function (d) { d.weeks[w].fat = v; }); }, nome: WK[w].nome, dIni: WK[w].dIni || '—', dFim: WK[w].dFim || '—', comp: dash(compW[w], brl), pct: pct(p), stCls: s.cls, stTxt: s.txt, cmv: pct(cmvR), diff: p != null && cmvR != null ? pp(p - cmvR) : '–' }; }),
      cats: CATS.map(function (k) { var v = compCat[k] || 0; return { nome: k, entra: cmvOf[k] ? 'Sim' : 'Não', rs: brl(v), pc: compIn ? Math.round(v / compIn * 100) + '%' : '–', pf: fatM > 0 ? pct(v / fatM) : '–', w: catCMax ? Math.round(v / catCMax * 100) : 0 }; }),
      notas: notas.slice().sort(byDate).map(function (n) { var wn = weekOf(n.data); return { data: n.data, forn: n.forn, nf: n.nf, cat: n.cat, catCls: catCls(n.cat), rs: brl(N(parse(n.valor))), obs: n.obs, sem: wn < 0 ? '⚠ fora' : WK[wn].nome, semCls: wn < 0 ? 'pill warn' : 'pill mute', entra: cmvOf[n.cat] == null ? '–' : (cmvOf[n.cat] ? 'Sim' : 'Não'),
        del: function () { save(function (d) { var p = d.notas.indexOf(n); if (p >= 0) d.notas.splice(p, 1); }); toastF('Nota excluída: ' + (n.forn || 'sem fornecedor') + '.'); } }; }),
      nota: { data: ntS.data, forn: ntS.forn, nf: ntS.nf, cat: ntCat, valor: ntS.valor, obs: ntS.obs, onData: setN_('data'), onForn: setN_('forn'), onNf: setN_('nf'), onCat: setN_('cat'), onValor: setN_('valor'), onObs: setN_('obs'),
        destino: destTxt(ntS.data),
        add: function () {
          if (dkey(ntS.data) == null) { toastF('Informe a data da nota (dd/mm/aaaa).'); return; }
          var v = parse(ntS.valor); if (!v) { toastF('Informe o valor da nota.'); return; }
          var w = weekOf(ntS.data);
          save(function (d) { d.notas.push({ id: 'c' + Date.now(), data: ntS.data, forn: ntS.forn, nf: ntS.nf, cat: ntCat, valor: v, obs: ntS.obs }); });
          self.setState({ nota: Object.assign({}, ntS, { forn: '', nf: '', valor: '', obs: '', cat: ntCat }) });
          toastF('Nota lançada: ' + brl(v) + ' (' + ntCat + ') em ' + ntS.data + '. ' + (w < 0 ? 'Atenção: data fora das semanas.' : (cmvOf[ntCat] ? 'Já somou no CMC da ' + WK[w].nome + '.' : 'Categoria fora do CMC: aparece só no total geral.')));
        } },
      vazio: !notas.length
    };

    /* ================= FICHAS TÉCNICAS ================= */
    var appsCfg = C.apps.map(function (a, k) { var com = parsePct(a.com), pag = parsePct(a.pag); return { nome: a.nome && a.nome.trim() ? a.nome.trim() : 'App ' + (k + 1), tot: N(com) + N(pag) }; });
    var canal = function (custo, taxa, preco, meta) {
      var sug = custo == null || !N(meta) || taxa >= 1 ? null : custo / meta / (1 - taxa);
      var lucro = custo == null || !N(preco) ? null : preco - custo - preco * taxa;
      var s = custo == null ? '' : (!N(preco) ? 'informe o preço' : (lucro < 0 ? 'PREJUÍZO' : (sug != null && preco < r2(sug) ? 'PREÇO BAIXO' : 'OK')));
      var cm = N(preco) && custo != null ? (custo + preco * taxa) / preco : null;
      return { custo: brl(custo), taxa: pct(taxa), sug: brl(sug), preco: N(preco) ? brl(preco) : '–', lucro: brl(lucro), cmvT: pct(cm), cmvN: cm,
        stCls: s === 'OK' ? 'pill ok' : (s === 'PREJUÍZO' ? 'pill bad' : (s === 'PREÇO BAIXO' ? 'pill warn' : 'pill mute')), stTxt: s, alert: s === 'PREÇO BAIXO', prej: s === 'PREJUÍZO' };
    };
    var fcalc = function (f) {
      var tot = 0, emb = 0;
      var linha = function (g) { var i = g.cod ? byCod[g.cod] : null, q = parse(g.q); var c = i && N(q) !== 0 ? N(q) * i.u / div(i) : null; return { i: i, q: q, c: c }; };
      var ings = f.ings.map(linha); ings.forEach(function (x) { if (x.c != null) tot += x.c; });
      var embs = f.embs.map(linha); embs.forEach(function (x) { if (x.c != null) emb += x.c; });
      var rend = parse(f.rend), peso = parse(f.peso), preco = parse(f.preco), meta = parsePct(f.meta);
      var porc = N(rend) > 0 ? tot / rend : null;                                  /* D22 */
      var cmv = N(preco) > 0 && N(porc) > 0 ? porc / preco : null;                  /* F22 */
      var lucro = N(preco) > 0 && porc != null ? preco - porc : null;               /* H22 */
      var ideal = N(meta) > 0 && porc != null ? porc / meta : null;                 /* H16 */
      var custoS = tot > 0 ? tot : null, custoD = tot > 0 ? tot + emb : null;        /* E61 / F61:H61 */
      var tx = [0, 1].map(function (k) { var t = parsePct(f.taxa[k]); return t == null ? appsCfg[k].tot : t; });
      var pS = N(preco) > 0 ? preco : null;
      return { ings: ings, embs: embs, tot: tot, emb: emb, rend: rend, peso: peso, preco: preco, meta: meta, porc: porc, cmv: cmv, lucro: lucro, ideal: ideal,
        custoKg: N(peso) > 0 ? tot / peso * 1000 : null, lucroIdeal: ideal != null ? ideal - porc : null, markup: N(preco) > 0 && N(porc) > 0 ? preco / porc : null,
        ch: [canal(custoS, 0, pS, meta), canal(custoD, 0, pS, meta), canal(custoD, tx[0], parse(f.precoApp[0]), meta), canal(custoD, tx[1], parse(f.precoApp[1]), meta)] };
    };
    var num2 = function (k) { return 'FT ' + (k + 1 < 10 ? '0' : '') + (k + 1); };
    var nFil = 0, sumS = 0, nS = 0, sum1 = 0, n1 = 0, sum2 = 0, n2 = 0, acima = 0, alert = 0, prej = 0;
    var FT = D.fichas, FC = FT.map(function (f) { return f ? fcalc(f) : null; });
    var fichas = FT.map(function (f, k) {
      var open = go('ft', { ft: k });
      var e = { preco: '', lucro: '', cmvT: '', sug: '', stCls: '', stTxt: '' };
      if (!f) return { num: num2(k), nome: '(sem nome)', cat: '', ins: '', emb: '', meta: '', c0: e, cmvS: '', lucroS: '', sStCls: '', sStTxt: '', c2: e, c3: e, open: open };
      var r = FC[k];
      if (f.nome && f.nome.trim()) nFil++;
      if (r.cmv != null) { sumS += r.cmv; nS++; if (r.cmv > N(r.meta)) acima++; }
      if (r.ch[2].cmvN != null) { sum1 += r.ch[2].cmvN; n1++; } if (r.ch[3].cmvN != null) { sum2 += r.ch[3].cmvN; n2++; }
      [r.ch[2], r.ch[3]].forEach(function (c) { if (c.alert) alert++; if (c.prej) prej++; });
      var ap = function (c) { return c.preco === '–' ? Object.assign({}, c, { preco: '', cmvT: '', lucro: '', stCls: '', stTxt: '' }) : c; };
      return { num: num2(k), nome: f.nome || '(sem nome)', cat: f.cat, ins: brl(r.porc), emb: r.emb > 0 ? brl(r.emb) : '', meta: pct(r.meta), c0: r.ch[0], cmvS: pct(r.cmv), lucroS: brl(r.lucro), /* J = H22: preço − custo por porção */
        sStCls: r.cmv == null ? '' : (r.cmv <= N(r.meta) ? 'pill ok' : 'pill warn'), sStTxt: r.cmv == null ? '' : (r.cmv <= N(r.meta) ? 'Dentro da meta' : 'Acima da meta'), c2: ap(r.ch[2]), c3: ap(r.ch[3]), open: open };
    });
    var fx = { n: nFil, cmvS: nS ? pct(sumS / nS) : '–', cmv1: n1 ? pct(sum1 / n1) : '–', cmv2: n2 ? pct(sum2 / n2) : '–', acima: acima, alert: alert, prej: prej, app1: appsCfg[0].nome, app2: appsCfg[1].nome };
    var setApp = function (k, f) { return function (e) { var v = val(e); save(function (d) { d.cfg.apps[k][f] = v; }); }; };
    var rf = {
      apps: C.apps.map(function (a, k) { return { nome: a.nome, com: a.com, pag: a.pag, tot: pct(appsCfg[k].tot), ph: 'App ' + (k + 1), onNome: setApp(k, 'nome'), onCom: setApp(k, 'com'), onPag: setApp(k, 'pag') }; }),
      embCat: EMB, onEmb: function (e) { var v = val(e); save(function (d) { d.cfg.embCat = v; }); }
    };

    var fraps = [];
    FT.forEach(function (f, k) {
      if ((!f || !f.nome) && !st.showEmpty) return;
      if (!f) { fraps.push({ num: num2(k), nome: 'Nome do produto', ings: [], total: brl(0), rend: '1', porc: '–', preco: '–', cmv: '–', lucro: '–', open: go('ft', { ft: k }) }); return; }
      var r = FC[k];
      fraps.push({ num: num2(k), nome: f.nome || 'Nome do produto', ings: r.ings.filter(function (g) { return g.i; }).map(function (g) { return { nome: g.i.nome, q: g.q != null ? nf(g.q, 3) : '', custo: brl(g.c) }; }), total: brl(r.tot), rend: r.rend != null ? nf(r.rend, 3) : '–', porc: brl(r.porc), preco: N(r.preco) ? brl(r.preco) : '–', cmv: pct(r.cmv), lucro: brl(r.lucro), open: go('ft', { ft: k }) });
    });

    /* ---- ficha aberta (editável) ---- */
    var ftI = st.ft, fsel = FT[ftI] || novaFicha(), r = FT[ftI] ? FC[ftI] : fcalc(fsel);
    var editF = function (fn) { save(function (d) { if (!d.fichas[ftI]) d.fichas[ftI] = novaFicha(); fn(d.fichas[ftI]); }); };
    var setFt = function (k) { return function (e) { var v = val(e); editF(function (f) { f[k] = v; }); }; };
    var optIng = insAll.filter(function (i) { return i.cat !== EMB; }), optEmb = insAll.filter(function (i) { return i.cat === EMB; });
    var opts = function (list, cur) { var o = [{ v: '', label: '— escolher —' }].concat(list.map(function (i) { return { v: i.cod, label: i.label }; })); if (cur && !list.some(function (i) { return i.cod === cur; })) o.push({ v: cur, label: byCod[cur] ? byCod[cur].label : cur + ' (não existe mais)' }); return o; };
    var ingRows = r.ings.map(function (g, j) {
      var raw = fsel.ings[j];
      return { n: j + 1, cod: raw.cod, q: raw.q, opts: opts(optIng, raw.cod), label: g.i ? g.i.label : '', un: g.i ? g.i.un : '', unit: g.i ? (g.i.unit != null ? brl(g.i.unit) : 'sem preço') : '', custo: g.c != null ? brl(g.c) : '',
        pct: g.c != null && r.tot ? Math.round(g.c / r.tot * 100) + '%' : '', w: g.c != null && r.tot ? Math.max(0, Math.round(g.c / r.tot * 100)) : 0, qn: g.q != null ? nf(g.q, 3) : '',
        onCod: function (e) { var v = val(e); editF(function (f) { f.ings[j].cod = v; }); }, onQ: function (e) { var v = val(e); editF(function (f) { f.ings[j].q = v; }); } };
    });
    var embRows = r.embs.map(function (g, j) {
      var raw = fsel.embs[j];
      return { n: j + 1, cod: raw.cod, q: raw.q, opts: opts(optEmb, raw.cod), label: g.i ? g.i.label : '', un: g.i ? g.i.un : '', unit: g.i ? (g.i.unit != null ? brl(g.i.unit) : 'sem preço') : '', custo: g.c != null ? brl(g.c) : '', qn: g.q != null ? nf(g.q, 3) : '',
        onCod: function (e) { var v = val(e); editF(function (f) { f.embs[j].cod = v; }); }, onQ: function (e) { var v = val(e); editF(function (f) { f.embs[j].q = v; }); } };
    });
    var CHN = ['Salão', 'Retirada', appsCfg[0].nome, appsCfg[1].nome];
    var fd = {
      idx: String(ftI), num: num2(ftI), nome: fsel.nome, cat: fsel.cat, rev: fsel.rev, rendStr: fsel.rend, pesoStr: fsel.peso, precoStr: fsel.preco, metaStr: fsel.meta,
      onNome: setFt('nome'), onCat: setFt('cat'), onRev: setFt('rev'), onRend: setFt('rend'), onPeso: setFt('peso'), onPreco: setFt('preco'), onMeta: setFt('meta'),
      rend: r.rend != null ? nf(r.rend, 3) : '–', peso: r.peso != null ? nf(r.peso, 3) : '–', precoTxt: N(r.preco) ? brl(r.preco) : '–', meta: pct(r.meta),
      custoKg: brl(r.custoKg), ideal: brl(r.ideal), lucroIdeal: brl(r.lucroIdeal), markup: r.markup != null ? nf(r.markup, 2) + 'x' : '–',
      total: brl(r.tot), porc: brl(r.porc), cmv: pct(r.cmv), lucro: brl(r.lucro),
      stCls: r.cmv == null ? 'pill mute' : (r.cmv <= N(r.meta) ? 'pill ok' : 'pill warn'), stTxt: r.cmv == null ? 'Informe o preço de venda' : (r.cmv <= N(r.meta) ? '✔ DENTRO DA META' : '▲ ACIMA DA META'),
      ings: ingRows, embs: embRows, emb: brl(r.emb),
      chans: r.ch.map(function (c, k) {
        var app = k >= 2;
        return Object.assign({}, c, { nome: CHN[k], isApp: app, notApp: !app, taxaStr: app ? fsel.taxa[k - 2] : '', taxaPh: app ? pct(appsCfg[k - 2].tot) : '', precoStr: app ? fsel.precoApp[k - 2] : (N(r.preco) ? nf(r.preco, 2) : ''),
          onTaxa: app ? function (e) { var v = val(e); editF(function (f) { f.taxa[k - 2] = v; }); } : null,
          onPreco: app ? function (e) { var v = val(e); editF(function (f) { f.precoApp[k - 2] = v; }); } : null });
      }),
      app1: appsCfg[0].nome, app2: appsCfg[1].nome,
      prep: fsel.prep.map(function (t, j) { return { n: j + 1, t: t, on: function (e) { var v = val(e); editF(function (f) { f.prep[j] = v; }); } }; }),
      obs: fsel.obs, onObs: setFt('obs'),
      foto: fsel.foto || '', hasFoto: !!fsel.foto, noFoto: !fsel.foto,
      onFoto: function (e) { lerFoto(e, 1200, function (u) { editF(function (f) { f.foto = u; }); toastF('Foto adicionada na ' + num2(ftI) + '. Ela sai junto na impressão da ficha.'); }); },
      tirarFoto: function () { editF(function (f) { f.foto = ''; }); },
      limpar: function () { if (!FT[ftI]) return; if (!window.confirm('Apagar tudo da ' + num2(ftI) + ' (' + (fsel.nome || 'sem nome') + ')? Não dá para desfazer.')) return; save(function (d) { d.fichas[ftI] = null; }); toastF(num2(ftI) + ' apagada.'); },
      taxaHint: 'Taxa em branco = usa a padrão do Resumo das fichas (' + appsCfg[0].nome + ' ' + pct(appsCfg[0].tot) + ' · ' + appsCfg[1].nome + ' ' + pct(appsCfg[1].tot) + '). Preço sugerido = custo ÷ meta de CMV; nos apps a taxa é repassada: custo ÷ meta ÷ (1 − taxa). Preço da retirada = preço do salão.'
    };
    var ftOpts = FT.map(function (f, k) { return { v: String(k), label: num2(k) + ' · ' + (f && f.nome ? f.nome : '(sem nome)') }; });

    /* ================= MANUAL DE MONTAGEM ================= */
    var mans = D.mans;
    var mi = Math.max(0, Math.min(st.manI || 0, mans.length - 1));
    var curM = mans[mi];
    var updM = function (fn) { save(function (d) { fn(d.mans[mi], d.mans); }); };
    var pSel = D.manPrint || {};
    var isSel = function (m) { return pSel[m.id] !== false; };
    var inv = D.manInv !== false;
    var stepView = function (x, k) { return { n: k + 1, titulo: x.titulo || ('Passo ' + (k + 1)), desc: x.desc, foto: x.foto, hasFoto: !!x.foto, noFoto: !x.foto }; };
    var ftFilled = FT.map(function (f, k) { return f && f.nome ? { v: String(k), label: num2(k) + ' · ' + f.nome } : null; }).filter(Boolean);
    var hojeTxt = this.hoje;
    var man = {
      logo: D.logo || '', hasLogo: !!D.logo, noLogo: !D.logo, empresa: nomeEmp, empresaStr: C.nome,
      onLogo: function (e) { lerFoto(e, 600, function (u) { save(function (d) { d.logo = u; }); toastF('Logo enviada. Ela sai em todas as impressões do manual.'); }); },
      onEmpresa: function (e) { var v = val(e); save(function (d) { d.cfg.nome = v; }); },
      list: mans.map(function (m, k) { return { nome: m.nome || '(sem nome)', n: m.steps.length, cls: k === mi ? 'mitem on' : 'mitem', pick: function () { self.setState({ manI: k }); } }; }),
      cur: { nome: curM.nome, cat: curM.cat, desc: curM.desc, obs: curM.obs },
      onNome: function (e) { var v = val(e); updM(function (m) { m.nome = v; }); },
      onCat: function (e) { var v = val(e); updM(function (m) { m.cat = v; }); },
      onDesc: function (e) { var v = val(e); updM(function (m) { m.desc = v; }); },
      onObs: function (e) { var v = val(e); updM(function (m) { m.obs = v; }); },
      novo: function () { var id = 'm' + Date.now(); save(function (d) { d.mans.push(novoManual(id)); }); self.setState({ manI: mans.length - 1 }); toastF('Manual novo criado. Dê um nome e vá adicionando os passos com foto.'); },
      excluir: function () { if (mans.length <= 1) { toastF('Precisa ficar pelo menos 1 manual.'); return; } if (!window.confirm('Excluir o manual "' + (curM.nome || 'sem nome') + '"?')) return; var nome = curM.nome; save(function (d) { d.mans.splice(mi, 1); }); self.setState({ manI: 0 }); toastF('Manual excluído: ' + nome + '.'); },
      addStep: function () { updM(function (m) { m.steps.push({ id: 'n' + Date.now(), titulo: '', desc: '', foto: '' }); }); },
      ftOpts: ftFilled.length ? ftFilled : [{ v: '', label: 'Nenhuma ficha técnica preenchida' }], ftSel: st.manFt != null ? st.manFt : (ftFilled[0] ? ftFilled[0].v : ''),
      onFtSel: function (e) { self.setState({ manFt: val(e) }); },
      puxar: function () {
        var idx = parseInt(st.manFt != null ? st.manFt : (ftFilled[0] ? ftFilled[0].v : '-1'), 10), f = FT[idx];
        if (!f) { toastF('Escolha uma ficha técnica preenchida.'); return; }
        var lin = f.ings.filter(function (g) { return g.cod && byCod[g.cod]; });
        updM(function (m) {
          m.steps = m.steps.filter(function (x) { return x.titulo || x.desc || x.foto; }).concat(lin.map(function (g, k) { var i = byCod[g.cod]; var u = i.un === 'kg' || i.un === 'g' ? ' g' : (i.un === 'L' || i.un === 'ml' ? ' ml' : ' ' + i.un); var q = parse(g.q); return { id: 'f' + Date.now() + k, titulo: i.nome, desc: (q != null ? nf(q, 3) : '') + u + ' de ' + i.nome + '.', foto: '' }; }));
          if (!m.nome || m.nome === 'Novo produto') m.nome = f.nome; if (!m.cat) m.cat = f.cat;
        });
        toastF(lin.length + ' passos puxados da ' + num2(idx) + ' (um por ingrediente, com a quantidade). Agora é só ajustar a ordem e colocar as fotos.');
      },
      steps: curM.steps.map(function (x, k) {
        var v = stepView(x, k);
        v.onTitulo = function (e) { var t = val(e); updM(function (m) { m.steps[k].titulo = t; }); };
        v.onDesc = function (e) { var t = val(e); updM(function (m) { m.steps[k].desc = t; }); };
        v.onFoto = function (e) { lerFoto(e, 900, function (u) { updM(function (m) { m.steps[k].foto = u; }); toastF('Foto adicionada no passo ' + (k + 1) + '.'); }); };
        v.up = function () { if (k === 0) return; updM(function (m) { var t = m.steps[k - 1]; m.steps[k - 1] = m.steps[k]; m.steps[k] = t; }); };
        v.down = function () { if (k >= curM.steps.length - 1) return; updM(function (m) { var t = m.steps[k + 1]; m.steps[k + 1] = m.steps[k]; m.steps[k] = t; }); };
        v.del = function () { updM(function (m) { m.steps.splice(k, 1); }); };
        return v;
      }),
      invCls: inv ? 'chip on' : 'chip', toggleInv: function () { save(function (d) { d.manInv = !inv; }); },
      todos: function () { save(function (d) { d.manPrint = {}; mans.forEach(function (m) { d.manPrint[m.id] = true; }); }); },
      nenhum: function () { save(function (d) { d.manPrint = {}; mans.forEach(function (m) { d.manPrint[m.id] = false; }); }); },
      printChips: mans.map(function (m) { return { nome: m.nome || '(sem nome)', cls: isSel(m) ? 'chip on' : 'chip', pick: function () { save(function (d) { d.manPrint = Object.assign({}, pSel); d.manPrint[m.id] = !isSel(m); }); } }; }),
      rev: hojeTxt
    };

    /* ---- PDF: modelos + personalizado + paginação ---- */
    var MODELS = [
      ['painel', 'Painel de parede', 'vários produtos lado a lado, em camadas (A4 deitado, 4 por folha)'],
      ['painelf', 'Painel de parede com fotos', 'cada produto numa faixa, com o passo a passo na horizontal (foto, número e descrição lado a lado), A4 deitado, 3 produtos por folha'],
      ['ficha', 'Ficha passo a passo', '1 produto por folha, foto grande de cada passo (A4 em pé)'],
      ['cartao', 'Cartão de bancada', 'cartões compactos, 2 por folha (A4 em pé)'],
      ['custom', 'Personalizado', 'você escolhe papel, orientação, quantos por folha e tamanho das fotos']
    ];
    var selModels = D.manModels || { painel: true };
    var cust = Object.assign({ estilo: 'painel', papel: 'a4', orient: 'paisagem', w: '30', h: '20', por: '4', foto: 'M' }, D.manCust || {});
    var setC = function (k) { return function (e) { var v = val(e); save(function (d) { d.manCust = Object.assign({}, cust); d.manCust[k] = v; }); }; };
    var PAPERS = { a4: [210, 297, 'A4'], a3: [297, 420, 'A3'], a5: [148, 210, 'A5'], carta: [216, 279, 'Carta'] };
    var FOT = { painelf: { P: 60, M: 90, G: 130 }, painel: { P: 28, M: 40, G: 64 }, ficha: { P: 100, M: 150, G: 220 }, cartao: { P: 28, M: 40, G: 60 } };
    var ESTN = { painelf: 'Painel com fotos passo a passo', painel: 'Painel de parede', ficha: 'Ficha passo a passo', cartao: 'Cartão de bancada' };
    var itemsSel = mans.filter(isSel).map(function (m) { var sv = m.steps.map(stepView); return { nome: m.nome, cat: m.cat, desc: m.desc, obs: m.obs, steps: sv, layers: inv ? sv.slice().reverse() : sv }; });
    var pages = [], pageCss = '';
    var addPages = function (estilo, papel, orient, per, foto, nomeModelo) {
      var dims;
      if (papel === 'livre') { dims = [Math.max(5, N(parse(cust.w))) * 10, Math.max(5, N(parse(cust.h))) * 10]; }
      else { var pp_ = PAPERS[papel] || PAPERS.a4; dims = orient === 'paisagem' ? [pp_[1], pp_[0]] : [pp_[0], pp_[1]]; }
      var w = dims[0], h = dims[1];
      var papelNome = papel === 'livre' ? (nf(w / 10, 1) + ' × ' + nf(h / 10, 1) + ' cm') : (PAPERS[papel] || PAPERS.a4)[2] + (orient === 'paisagem' ? ' deitado' : ' em pé');
      if (estilo === 'ficha') per = 1;
      per = Math.max(1, per);
      for (var i = 0; i < itemsSel.length; i += per) {
        var chunk = itemsSel.slice(i, i + per);
        var cols = estilo === 'cartao' ? Math.min(per, w > h ? 3 : 2) : (estilo === 'painel' ? (per <= 4 ? per : Math.ceil(per / 2)) : 1);
        var k = pages.length;
        pages.push({ cls: 'sheet mpg mpg' + k, isPainel: estilo === 'painel', isPainelF: estilo === 'painelf', isFicha: estilo === 'ficha', isCartao: estilo === 'cartao', items: chunk,
          gcols: 'repeat(' + cols + ', minmax(0, 1fr))', scols: 'repeat(' + (w > h ? 4 : 3) + ', minmax(0, 1fr))',
          fh: FOT[estilo][foto] || FOT[estilo].M, maxw: Math.min(900, Math.round(w * 3.2)), ar: w + ' / ' + h, modelo: nomeModelo + ' · ' + papelNome });
        pageCss += '.mpg' + k + '{page:mp' + k + '} @page mp' + k + '{size:' + w + 'mm ' + h + 'mm;margin:8mm} ';
      }
    };
    if (selModels.painel) addPages('painel', 'a4', 'paisagem', 4, 'M', 'Painel de parede');
    if (selModels.painelf) addPages('painelf', 'a4', 'paisagem', 3, 'M', 'Painel de parede com fotos');
    if (selModels.ficha) addPages('ficha', 'a4', 'retrato', 1, 'M', 'Ficha passo a passo');
    if (selModels.cartao) addPages('cartao', 'a4', 'retrato', 2, 'M', 'Cartão de bancada');
    if (selModels.custom) addPages(cust.estilo, cust.papel, cust.orient, parseInt(cust.por, 10) || 1, cust.foto, 'Personalizado · ' + ESTN[cust.estilo]);
    pages.forEach(function (p, k) { p.label = 'Página ' + (k + 1) + ' de ' + pages.length; });
    var nModels = MODELS.filter(function (m) { return selModels[m[0]]; }).length;
    man.modelChips = MODELS.map(function (m) { return { nome: m[1], cls: selModels[m[0]] ? 'chip on' : 'chip', pick: function () { save(function (d) { d.manModels = Object.assign({}, selModels); d.manModels[m[0]] = !selModels[m[0]]; }); } }; });
    man.modelList = MODELS.map(function (m) { return { nome: m[1], desc: m[2] }; });
    man.hasCustom = !!selModels.custom; man.hasPainel = !!selModels.painel || (!!selModels.custom && cust.estilo === 'painel');
    man.cust = cust; man.isLivre = cust.papel === 'livre';
    man.onEstilo = setC('estilo'); man.onPapel = setC('papel'); man.onOrient = setC('orient'); man.onW = setC('w'); man.onH = setC('h'); man.onPor = setC('por'); man.onFoto = setC('foto');
    man.pages = pages; man.pageCss = pageCss;
    man.resumo = !itemsSel.length ? 'Nenhum produto marcado.' : (!nModels ? 'Nenhum modelo marcado.' : 'PDF único com ' + pages.length + ' página(s): ' + itemsSel.length + ' produto(s) em ' + nModels + ' modelo(s), um modelo depois do outro.');
    man.openPrint = function () { if (!itemsSel.length) { toastF('Marque pelo menos 1 produto.'); return; } if (!nModels) { toastF('Marque pelo menos 1 modelo.'); return; } self.setState({ pv: 'man' }); };

    /* ================= CADASTRO: telas, novo insumo, ordem, categorias ================= */
    var move = function (cod, dlt) { return function () { save(function (d) { var p = -1; d.ins.forEach(function (x, k) { if (x.cod === cod) p = k; }); var q = p + dlt; if (p < 0 || q < 0 || q >= d.ins.length) return; var t = d.ins[p]; d.ins[p] = d.ins[q]; d.ins[q] = t; }); }; };
    var setIns = function (cod, k) { return function (e) { var v = val(e); save(function (d) { d.ins.forEach(function (x) { if (x.cod === cod) x[k] = v; }); }); }; };
    var usos = function (cod) {
      var n = 0;
      D.lanc.forEach(function (x) { if (x.cod === cod) n++; }); D.perd.forEach(function (x) { if (x.cod === cod) n++; });
      D.weeks.forEach(function (w) { var o = w.rows[cod]; if (o && ((o.ini != null && o.ini !== '') || (o.fin != null && o.fin !== ''))) n++; });
      D.fichas.forEach(function (f) { if (f) f.ings.concat(f.embs).forEach(function (g) { if (g.cod === cod) n++; }); });
      return n;
    };
    var catChips = ['Todas'].concat(CATS).map(function (c) { return { nome: c, cls: st.cat === c ? 'chip on' : 'chip', pick: function () { self.setState({ cat: c }); } }; });
    var unOpts = UNIDADES.map(function (u) { return { v: u }; });
    var cadRows = insAll.filter(function (i) { return st.cat === 'Todas' || i.cat === st.cat; }).map(function (i) {
      var raw = i.raw;
      return { pos: i.pos, cod: i.cod, nome: raw.nome, un: raw.un, rende: raw.rende, compra: raw.compra, unitTxt: i.unit != null ? brl(i.unit) : 'sem preço', unitCls: i.unit != null ? 'r b' : 'r neg', cat: raw.cat, cmvTxt: i.cmvTxt, naCont: i.naCont,
        up: move(i.cod, -1), down: move(i.cod, 1),
        onNome: setIns(i.cod, 'nome'), onUn: setIns(i.cod, 'un'), onRende: setIns(i.cod, 'rende'), onCompra: setIns(i.cod, 'compra'), onCat: setIns(i.cod, 'cat'), onNaCont: setIns(i.cod, 'naCont'),
        del: function () {
          var n = usos(i.cod);
          if (n) { toastF('Não dá para excluir ' + i.label + ': ele já tem ' + n + ' lançamento(s)/contagem(ns)/ficha(s). Para tirar de uso, renomeie para "(INATIVO) ' + i.nome + '" e marque Na contagem? = Não.'); return; }
          if (!window.confirm('Excluir o insumo ' + i.label + '?')) return;
          save(function (d) { d.ins = d.ins.filter(function (x) { return x.cod !== i.cod; }); });
          toastF('Insumo excluído: ' + i.label + '.');
        } };
    });
    var setNv = function (k) { return function (e) { merge('novo', k, val(e)); }; };
    var nvCat = CATS.indexOf(st.novo.cat) >= 0 ? st.novo.cat : (CATS[0] || '');
    var novo = Object.assign({}, st.novo, {
      cat: nvCat, hasMsg: !!st.msg, msg: st.msg,
      onNome: setNv('nome'), onUn: setNv('un'), onRende: setNv('rende'), onCompra: setNv('compra'), onCat: setNv('cat'), onAfter: setNv('after'),
      add: function () {
        var nv = st.novo; if (!nv.nome || !nv.nome.trim()) { toastF('Digite o nome do insumo.'); return; }
        if (D.ins.length >= MAX_INS) { toastF('Capacidade cheia: ' + MAX_INS + ' insumos.'); return; }
        var maxN = 0; D.ins.forEach(function (x) { maxN = Math.max(maxN, parseInt(x.cod, 10) || 0); });
        var cod = ('00' + (maxN + 1)).slice(-3);
        var row = { cod: cod, nome: nv.nome.trim(), un: nv.un, rende: nv.rende || '1', compra: nv.compra, cat: nvCat, naCont: 'Sim' };
        var where = nv.after === '__top' ? 'no topo' : (nv.after && byCod[nv.after] ? 'depois de ' + byCod[nv.after].nome : 'no fim');
        save(function (d) {
          var idx = nv.after === '__top' ? 0 : d.ins.length;
          if (nv.after && nv.after !== '__top') d.ins.forEach(function (x, k) { if (x.cod === nv.after) idx = k + 1; });
          d.ins.splice(idx, 0, row);
        });
        self.setState({ novo: { nome: '', un: nv.un, rende: '1', compra: '', cat: nvCat, after: nv.after },
          msg: 'Cadastrado: ' + cod + ' · ' + row.nome + ' (' + where + '). Já aparece na Lista de contagem e no CMV na mesma posição, e os números já lançados nos outros itens não mudaram.' });
        toastF('Insumo cadastrado: ' + cod + ' · ' + row.nome + ' (' + where + ').');
      }
    });
    var posOpts = insAll.map(function (i) { return { v: i.cod, label: i.label }; });
    var catCfg = catList.map(function (c, k) { return { nome: c.nome, cmv: c.cmv ? 'Sim' : 'Não', onCmv: function (e) { var v = val(e) === 'Sim'; save(function (d) { d.cats[k].cmv = v; }); } }; });
    var novaCat = {
      nome: st.novaCat.nome, cmv: st.novaCat.cmv,
      onNome: function (e) { merge('novaCat', 'nome', val(e)); }, onCmv: function (e) { merge('novaCat', 'cmv', val(e)); },
      add: function () {
        var n = (st.novaCat.nome || '').trim(); if (!n) { toastF('Digite o nome da categoria.'); return; }
        if (CATS.indexOf(n) >= 0) { toastF('Essa categoria já existe.'); return; }
        if (CATS.length >= MAX_CATS) { toastF('Limite de ' + MAX_CATS + ' categorias.'); return; }
        var sim = st.novaCat.cmv === 'Sim';
        save(function (d) { d.cats.push({ nome: n, cmv: sim }); });
        self.setState({ novaCat: { nome: '', cmv: 'Não' } });
        toastF('Categoria criada: ' + n + (sim ? ' (entra no CMV).' : ' (não entra no CMV).'));
      }
    };
    var lista = sortIns(ins).map(function (i, k) { return { n: k + 1, nome: i.nome, un: i.un, cat: i.cat }; });
    var listaG = groupRows(lista);

    /* ================= CONFIGURAÇÃO E DADOS ================= */
    var dataArq = this.hoje.split('/').reverse().join('-');
    var cfg = {
      nome: nomeEmp, nomeStr: C.nome, mes: C.mes || '—', mesStr: C.mes, metaMesStr: C.metaMes,
      onNome: function (e) { var v = val(e); save(function (d) { d.cfg.nome = v; }); },
      onMes: mes.onMes, onMeta: mes.onMeta
    };
    var saveInfo = st.saveErr ? 'Atenção: não foi possível salvar neste navegador. Baixe um backup.' : (st.savedAt ? 'Salvo neste navegador às ' + pad2(st.savedAt.getHours()) + ':' + pad2(st.savedAt.getMinutes()) : (st.loaded ? 'Dados salvos neste navegador' : 'Carregando seus dados…'));
    var backup = function () { baixarArquivo('backup-estoque-cmv-' + dataArq + '.json', JSON.stringify(D), 'application/json'); };
    var dados = {
      info: saveInfo, origem: D.origem || '',
      backup: function () { backup(); toastF('Backup baixado. Guarde o arquivo .json em lugar seguro (pendrive, Drive, e-mail).'); },
      restaurar: function (e) {
        var f = e.target.files && e.target.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          var obj = null; try { obj = JSON.parse(fr.result); } catch (er) {}
          if (!obj || !obj.ins || !obj.weeks) { toastF('Esse arquivo não é um backup do sistema.'); return; }
          if (!window.confirm('Restaurar o backup "' + f.name + '"? Tudo o que está no sistema agora será substituído.')) return;
          self.setState({ db: migrar(obj) }); self.persist(); toastF('Backup restaurado: ' + f.name + '.');
        };
        fr.readAsText(f); e.target.value = '';
      },
      novoMes: function () {
        var nomeNovo = window.prompt('Iniciar um novo mês.\n\nAntes, o sistema baixa um backup do mês atual. Depois limpa lançamentos, perdas, notas, contagens e faturamento. Cadastro, fichas e manuais continuam.\nO estoque final da última semana fechada vira a contagem inicial da Semana 1.\n\nNome do novo mês de referência:', '');
        if (nomeNovo == null) return;
        backup();
        var lc = lastClosed, fins = {}, dataIni = lc >= 0 ? WK[lc].dFim : '';
        if (lc >= 0) weeksC[lc].items.forEach(function (x) { if (x.fin != null) fins[x.i.cod] = { ini: x.o.fin }; });
        save(function (d) {
          d.cfg.mes = nomeNovo.trim() || d.cfg.mes;
          d.weeks = [0, 1, 2, 3, 4].map(function (k) { var w = semanaVazia(); w.meta = d.weeks[k].meta; return w; });
          d.weeks[0].rows = fins; d.weeks[0].ini = dataIni;
          d.lanc = []; d.perd = []; d.notas = [];
        });
        toastF('Novo mês iniciado' + (lc >= 0 ? ': a contagem final da ' + WK[lc].nome + ' virou a contagem inicial da Semana 1.' : '.') + ' O backup do mês anterior foi baixado.');
      },
      zerar: function () {
        if (!window.confirm('Voltar aos dados da planilha original? Tudo o que foi lançado no sistema será apagado (baixe um backup antes, se precisar).')) return;
        self.setState({ db: dbInicial() }); self.persist(); toastF('Sistema voltou aos dados da planilha.');
      }
    };

    /* ================= MENU ================= */
    var scr = st.screen;
    var mk = function (key, label, extra, on) { return { label: label, cls: on ? 'nav on' : 'nav', go: go(key, extra) }; };
    var groups = [
      { label: 'Início', items: [mk('como', 'Como usar', null, scr === 'como')] },
      { label: 'Cadastro e contagem', items: [mk('cad', 'Cadastro de insumos', null, scr === 'cad'), mk('lista', 'Lista de contagem', null, scr === 'lista')] },
      { label: 'Lançamentos', items: [mk('prod', 'Produção e entrada', null, scr === 'prod'), mk('rprod', 'Resumo produção', null, scr === 'rprod'), mk('perd', 'Perdas', null, scr === 'perd'), mk('rperd', 'Resumo perdas', null, scr === 'rperd')] },
      { label: 'CMV', items: [0, 1, 2, 3, 4].map(function (w) { return mk('cmv', 'CMV Semana ' + (w + 1), { cmvW: w }, scr === 'cmv' && st.cmvW === w); }) },
      { label: 'Mês', items: [mk('fech', 'Fechamento do mês', null, scr === 'fech'), mk('cmc', 'CMC compras', null, scr === 'cmc'), mk('est', 'Estoque mínimo', null, scr === 'est')] },
      { label: 'Fichas técnicas', items: [mk('rfichas', 'Resumo fichas', null, scr === 'rfichas'), mk('frap', 'Ficha rápida', null, scr === 'frap'), mk('ft', 'FT 01 a FT 100', null, scr === 'ft'), mk('man', 'Manual de montagem', null, scr === 'man')] }
    ];
    var steps = [
      ['Cadastro de insumos', 'Cadastre todos os itens e as categorias: unidade, rendimento, valor de compra e categoria. Cada linha tem um CÓD fixo — pode renomear à vontade. Item novo entra na posição escolhida; a contagem e o CMV seguem a mesma ordem, sem mexer no que já foi lançado.', 'cad'],
      ['Lista de contagem', 'Automática: copia a ordem e os nomes do cadastro. Só imprimir e anotar. Item novo no cadastro entra sozinho; para tirar um item da contagem, marque NA CONTAGEM? = Não no cadastro.', 'lista'],
      ['Produção e entrada', 'Lance cada entrada (mercadoria que chegou) e cada produção pela DATA. O sistema acha a semana sozinho e soma tudo, por item, no CMV da semana certa.', 'prod'],
      ['Resumo produção', 'Soma automática do que foi produzido: campeão de cada semana, ranking do mês e soma de cada item por semana e no mês.', 'rprod'],
      ['Perdas', 'Mesma lógica: lance pela data, com motivo e valor perdido. Cada perda vai para o CMV da sua semana.', 'perd'],
      ['Resumo perdas', 'Soma automática das perdas: maior perda de cada semana, ranking do mês, perdas por motivo e soma de cada item.', 'rperd'],
      ['CMV Semana 1', 'Preencha datas, faturamento e meta. Depois a contagem inicial (estoque inicial) e o estoque final. Entradas e produção já vêm somadas. O estoque final de cada semana vira o estoque inicial da semana seguinte.', 'cmv'],
      ['Fechamento do mês', 'Resumo automático do mês: CMV geral, evolução semana a semana, tudo que foi produzido, todas as perdas (por motivo) e os itens que mais pesaram. Não precisa digitar nada.', 'fech'],
      ['Estoque mínimo', 'Calculado pela média de uso das semanas já fechadas: estoque mínimo, estoque ideal, situação (COMPRAR / OK) e sugestão de compra.', 'est'],
      ['Resumo fichas', 'Configure aqui as taxas dos 2 apps de delivery. Painel das 100 fichas: CMV no salão e CMV + taxas em cada app, preço sugerido, lucro e alertas (abaixo do sugerido / prejuízo). Clique no Nº para abrir a ficha.', 'rfichas'],
      ['FT 01', 'Fichas técnicas (FT 01 a FT 100): insumos, EMBALAGEM (bloco próprio, só retirada/delivery), preço no salão e nos apps e o preço sugerido de cada canal. É AQUI que você preenche. Botão para imprimir cada ficha.', 'ft'],
      ['Ficha rápida', 'Cópia automática das 100 fichas completas, em blocos resumidos. Não precisa digitar nada aqui.', 'frap'],
      ['Manual de montagem', 'Passo a passo de cada produto, com foto de cada etapa e a logo da empresa. Imprime em vários modelos: painel de parede, painel com fotos, ficha passo a passo, cartão de bancada ou personalizado.', 'man'],
      ['CMC compras', 'Para quem não conta estoque: lance as notas de compra e o faturamento da semana. Mostra o CMC (compras ÷ faturamento) por semana e no mês, por categoria, e compara com o CMV real se as telas CMV estiverem em uso.', 'cmc']
    ].map(function (s, k) { return { n: k + 1, t: s[0].toUpperCase(), d: s[1], go: go(s[2], s[2] === 'cmv' ? { cmvW: 0 } : (s[2] === 'ft' ? { ft: 0 } : null)) }; });

    var pvT = { man: 'Manual de montagem · PDF com ' + man.pages.length + ' página(s)', ft: fd.num + ' · ' + (fd.nome || '(sem nome)'), cmv: 'CMV ' + cw.nome, lista: 'Lista de contagem', fech: 'Fechamento do mês · ' + mes.ref, compras: 'Lista de compras · estoque mínimo' };
    return {
      groups: groups, steps: steps, printPage: printPage, cfg: cfg, dados: dados, saveInfo: saveInfo, carregando: !st.loaded,
      toast: { on: !!st.toast, msg: st.toast || '' },
      openFt: function () { self.setState({ pv: 'ft' }); }, openLista: function () { self.setState({ pv: 'lista' }); }, openCmv: function () { self.setState({ pv: 'cmv' }); },
      openFech: function () { self.setState({ pv: 'fech' }); },
      openCompras: function () { if (!comprar.length) { toastF(nClosed ? 'Nenhum item abaixo do estoque mínimo agora.' : 'Ainda não há semana fechada (estoque final lançado) para calcular a média de uso.'); return; } self.setState({ pv: 'compras' }); },
      pv: { on: !!st.pv, isFt: st.pv === 'ft', isLista: st.pv === 'lista', isCmv: st.pv === 'cmv', isFech: st.pv === 'fech', isCompras: st.pv === 'compras', isMan: st.pv === 'man', notMan: st.pv !== 'man', titulo: pvT[st.pv] || '', nLista: lista.length,
        close: function () { self.setState({ pv: null }); }, print: printPage, hoje: hojeTxt,
        ings: fd.ings.filter(function (x) { return x.label; }), embs: fd.embs.filter(function (x) { return x.label; }), prep: fd.prep.filter(function (x) { return x.t; }),
        chans: fd.chans, compras: comprar, comprasTot: brl(totCompra) },
      is: { como: scr === 'como', cad: scr === 'cad', lista: scr === 'lista', prod: scr === 'prod', rprod: scr === 'rprod', perd: scr === 'perd', rperd: scr === 'rperd', cmv: scr === 'cmv', fech: scr === 'fech', cmc: scr === 'cmc', est: scr === 'est', rfichas: scr === 'rfichas', frap: scr === 'frap', ft: scr === 'ft', man: scr === 'man' }, man: man,
      catChips: catChips, cadRows: cadRows, unOpts: unOpts, ordChips: ordChips, ordHint: ordHint, ordNome: ordNome, listaG: listaG, nIns: insAll.length, nCont: ins.length, nFora: fora.length, catCfg: catCfg, catNames: CATS.map(function (c) { return { nome: c }; }),
      novo: novo, posOpts: posOpts, novaCat: novaCat, lista: lista,
      prodTabs: listTabs('prodW'), prodBlk: prodBlk, periodos: periodos, form: form, insOpts: insOpts, tipoChips: tipoChips,
      perdTabs: listTabs('perdW'), perdBlk: perdBlk, pf: pf, motOpts: motOpts,
      rp: rp, rl: rl, motSem: motSem,
      cw: cw, weeks: weeks, metaBottom: Math.min(190, Math.round(N(metaMes) * SCALE)), metaTxt: pct(metaMes), mes: mes, detalhe: detalhe,
      cmc: cmc,
      est: est, estRows: estRows,
      fichas: fichas, fx: fx, rf: rf, fraps: fraps, toggleEmpty: function () { self.setState({ showEmpty: !st.showEmpty }); }, emptyLbl: st.showEmpty ? 'Esconder fichas vazias' : 'Mostrar as 100 fichas', noFraps: !fraps.length,
      fd: fd, ftOpts: ftOpts, pickFt: function (e) { self.setState({ ft: parseInt(val(e), 10) || 0 }); },
      goRF: go('rfichas'), goFR: go('frap')
    };
  }
}
