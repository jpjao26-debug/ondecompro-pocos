/* OndeCompro em Poços? — app de comparação de preços dos mercados de Poços de Caldas */
"use strict";

const CIDADE = "Poços de Caldas";
const PREFIXO = "ocp";  // favoritos e carrinho separados entre os apps de Ubatuba e Maringá (mesmo endereço base)

const $ = (s, el = document) => el.querySelector(s);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const R = (v) => (v == null ? "—" : brl.format(v));
const arred = (v) => Math.round(v * 100) / 100;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const reduzir = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const animavel = () => !reduzir() && !!document.body.animate;
const vibrar = (ms = 10) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch {} };
const ABAS = [...document.querySelectorAll(".abas button[data-aba]")].map((b) => b.dataset.aba);

const FILTRO_VAZIO = { mercado: "todos", multi: false, promo: false, preco: "", categoria: "", marca: "" };
const estado = {
  aba: "inicio",
  busca: "",
  cat: { ...FILTRO_VAZIO, ordem: "preco" },   // filtros do catálogo
  fb: { ...FILTRO_VAZIO, ordem: "relev" },    // filtros da busca
  catMostrar: 40,
  buscaMostrar: 40,
  folha: null,        // "detalhe" ou "filtros" quando a folha de baixo está aberta
  detalhe: null,
  buscaMarca: "",
  esvaziar: false,
};
let FEED = null, ITENS = [], MAPA = new Map(), MERCADOS = {};

/* ---------------------------------------------------------------- favoritos */
const FAV_CHAVE = PREFIXO + "_favoritos";
const favs = new Set(lerFavs());
function lerFavs() { try { return JSON.parse(localStorage.getItem(FAV_CHAVE) || "[]"); } catch { return []; } }
function salvarFavs() { try { localStorage.setItem(FAV_CHAVE, JSON.stringify([...favs])); } catch {} }
function alternarFav(k) { favs.has(k) ? favs.delete(k) : favs.add(k); salvarFavs(); }

/* ---------------------------------------------------------------- carrinho */
const CARRINHO_CHAVE = PREFIXO + "_carrinho";
const carrinho = new Map(lerCarrinho());   // chave do produto -> quantidade (na ordem em que entrou)
function lerCarrinho() {
  try {
    const v = JSON.parse(localStorage.getItem(CARRINHO_CHAVE) || "[]");
    return Array.isArray(v) ? v.filter((x) => Array.isArray(x) && typeof x[0] === "string" && x[1] > 0) : [];
  } catch { return []; }
}
function salvarCarrinho() { try { localStorage.setItem(CARRINHO_CHAVE, JSON.stringify([...carrinho])); } catch {} }
const qtdCarrinho = (k) => carrinho.get(k) || 0;
const porKg = (it) => !!(it && it.pk);  // vendido por quilo: cada "+" é 1 kg

function mudarCarrinho(k, delta) {
  const q = Math.min(99, Math.max(0, qtdCarrinho(k) + delta));
  if (q) carrinho.set(k, q); else carrinho.delete(k);
  salvarCarrinho();
  atualizarControles(k);
  atualizarSelo();
  if (estado.folha === "detalhe" && estado.detalhe === k) detalhe(k);
  if (estado.aba === "carrinho" && !estado.busca.trim()) desenhar();
}

function atualizarSelo() {
  let n = 0;
  for (const q of carrinho.values()) n += q;
  const s = $("#selo-carrinho");
  if (s) { s.textContent = n > 99 ? "99+" : String(n); s.hidden = !n; }
}

// botão do card/linha: "+" redondo; depois de adicionar vira "− 2 +"
const SVG_LIXO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z"/></svg>`;
function controleCard(k, cls = "") {
  const q = qtdCarrinho(k);
  const it = MAPA.get(k);
  if (!q) {
    return `<div class="ctrl ${cls}" data-ctrl="${esc(k)}" data-cls="${cls}"><button class="ctrl-mais" data-add="${esc(k)}" aria-label="Adicionar ao carrinho">+</button></div>`;
  }
  return `<div class="ctrl aberto ${cls}" data-ctrl="${esc(k)}" data-cls="${cls}">
    <button data-qtd="-1" data-kq="${esc(k)}" aria-label="${q === 1 ? "Tirar do carrinho" : "Diminuir"}">${q === 1 ? SVG_LIXO : "−"}</button>
    <b>${q}${porKg(it) ? " kg" : ""}</b>
    <button data-add="${esc(k)}" aria-label="Aumentar">+</button></div>`;
}
function atualizarControles(k) {
  document.querySelectorAll(`[data-ctrl="${CSS.escape(k)}"]`).forEach((el) => { el.outerHTML = controleCard(k, el.dataset.cls || ""); });
}

// o produto "pula" do botão até a aba Carrinho
function voarProCarrinho(origem) {
  const alvo = $('.abas [data-aba="carrinho"] svg');
  const reduzir = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!alvo || !origem || reduzir || !document.body.animate) return pulsarCarrinho();
  const a = origem.getBoundingClientRect(), b = alvo.getBoundingClientRect();
  const foto = origem.closest(".card, .item-lista, .folha-corpo");
  const img = foto && foto.querySelector("img:not([data-falhou])");
  const el = document.createElement(img ? "img" : "div");
  if (img) { el.referrerPolicy = "no-referrer"; el.src = img.currentSrc || img.src; }
  el.className = "voando";
  const tam = 56, x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
  el.style.left = (x0 - tam / 2) + "px";
  el.style.top = (y0 - tam / 2) + "px";
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0;
  const anim = el.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.35}px, ${Math.min(dy * 0.35, 0) - 90}px) scale(.85)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0.5 },
  ], { duration: 700, easing: "cubic-bezier(.45,0,.55,1)" });
  anim.onfinish = () => { el.remove(); pulsarCarrinho(); };
}
function pulsarCarrinho() {
  const s = $('.abas [data-aba="carrinho"] .icone-aba');
  if (s && s.animate) s.animate([{ transform: "scale(1)" }, { transform: "scale(1.3) rotate(-8deg)" }, { transform: "scale(.95) rotate(4deg)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
  const n = $("#selo-carrinho");
  if (n && n.animate && !n.hidden) n.animate([{ transform: "scale(1)" }, { transform: "scale(1.6)" }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(.3,1.6,.5,1)" });
}

/* ---------------------------------------------------------------- efeitos: coração, foto voando, confete */
function explodirCoracao(btn) {
  if (!btn || !animavel()) return;
  const r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const cores = ["#e11d48", "#fb7185", "#f5b301", "#ff8fab"];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement("span");
    p.className = "particula";
    const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.3, d = 24 + Math.random() * 20, tam = 4 + Math.random() * 5;
    p.style.cssText = `left:${cx - tam / 2}px;top:${cy - tam / 2}px;width:${tam}px;height:${tam}px;background:${cores[i % 4]}`;
    document.body.appendChild(p);
    p.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d}px) scale(.2)`, opacity: 0 }],
      { duration: 550 + Math.random() * 250, easing: "cubic-bezier(.1,.7,.3,1)" }).onfinish = () => p.remove();
  }
  const anel = document.createElement("span");
  anel.className = "particula";
  anel.style.cssText = `left:${cx - 18}px;top:${cy - 18}px;width:36px;height:36px;background:none;border:2px solid #e11d48`;
  document.body.appendChild(anel);
  anel.animate([{ transform: "scale(.4)", opacity: 0.9 }, { transform: "scale(1.7)", opacity: 0 }], { duration: 500, easing: "ease-out" }).onfinish = () => anel.remove();
}
function popCoracao(k) {
  if (!animavel()) return;
  document.querySelectorAll(`[data-fav="${CSS.escape(k)}"]`).forEach((b) => {
    const alvo = b.querySelector("svg") || b;
    alvo.animate([{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(.88)" }, { transform: "scale(1)" }], { duration: 480, easing: "ease-out" });
  });
}

// a foto sai do card e vai para o topo do detalhe
function voarFoto(origem) {
  const destino = $("#folha-conteudo .det-foto img");
  if (!origem || !destino || !animavel() || origem.dataset.falhou) return;
  const a = origem.getBoundingClientRect();
  if (!a.width || a.bottom < 0 || a.top > innerHeight) return;
  const f = $("#folha");
  f.classList.remove("abrindo");
  const b = destino.getBoundingClientRect();   // posição final, com a folha já aberta
  void f.offsetWidth;
  f.classList.add("abrindo");
  if (!b.width) return;
  const el = document.createElement("img");
  el.className = "foto-voando";
  el.referrerPolicy = "no-referrer";
  el.src = origem.currentSrc || origem.src;
  Object.assign(el.style, { left: b.left + "px", top: b.top + "px", width: b.width + "px", height: b.height + "px", transformOrigin: "0 0" });
  document.body.appendChild(el);
  destino.style.opacity = "0";
  el.animate([
    { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`, borderRadius: "10px" },
    { transform: "none", borderRadius: "12px" },
  ], { duration: 470, easing: "cubic-bezier(.2,.85,.25,1)" }).onfinish = () => { destino.style.opacity = ""; el.remove(); };
}

// chuva de confete com as cores do app (tema no CSS: --confete)
function confete() {
  if (reduzir()) return;
  const antigo = $("#confete");
  if (antigo) antigo.remove();
  const cv = document.createElement("canvas");
  cv.id = "confete";
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  const cores = (getComputedStyle(document.documentElement).getPropertyValue("--confete") || "#f5b301").split(",").map((s) => s.trim()).filter(Boolean);
  const ps = [];
  for (let i = 0; i < 150; i++) {
    const lado = i % 2;
    ps.push({ x: lado ? W + 10 : -10, y: H * (0.5 + Math.random() * 0.25), vx: (lado ? -1 : 1) * (3 + Math.random() * 7), vy: -(8 + Math.random() * 10),
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cores[i % cores.length] });
  }
  const t0 = performance.now();
  let ultimo = t0;
  const quadro = (t) => {
    const dt = Math.min(32, t - ultimo) / 16;
    ultimo = t;
    ctx.clearRect(0, 0, W, H);
    let vivos = 0;
    for (const p of ps) {
      p.vy += 0.33 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > H + 20) continue;
      vivos++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      const h = p.h * Math.abs(Math.cos(p.r * 2)) + 1;
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -h / 2, p.w, h);
      if (/^#f{3,6}$/i.test(p.c)) { ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 0.8; ctx.strokeRect(-p.w / 2, -h / 2, p.w, h); }
      ctx.restore();
    }
    if (vivos && t - t0 < 4500) requestAnimationFrame(quadro); else cv.remove();
  };
  requestAnimationFrame(quadro);
}

// números que sobem até o valor (contadores do topo e total do carrinho)
function contarAte(el, de, ate, fmt, dur = 800) {
  if (!el || !animavel() || de === ate) { if (el) el.textContent = fmt(ate); return; }
  const t0 = performance.now();
  const passo = (t) => {
    const x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 3);
    el.textContent = fmt(de + (ate - de) * e);
    if (x < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/* ---------------------------------------------------------------- contagem regressiva (fim do encarte) */
function fimDoDia(iso) { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59).getTime(); }
function partesContagem(iso) {
  const ms = fimDoDia(iso) - Date.now();
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const p2 = (n) => String(n).padStart(2, "0");
function tic() {
  document.querySelectorAll("[data-fim]").forEach((el) => {
    const c = partesContagem(el.dataset.fim);
    if (!c) { el.textContent = "encerrada"; return; }
    if (el.dataset.modo === "caixas") el.innerHTML = `${c.d ? `<b>${c.d}d</b>` : ""}<b>${p2(c.h)}</b>:<b>${p2(c.m)}</b>:<b>${p2(c.s)}</b>`;
    else el.textContent = `acaba em ${c.d ? c.d + "d " : ""}${p2(c.h)}:${p2(c.m)}:${p2(c.s)}`;
  });
}
setInterval(tic, 1000);

// atacado: a partir de X unidades o preço de cada uma cai (Atacadão, Tenda...)
function precoCom(o, q) {
  let p = o.p, at = null;
  for (const a of o.at || []) if (q >= a.qtd && a.preco < p) { p = a.preco; at = a; }
  return { p, at };
}

function calcularCarrinho() {
  const itens = [], sumidos = [];
  for (const [k, q] of carrinho) {
    const it = MAPA.get(k);
    if (it) itens.push({ k, it, q }); else sumidos.push(k);
  }
  // 1) cada item no mercado mais barato
  const grupos = new Map();
  let totalCombo = 0;
  for (const x of itens) {
    let melhor = null;
    for (const [m, o] of Object.entries(x.it.o)) {
      const pc = precoCom(o, x.q);
      if (!melhor || pc.p < melhor.p) melhor = { m, o, p: pc.p, at: pc.at };
    }
    x.melhor = melhor;
    x.sub = melhor.p * x.q;
    totalCombo += x.sub;
    if (!grupos.has(melhor.m)) grupos.set(melhor.m, { m: melhor.m, itens: [], total: 0 });
    const g = grupos.get(melhor.m);
    g.itens.push(x);
    g.total += x.sub;
  }
  // 2) tudo num mercado só
  const porMercado = Object.keys(FEED.totais || {}).map((m) => {
    let total = 0;
    const faltam = [];
    for (const x of itens) {
      const o = x.it.o[m];
      if (o) total += precoCom(o, x.q).p * x.q; else faltam.push(x.it);
    }
    return { m, total, faltam, tem: itens.length - faltam.length };
  }).filter((r) => r.tem > 0).sort((a, b) => (a.faltam.length - b.faltam.length) || (a.total - b.total));
  return { itens, sumidos, totalCombo, porMercado, grupos: [...grupos.values()].sort((a, b) => b.total - a.total) };
}

/* ---------------------------------------------------------------- dados */
async function carregar() {
  try {
    const f = await fetch("dados/feed.json", { cache: "no-cache" });
    FEED = await f.json();
    const i = await fetch("dados/itens.json?d=" + encodeURIComponent(FEED.atualizado));
    const dados = await i.json();
    ITENS = dados.itens;
  } catch (e) {
    $("#conteudo").innerHTML = `<p class="vazio">Não consegui carregar os preços. Confira a internet e abra de novo.</p>`;
    return;
  }
  MERCADOS = FEED.mercados || {};
  for (const it of ITENS) {
    it._busca = norm(it.n + " " + it.c + " " + (it.mc || ""));
    it._min = Math.min(...Object.values(it.o).map((o) => o.p));
    MAPA.set(it.k, it);
  }
  $("#atualizado").textContent = "Atualizado " + FEED.atualizado;
  desenhar(true);
  atualizarSelo();
}

const nomeMercado = (m) => (MERCADOS[m] && MERCADOS[m].nome) || m;
const soEncarte = (m) => /só encarte/.test((MERCADOS[m] || {}).obs || "");
function ofertasOrdenadas(it) { return Object.entries(it.o).sort((a, b) => a[1].p - b[1].p); }
function precoUnit(it, preco) {
  if (!it.q || !it.b || it.b === "un" && it.q === 1) return "";
  const v = preco / it.q;
  const rot = it.b === "kg" ? "kg" : it.b === "l" ? "litro" : "un";
  return `${R(v)}/${rot}`;
}

/* ---------------------------------------------------------------- filtros */
const FAIXAS = [["ate10", "Até R$ 10", 0, 10], ["10a20", "R$ 10 a 20", 10, 20], ["20a50", "R$ 20 a 50", 20, 50], ["50mais", "Acima de R$ 50", 50, Infinity]];
const filtroAtual = () => (estado.busca.trim() ? estado.fb : estado.cat);
const precoFiltro = (it, f) => (f.mercado !== "todos" && it.o[f.mercado] ? it.o[f.mercado].p : it._min);
function emPromo(it, mercado) {
  const ms = mercado !== "todos" ? [mercado] : Object.keys(it.o);
  return ms.some((m) => it.o[m] && (it.o[m].pr || soEncarte(m)));
}
function passa(it, f, ignorar = "") {
  if (f.mercado !== "todos" && !it.o[f.mercado]) return false;
  if (f.multi && Object.keys(it.o).length < 2) return false;
  if (f.promo && !emPromo(it, f.mercado)) return false;
  if (f.preco) {
    const fx = FAIXAS.find((x) => x[0] === f.preco), p = precoFiltro(it, f);
    if (fx && (p < fx[2] || p >= fx[3])) return false;
  }
  if (ignorar !== "categoria" && f.categoria && it.c !== f.categoria) return false;
  if (ignorar !== "marca" && f.marca && (it.mc || "") !== f.marca) return false;
  return true;
}
function ordenar(lista, f) {
  const pf = (it) => precoFiltro(it, f);
  const pu = (it) => (it.q ? pf(it) / it.q : Infinity);
  const ord = {
    relev: (a, b) => (Object.keys(b.o).length - Object.keys(a.o).length) || (pf(a) - pf(b)),
    preco: (a, b) => pf(a) - pf(b),
    unit: (a, b) => pu(a) - pu(b),
    eco: (a, b) => b.eco - a.eco,
    nome: (a, b) => a.n.localeCompare(b.n, "pt-BR"),
  }[f.ordem] || ((a, b) => pf(a) - pf(b));
  return lista.sort(ord);
}
let _busca = { termo: null, lista: [] };
function achadosBusca() {
  const termo = norm(estado.busca).trim();
  if (_busca.termo !== termo) {
    const termos = termo.split(/\s+/).filter(Boolean);
    _busca = { termo, lista: ITENS.filter((it) => termos.every((t) => it._busca.includes(t))) };
  }
  return _busca.lista;
}
const baseAtual = () => (estado.busca.trim() ? achadosBusca() : ITENS);
const nFiltros = (f) => (f.multi ? 1 : 0) + (f.promo ? 1 : 0) + (f.preco ? 1 : 0) + (f.categoria ? 1 : 0) + (f.marca ? 1 : 0);

const SVG_FILTRO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3zm3 6h12v2H6zm4 6h4v2h-4z"/></svg>`;
function barraFiltros(f) {
  const chipsM = [["todos", "Todos"], ...Object.keys(FEED.totais || {}).map((m) => [m, nomeMercado(m)])]
    .map(([v, t]) => `<button class="chip ${f.mercado === v ? "on" : ""}" data-f="mercado" data-v="${esc(v)}">${esc(t)}</button>`).join("");
  const ordens = [...(estado.busca.trim() ? [["relev", "Mais comparados"]] : []),
    ["preco", "Menor preço"], ["unit", "Preço por kg/litro"], ["eco", "Maior economia"], ["nome", "A–Z"]];
  const n = nFiltros(f);
  const ativos = [
    f.multi && ["multi", "Em 2+ mercados"],
    f.promo && ["promo", "Em promoção / encarte"],
    f.preco && ["preco", (FAIXAS.find((x) => x[0] === f.preco) || [])[1]],
    f.categoria && ["categoria", f.categoria],
    f.marca && ["marca", "Marca: " + f.marca],
  ].filter(Boolean);
  return `
    <div class="filtros">${chipsM}</div>
    <div class="barra-ordem">
      <button class="botao-filtrar ${n ? "on" : ""}" data-abrir-filtros>${SVG_FILTRO}Filtrar${n ? ` <b>${n}</b>` : ""}</button>
      <select data-f="ordem" aria-label="Ordenar">${ordens.map(([v, t]) => `<option value="${v}" ${v === f.ordem ? "selected" : ""}>${t}</option>`).join("")}</select>
    </div>
    ${ativos.length ? `<div class="filtros ativos">${ativos.map(([c, t]) => `<button class="chip on" data-tirar="${c}">${esc(t)} <span aria-hidden="true">×</span></button>`).join("")}<button class="chip limpar" data-limpar>Limpar</button></div>` : ""}`;
}

function contarOpcoes(base, f, campo, chave) {
  const c = new Map();
  for (const it of base) {
    if (!passa(it, f, campo)) continue;
    const v = chave(it);
    if (v) c.set(v, (c.get(v) || 0) + 1);
  }
  return c;
}
function htmlMarcas() {
  const f = filtroAtual();
  const marcas = [...contarOpcoes(baseAtual(), f, "marca", (it) => it.mc)];
  const bm = norm(estado.buscaMarca).trim();
  let vis = bm ? marcas.filter(([m]) => norm(m).includes(bm)).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    : marcas.sort((a, b) => b[1] - a[1]);
  vis = vis.slice(0, 40);
  if (f.marca && !vis.some(([m]) => m === f.marca)) vis.unshift([f.marca, 0]);
  if (!vis.length) return `<p class="unit">${bm ? "Nenhuma marca com esse nome." : "Sem marca informada nestes produtos."}</p>`;
  return vis.map(([m, n]) => `<button class="chip ${f.marca === m ? "on" : ""}" data-f="marca" data-v="${esc(m)}">${esc(m)}${n ? ` <small>${n}</small>` : ""}</button>`).join("")
    + (marcas.length > 40 && !bm ? `<p class="unit">Mostrando as 40 marcas com mais produtos. Procure pelo nome para ver as outras.</p>` : "");
}
function folhaFiltros() {
  const f = filtroAtual(), base = baseAtual();
  const total = base.reduce((s, it) => s + (passa(it, f) ? 1 : 0), 0);
  const cats = [...contarOpcoes(base, f, "categoria", (it) => it.c)].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  if (f.categoria && !cats.some(([c]) => c === f.categoria)) cats.unshift([f.categoria, 0]);
  const rolagem = $(".folha-corpo") ? $(".folha-corpo").scrollTop : 0;
  $("#folha-conteudo").innerHTML = `
    <h3 class="folha-titulo">Filtrar ${estado.busca.trim() ? `“${esc(estado.busca.trim())}”` : "o catálogo"}</h3>
    <div class="grupo-filtro"><h4>Mostrar só</h4><div class="chips-wrap">
      <button class="chip ${f.multi ? "on" : ""}" data-f="multi">Em 2+ mercados</button>
      <button class="chip ${f.promo ? "on" : ""}" data-f="promo">Em promoção / encarte</button>
    </div></div>
    <div class="grupo-filtro"><h4>Faixa de preço</h4><div class="chips-wrap">
      ${FAIXAS.map(([v, t]) => `<button class="chip ${f.preco === v ? "on" : ""}" data-f="preco" data-v="${v}">${t}</button>`).join("")}
    </div></div>
    <div class="grupo-filtro"><h4>Categoria</h4>
      <select data-f="categoria" aria-label="Categoria"><option value="">Todas as categorias</option>${cats.map(([c, n]) => `<option value="${esc(c)}" ${c === f.categoria ? "selected" : ""}>${esc(c)}${n ? ` (${n})` : ""}</option>`).join("")}</select>
    </div>
    <div class="grupo-filtro"><h4>Marca</h4>
      <input id="busca-marca" class="campo" type="search" placeholder="Procurar marca" autocomplete="off" value="${esc(estado.buscaMarca)}">
      <div id="lista-marcas" class="chips-wrap marcas">${htmlMarcas()}</div>
    </div>
    <div class="folha-rodape">
      <button class="botao-sec" data-limpar>Limpar</button>
      <button class="botao-ver" data-fechar>Ver ${total.toLocaleString("pt-BR")} ${total === 1 ? "produto" : "produtos"}</button>
    </div>`;
  if ($(".folha-corpo")) $(".folha-corpo").scrollTop = rolagem;
}
function abrirFiltros() {
  estado.folha = "filtros";
  estado.buscaMarca = "";
  folhaFiltros();
  mostrarFolha();
  $(".folha-corpo").scrollTop = 0;
}
function mudarFiltro(campo, v, tirar = false) {
  const f = filtroAtual();
  const booleano = campo === "multi" || campo === "promo";
  if (tirar) f[campo] = booleano ? false : "";
  else if (booleano) f[campo] = !f[campo];
  else if (campo === "mercado" || campo === "ordem") f[campo] = v;
  else f[campo] = f[campo] === v ? "" : v;  // tocar de novo desmarca
  estado.catMostrar = estado.buscaMostrar = 40;
  desenhar(true);
  if (estado.folha === "filtros") folhaFiltros();
}
function limparFiltros() {
  const f = filtroAtual();
  Object.assign(f, FILTRO_VAZIO);
  estado.buscaMarca = "";
  estado.catMostrar = estado.buscaMostrar = 40;
  desenhar(true);
  if (estado.folha === "filtros") folhaFiltros();
}

/* ---------------------------------------------------------------- componentes */
const SVG_CORACAO = `<svg viewBox="0 0 24 24"><path d="M12 20.5s-7-4.3-8.9-8.6C1.7 8.5 3.8 5 7.2 5c1.9 0 3.4 1 4.8 2.6C13.4 6 14.9 5 16.8 5c3.4 0 5.5 3.5 4.1 6.9-1.9 4.3-8.9 8.6-8.9 8.6z"/></svg>`;

function foto(it, cls = "foto") {
  return it.f ? `<img class="${cls}" src="${esc(it.f)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="sem-foto"></div>`;
}
// versão maior da foto para o zoom (o Shibata entrega 500x500 no mesmo endereço)
const fotoGrande = (u) => String(u || "").replace("/250x250/", "/500x500/");

// menor preço de atacado entre os mercados (ex.: "a partir de 6 un")
function melhorAtacado(it) {
  let r = null;
  for (const [m, o] of Object.entries(it.o)) {
    for (const a of o.at || []) if (a.preco < o.p && (!r || a.preco < r.preco)) r = { m, ...a };
  }
  return r;
}

function card(it) {
  const ofs = ofertasOrdenadas(it);
  const multi = ofs.length > 1;
  let selo = "";
  if (multi && it.eco >= 0.01) selo = `<span class="selo">economize ${R(it.eco)}</span>`;
  else {
    const pr = ofs[0][1].pr;
    if (pr && pr.preco_de) selo = `<span class="selo vermelho">-${Math.round((pr.preco_de - ofs[0][1].p) / pr.preco_de * 100)}%</span>`;
  }
  const linhas = ofs.map(([m, o], idx) => `
    <div class="linha-preco ${multi && idx === 0 ? "melhor" : ""}">
      <span class="mk">${esc(nomeMercado(m))}</span>
      <span class="v">${o.pr && o.pr.preco_de ? `<span class="de">${R(o.pr.preco_de)}</span>` : ""}${R(o.p)}</span>
    </div>`).join("");
  const u = precoUnit(it, ofs[0][1].p);
  const at = melhorAtacado(it);
  return `
  <div class="card" data-k="${esc(it.k)}" role="button" tabindex="0">
    ${selo}
    <button class="coracao ${favs.has(it.k) ? "on" : ""}" data-fav="${esc(it.k)}" aria-label="Favoritar">${SVG_CORACAO}</button>
    <div class="card-foto">${foto(it)}${controleCard(it.k)}</div>
    <div class="nome">${esc(it.n)}</div>
    <div class="precos">${linhas}</div>
    ${u ? `<div class="unit">${u} no mais barato</div>` : ""}
    ${at ? `<div class="atacado">${esc(nomeMercado(at.m))}: <b>${R(at.preco)}</b> a partir de ${at.qtd} un</div>` : ""}
  </div>`;
}

function itemLista(it, m, direita, sub) {
  return `
  <div class="item-lista" data-k="${esc(it.k)}" role="button" tabindex="0">
    ${it.f ? `<img src="${esc(it.f)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="sem-foto"></div>`}
    <span class="meio"><div class="t">${esc(it.n)}</div><div class="s">${esc(sub || nomeMercado(m))}</div></span>
    <span class="dir">${direita}</span>
    ${controleCard(it.k, "linha")}
  </div>`;
}

/* ---------------------------------------------------------------- vitrine do início */
const SVG_RAIO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 14h6.5L9 22l11-13h-6.8z"/></svg>`;
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const ddmm = (iso) => String(iso).split("-").reverse().slice(0, 2).join("/");
// datas chegam como 2026-11-26 ou 26/11/2026 (depende do mercado)
const isoData = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || null); };
const tituloEncarte = (e) => String(e.titulo || "").replace(/\s*\([^)]*\)/g, "").replace(/\s*-\s*\d[\d\s/aà-]*$/i, "").trim() || "Encarte";

// banner dos encartes que passa sozinho (toque leva para a aba Encartes)
function heroHTML() {
  const hoje = hojeLocal();
  const encs = (FEED.encartes || []).map((e) => ({ ...e, fim: isoData(e.fim) })).filter((e) => e.imagens && e.imagens.length && (!e.fim || e.fim >= hoje));
  if (!encs.length) return "";
  const slides = encs.map((e, i) => {
    const cor = (MERCADOS[e.mercado] || {}).cor || "";
    const quando = e.fim ? `<span data-fim="${esc(e.fim)}"></span>` : esc(e.periodo ? "Válido " + e.periodo : "");
    return `<button class="hero-slide ${i ? "" : "atual"}" data-aba="encartes" style="--cor-m:${esc(cor)}" aria-label="Ver encarte">
      <img src="${esc(e.imagens[0])}" alt="" ${i ? 'loading="lazy"' : ""} referrerpolicy="no-referrer">
      <span class="hero-texto"><span class="hm">${esc(nomeMercado(e.mercado))}</span><h3>${esc(tituloEncarte(e))}</h3><p>${quando}${quando ? " · " : ""}${e.imagens.length} ${e.imagens.length === 1 ? "página" : "páginas"}</p></span>
    </button>`;
  }).join("");
  return `<div class="hero"><div class="hero-trilho">${slides}</div>${encs.length > 1 ? `<div class="pontos">${encs.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}</div>`;
}

let _hero = null;
function prepararHero(c) {
  if (_hero) { clearInterval(_hero.t); _hero = null; }
  const tr = c.querySelector(".hero-trilho");
  if (!tr || tr.children.length < 2) return;
  const pontos = c.querySelectorAll(".pontos i");
  _hero = { toque: 0, idx: 0 };
  const marcar = () => {
    const i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
    if (i === _hero.idx && tr.children[i].classList.contains("atual")) return;
    _hero.idx = i;
    [...tr.children].forEach((s, j) => s.classList.toggle("atual", j === i));
    pontos.forEach((p, j) => p.classList.toggle("on", j === i));
  };
  tr.addEventListener("scroll", () => { clearTimeout(_hero && _hero.sc); if (_hero) _hero.sc = setTimeout(marcar, 60); }, { passive: true });
  tr.addEventListener("pointerdown", () => { if (_hero) _hero.toque = Date.now(); }, { passive: true });
  if (reduzir()) return;
  _hero.t = setInterval(() => {
    if (!_hero || document.hidden || Date.now() - _hero.toque < 7000 || !tr.isConnected) return;
    const prox = (_hero.idx + 1) % tr.children.length;
    tr.scrollTo({ left: prox * tr.clientWidth, behavior: "smooth" });
  }, 4500);
}

// ofertas relâmpago: maiores descontos de encarte e de site, com contagem regressiva do encarte
function relampagoHTML() {
  const hoje = hojeLocal(), vistos = new Set(), lista = [];
  for (const e0 of FEED.promos_encarte || []) {
    const e = { ...e0, fim: isoData(e0.fim) };
    if (!e.k || !MAPA.has(e.k) || !e.preco_normal || e.preco_normal <= e.preco || (e.fim && e.fim < hoje)) continue;
    lista.push({ k: e.k, m: e.m, de: e.preco_normal, por: e.preco, pct: Math.round((e.preco_normal - e.preco) / e.preco_normal * 100), fim: e.fim });
  }
  for (const p of FEED.promocoes || []) if (MAPA.has(p.k)) lista.push({ ...p });
  lista.sort((a, b) => b.pct - a.pct);
  const top = [];
  for (const x of lista) {
    if (x.pct < 10 || vistos.has(x.k)) continue;
    vistos.add(x.k);
    top.push(x);
    if (top.length >= 20) break;
  }
  if (!top.length) return { html: "", chaves: vistos };
  const fins = top.map((x) => x.fim).filter((f) => f && f >= hoje).sort();
  const fimEnc = fins[0] || (FEED.encartes || []).map((e) => isoData(e.fim)).filter((f) => f && f >= hoje).sort()[0];
  const cards = top.map((x) => {
    const it = MAPA.get(x.k);
    return `<div class="rl" data-k="${esc(x.k)}" role="button" tabindex="0">
      <span class="rl-pct">-${x.pct}%</span>${foto(it)}
      <div class="rl-preco">${R(x.por)}</div><span class="de">${R(x.de)}</span>
      <div class="rl-nome">${esc(it.n)}</div>
      <div class="barra" style="--w:${Math.min(100, x.pct)}%"><i></i></div>
      <div class="rl-m">${esc(nomeMercado(x.m))}${x.fim ? " · até " + ddmm(x.fim) : ""}</div>
    </div>`;
  }).join("");
  return {
    chaves: vistos,
    html: `<section class="secao"><div class="relampago-cab"><h2>${SVG_RAIO}Ofertas relâmpago</h2>${fimEnc ? `<span class="contador">acaba em <span data-fim="${esc(fimEnc)}" data-modo="caixas"></span></span>` : ""}</div>
      <div class="relampago">${cards}</div></section>`,
  };
}

function secaoFavs() {
  const favItens = [...favs].map((k) => MAPA.get(k)).filter(Boolean);
  return `<div id="sec-favs">${favItens.length ? `<section class="secao"><h2>Seus favoritos <small>${favItens.length}</small></h2><div class="trilho">${favItens.map((it) => card(it)).join("")}</div></section>` : ""}</div>`;
}

/* ---------------------------------------------------------------- telas */
function telaInicio() {
  const partes = [];
  const hojeISO = new Date().toISOString().slice(0, 10);
  if (FEED.data && FEED.data < hojeISO && (new Date(hojeISO) - new Date(FEED.data)) > 36 * 3600e3) {
    partes.push(`<div class="aviso">Os preços são de ${esc(FEED.atualizado)}. A coleta de hoje ainda não rodou.</div>`);
  }
  partes.push(heroHTML());
  const conta = (n) => `<b data-contar="${n}">${n.toLocaleString("pt-BR")}</b>`;
  const chips = Object.entries(FEED.totais || {}).map(([m, n]) => `<span class="chip-info">${esc(nomeMercado(m))}: ${conta(n)} ${soEncarte(m) ? "ofertas" : "produtos"}</span>`).join("");
  partes.push(`<div class="resumo"><span class="chip-info">${conta(FEED.comparaveis || 0)} comparados</span>${chips}</div>`);

  const rel = relampagoHTML();
  partes.push(rel.html);
  partes.push(secaoFavs());

  const baratos = (FEED.mais_baratos || []).map((k) => MAPA.get(k)).filter(Boolean).slice(0, 20);
  if (baratos.length) {
    partes.push(`<section class="secao"><h2>Onde está mais barato hoje <small>mesmo produto</small></h2><div class="trilho">${baratos.map((it) => card(it)).join("")}</div></section>`);
  }

  const baixaram = (FEED.baixaram || []).filter((b) => MAPA.has(b.k)).slice(0, 12);
  if (baixaram.length) {
    partes.push(`<section class="secao"><h2>Baixou de preço <small>desde a última coleta</small></h2><div class="lista">${
      baixaram.map((b) => itemLista(MAPA.get(b.k), b.m, `<div class="queda pct">-${b.pct}%</div><div class="s"><span class="de">${R(b.de)}</span>${R(b.por)}</div>`)).join("")
    }</div></section>`);
  }

  const promos = (FEED.promocoes || []).filter((p) => MAPA.has(p.k) && !rel.chaves.has(p.k)).slice(0, 12);
  if (promos.length) {
    partes.push(`<section class="secao"><h2>Mais promoções nos sites <small>maior desconto</small></h2><div class="lista">${
      promos.map((p) => itemLista(MAPA.get(p.k), p.m, `<div class="queda pct">-${p.pct}%</div><div class="s"><span class="de">${R(p.de)}</span>${R(p.por)}</div>`)).join("")
    }</div></section>`);
  }

  const enc = (FEED.promos_encarte || []).slice(0, 15);
  if (enc.length) {
    partes.push(`<section class="secao"><h2>Ofertas dos encartes <small>lidas por IA</small></h2><div class="lista">${
      enc.map((e) => {
        const it = e.k ? MAPA.get(e.k) : null;
        const nome = [e.produto, e.marca, e.tamanho].filter(Boolean).join(" · ");
        const img = (it && it.f) || e.foto;
        return `<div class="item-lista" role="button" tabindex="0" ${it ? `data-k="${esc(it.k)}"` : `data-encarte="${esc(e.img)}"`}>${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="sem-foto"></span>`}<span class="meio"><div class="t">${esc(nome)}</div><div class="s">${esc(nomeMercado(e.m))}${e.condicao ? " · " + esc(e.condicao) : ""}</div></span><span class="dir"><div class="queda">${R(e.preco)}</div>${e.preco_normal ? `<div class="s"><span class="de">${R(e.preco_normal)}</span></div>` : ""}</span>${it ? controleCard(it.k, "linha") : ""}</div>`;
      }).join("")
    }</div></section>`);
  }
  if (!baratos.length && !baixaram.length && !promos.length) partes.push(`<p class="vazio">Ainda não há comparações. Elas aparecem depois da primeira coleta completa.</p>`);
  return partes.join("");
}

function grade(lista, mostrar, qual) {
  return `<div class="grade">${lista.slice(0, mostrar).map((it) => card(it)).join("")}</div>
    ${lista.length > mostrar ? `<button class="mais" data-mais="${qual}">Mostrar mais</button>` : ""}`;
}

const listaCatalogo = () => ordenar(ITENS.filter((it) => passa(it, estado.cat)), estado.cat);
const listaBusca = () => ordenar(achadosBusca().filter((it) => passa(it, estado.fb)), estado.fb);

// rolagem sem fim: quando o fim da grade aparece, entram mais 40 produtos (sem redesenhar a tela)
function maisCards(qual) {
  const btn = $(`[data-mais="${qual}"]`);
  const gradeEl = btn && btn.previousElementSibling;
  if (!btn || !gradeEl) return;
  const lista = qual === "cat" ? listaCatalogo() : listaBusca();
  const ini = qual === "cat" ? estado.catMostrar : estado.buscaMostrar, fim = ini + 40;
  if (qual === "cat") estado.catMostrar = fim; else estado.buscaMostrar = fim;
  const tmp = document.createElement("div");
  tmp.innerHTML = lista.slice(ini, fim).map((it) => card(it)).join("");
  const novos = [...tmp.children];
  novos.forEach((el, i) => {
    gradeEl.appendChild(el);
    if (animavel()) el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: Math.min(i, 12) * 30, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
  });
  observarVistos(gradeEl);
  if (lista.length <= fim) btn.remove(); else observarMais(btn.parentElement);
}

function telaCatalogo() {
  const f = estado.cat;
  const lista = listaCatalogo();
  return `${barraFiltros(f)}
    <p class="contagem">${lista.length.toLocaleString("pt-BR")} produtos</p>
    ${lista.length ? grade(lista, estado.catMostrar, "cat") : `<p class="vazio">Nenhum produto com esses filtros.</p>`}`;
}

function telaBusca() {
  const achados = achadosBusca();
  if (!achados.length) return `<p class="vazio">Nada encontrado para “${esc(estado.busca)}”.</p>`;
  const f = estado.fb;
  const res = listaBusca();
  return `${barraFiltros(f)}
    <p class="contagem">${res.length.toLocaleString("pt-BR")} de ${achados.length.toLocaleString("pt-BR")} resultados${f.ordem === "relev" ? " · comparados primeiro" : ""}</p>
    ${res.length ? grade(res, estado.buscaMostrar, "busca") : `<p class="vazio">Nenhum resultado com esses filtros. <button class="link" data-limpar>Limpar filtros</button></p>`}`;
}

function telaFavoritos() {
  const lista = [...favs].map((k) => MAPA.get(k)).filter(Boolean);
  const sumidos = favs.size - lista.length;
  if (!lista.length) return `<p class="vazio">Toque no coração de um produto para acompanhar o preço dele aqui.</p>`;
  return `<p class="contagem">${lista.length} favoritos${sumidos ? ` · ${sumidos} sem preço hoje` : ""}</p><div class="grade">${lista.map((it) => card(it)).join("")}</div>`;
}

function telaEncartes() {
  const encs = FEED.encartes || [];
  if (!encs.length) return `<p class="vazio">Nenhum encarte encontrado hoje.</p>`;
  return encs.map((e) => {
    const validade = e.inicio && e.fim ? `Válido de ${ddmm(isoData(e.inicio))} a ${ddmm(isoData(e.fim))}` : (e.periodo ? `Válido ${e.periodo}` : "");
    return `<div class="encarte"><h3>${esc(nomeMercado(e.mercado))} · ${esc(e.titulo)}</h3><p>${esc(validade)} · toque para ampliar</p>
      <div class="paginas">${e.imagens.map((u) => `<img src="${esc(u)}" alt="Página do encarte" loading="lazy" referrerpolicy="no-referrer" data-zoom="${esc(u)}">`).join("")}</div></div>`;
  }).join("");
}

const SVG_CARRINHO_GRANDE = `<svg class="traco" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 3.5h2.6l2.4 10.5h10.6l2.2-7.5H6"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>`;
const curto = (t, n = 30) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

function notaOferta(x) {
  const o = x.melhor.o, notas = [];
  if (x.melhor.at) notas.push(`preço de atacado: ${R(x.melhor.at.preco)} cada a partir de ${x.melhor.at.qtd} un`);
  else {
    const prox = (o.at || []).filter((a) => a.preco < o.p && x.q < a.qtd).sort((a, b) => a.qtd - b.qtd)[0];
    if (prox) notas.push(`levando ${prox.qtd} un sai ${R(prox.preco)} cada`);
  }
  if (o.pr && o.pr.condicao) notas.push(esc(o.pr.condicao));
  if (o.pr && /descontou|app|cart[ãa]o|clube/i.test(o.pr.tipo || "")) notas.push(esc(o.pr.tipo));
  if (o.av) notas.push(esc(o.av));
  return notas.length ? `<div class="gm-nota">${notas.join(" · ")}</div>` : "";
}

function telaCarrinho() {
  if (!carrinho.size) {
    return `<div class="carrinho-vazio">${SVG_CARRINHO_GRANDE}<p><b>Seu carrinho está vazio.</b></p>
      <p>Toque no <b>+</b> de um produto para ir montando a compra. Aqui aparece quanto fica em cada mercado e onde comprar cada item.</p></div>`;
  }
  const c = calcularCarrinho();
  const un = c.itens.reduce((s, x) => s + x.q, 0);
  const partes = [];
  partes.push(`<section class="secao"><h2>Seu carrinho <small>${c.itens.length} ${c.itens.length === 1 ? "produto" : "produtos"} · ${un} ${un === 1 ? "unidade" : "unidades"}</small></h2>
    ${c.itens.length ? `<div class="lista">${c.itens.map((x) => {
      const m = x.melhor, varios = Object.keys(x.it.o).length > 1;
      return `<div class="item-lista" data-k="${esc(x.k)}" role="button" tabindex="0">
        ${x.it.f ? `<img src="${esc(x.it.f)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="sem-foto"></div>`}
        <span class="meio"><div class="t">${esc(x.it.n)}</div><div class="s">${R(m.p)}${porKg(x.it) ? "/kg" : " cada"} no ${esc(nomeMercado(m.m))}${varios ? " · mais barato" : ""}</div></span>
        ${controleCard(x.k, "linha")}</div>`;
    }).join("")}</div>` : ""}
    ${c.sumidos.length ? `<div class="aviso">${c.sumidos.length === 1 ? "1 item do carrinho está" : `${c.sumidos.length} itens do carrinho estão`} sem preço hoje (saiu do site do mercado). <button class="link" data-sumidos>Tirar do carrinho</button></div>` : ""}
    <div class="acoes-carrinho">
      <button class="botao-sec" data-compartilhar>Compartilhar lista</button>
      <button class="botao-sec perigo ${estado.esvaziar ? "on" : ""}" data-esvaziar>${estado.esvaziar ? "Toque de novo para esvaziar" : "Esvaziar carrinho"}</button>
    </div></section>`);
  if (!c.itens.length) return partes.join("");

  const completo = c.porMercado.find((r) => !r.faltam.length);
  const eco = completo ? arred(completo.total) - arred(c.totalCombo) : 0;
  partes.push(`<section class="secao"><h2>Comprando cada item onde é mais barato</h2>
    <div class="total-box"><span>Total</span><b data-total="${arred(c.totalCombo)}">${R(arred(c.totalCombo))}</b><small>${c.grupos.length === 1 ? "tudo no " + esc(nomeMercado(c.grupos[0].m)) : `em ${c.grupos.length} mercados`}</small></div>
    ${eco >= 0.01 ? `<p class="economia" data-eco="${arred(eco)}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15.9V19h-2v-1.1c-1.7-.3-3-1.4-3.1-3h2c.1.8.9 1.4 2.1 1.4 1.3 0 2-.6 2-1.4 0-.7-.5-1.2-2.2-1.6-2-.5-3.4-1.2-3.4-3 0-1.4 1.1-2.5 2.6-2.8V6.4h2v1.1c1.6.3 2.6 1.4 2.7 2.8h-2c-.1-.8-.7-1.3-1.8-1.3-1.1 0-1.7.5-1.7 1.2 0 .7.6 1.1 2.2 1.5 2.1.5 3.4 1.3 3.4 3.1 0 1.5-1.1 2.6-2.8 2.9z"/></svg><span>Economia de <b>${R(eco)}</b> em relação a comprar tudo no ${esc(nomeMercado(completo.m))}.</span></p>` : ""}
    ${c.grupos.map((g) => `<div class="grupo-mercado">
      <div class="gm-topo"><b>${esc(nomeMercado(g.m))}</b><b>${R(arred(g.total))}</b></div>
      ${(MERCADOS[g.m] || {}).obs ? `<div class="gm-obs">${esc(MERCADOS[g.m].obs)}</div>` : ""}
      ${g.itens.map((x) => `<div class="gm-linha" data-k="${esc(x.k)}" role="button" tabindex="0"><span>${x.q}${porKg(x.it) ? " kg" : "×"} ${esc(x.it.n)}</span><span>${R(arred(x.sub))}</span></div>${notaOferta(x)}`).join("")}
    </div>`).join("")}</section>`);

  partes.push(`<section class="secao"><h2>Comprando tudo num mercado só</h2><div class="lista">${c.porMercado.map((r) => {
    const melhor = completo && r.m === completo.m;
    const sub = r.faltam.length
      ? `faltam ${r.faltam.length}: ${r.faltam.slice(0, 3).map((it) => esc(curto(it.n))).join(", ")}${r.faltam.length > 3 ? "…" : ""}`
      : (melhor ? "tem tudo · o mais barato" : "tem tudo");
    return `<div class="linha-total ${r.faltam.length ? "incompleto" : ""} ${melhor ? "melhor" : ""}">
      <span class="lt-nome"><b>${esc(nomeMercado(r.m))}</b><small>${sub}</small></span>
      <span class="lt-valor"><b>${R(arred(r.total))}</b>${r.faltam.length ? "<small>sem os que faltam</small>" : ""}</span></div>`;
  }).join("")}</div>
  ${completo ? "" : `<p class="unit">Nenhum mercado tem todos os itens hoje.</p>`}</section>`);
  partes.push(`<p class="unit nota-carrinho">Preços da coleta de ${esc(FEED.atualizado)}. Preço de atacado já entra na conta quando a quantidade alcança o mínimo. Promoções com condição (app, cartão, clube) aparecem embaixo do item.</p>`);
  return partes.join("");
}

async function compartilhar() {
  const c = calcularCarrinho();
  if (!c.itens.length) return;
  const linhas = [`Lista de compras · ${document.title}`, ""];
  for (const g of c.grupos) {
    linhas.push(`*${nomeMercado(g.m)}* · ${R(arred(g.total))}`);
    for (const x of g.itens) linhas.push(`• ${x.q}${porKg(x.it) ? " kg" : "×"} ${x.it.n} · ${R(arred(x.sub))}`);
    linhas.push("");
  }
  linhas.push(`Total: ${R(arred(c.totalCombo))}`);
  const texto = linhas.join("\n");
  if (navigator.share) {
    try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
}

function detalhe(k, origem = null) {
  const it = MAPA.get(k);
  if (!it) return;
  estado.folha = "detalhe";
  estado.detalhe = k;
  const ofs = ofertasOrdenadas(it);
  const linhas = ofs.map(([m, o], idx) => {
    const extras = [];
    if (o.pr) {
      const p = o.pr;
      extras.push(`${esc(p.tipo || "Promoção")}${p.preco_de ? ` (de ${R(p.preco_de)})` : ""}${p.ate ? ` · até ${esc(p.ate)}` : ""}${p.condicao ? ` · ${esc(p.condicao)}` : ""}`);
    }
    if (o.av) extras.push(`<b>${esc(o.av)}</b>`);
    if (o.at && o.at.length) extras.push("Atacado: " + o.at.map((a) => `${a.qtd}+ un por ${R(a.preco)} cada`).join(", "));
    if (o.a) extras.push(`Antes: ${R(o.a)}`);
    if (o.m30 != null && o.p <= o.m30 && o.a) extras.push("Menor preço dos últimos 30 dias");
    if (o.d === false) extras.push(`Sem estoque em ${CIDADE} no site`);
    if ((MERCADOS[m] || {}).obs) extras.push(esc(MERCADOS[m].obs));
    const u = precoUnit(it, o.p);
    return `<div class="det-mercado anima ${ofs.length > 1 && idx === 0 ? "melhor" : ""}" style="--i:${idx + 1}">
      <div class="l1"><span class="nm">${esc(nomeMercado(m))}${ofs.length > 1 && idx === 0 ? `<span class="tag-melhor">mais barato</span>` : ""}</span><span class="pr">${R(o.p)}</span></div>
      ${u ? `<div class="extra">${u}</div>` : ""}
      ${extras.map((x) => `<div class="extra">${x}</div>`).join("")}
      ${o.n && o.n !== it.n ? `<div class="extra">No site: ${esc(o.n)}</div>` : ""}
      ${o.u ? `<div class="extra"><a href="${esc(o.u)}" target="_blank" rel="noopener">${/\.(jpe?g|png|webp|pdf)(\?|#|$)/i.test(o.u) ? "Ver a página do encarte" : "Ver no site do " + esc(nomeMercado(m))}</a></div>` : ""}
    </div>`;
  }).join("");
  const q = qtdCarrinho(k);
  const n = ofs.length + 1;
  $("#folha-conteudo").innerHTML = `
    <div class="det-topo anima" style="--i:0">${it.f ? `<button class="det-foto" data-zoom="${esc(it.f)}" aria-label="Ampliar a foto"><img src="${esc(it.f)}" alt="" referrerpolicy="no-referrer"><span class="lupa" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 4a6 6 0 1 0 3.5 10.9l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1 1.5h2v1.5h1.5v2H11v1.5H9V11H7.5V9H9z"/></svg></span></button>` : `<div class="sem-foto"></div>`}
      <div><h3>${esc(it.n)}</h3><div class="unit">${esc(it.c)}${it.mc ? " · " + esc(it.mc) : ""}</div></div></div>
    ${ofs.length === 1 ? `<p class="unit">Só encontrado no ${esc(nomeMercado(ofs[0][0]))} hoje.</p>` : ""}
    ${linhas}
    <div class="det-acoes anima" style="--i:${n}">
      ${q ? `<div class="det-carrinho"><span>No carrinho</span>${controleCard(k, "grande")}</div>`
          : `<button class="botao-carrinho" data-add="${esc(k)}">+ Adicionar ao carrinho</button>`}
      <button class="botao-fav ${favs.has(k) ? "on" : ""}" data-fav="${esc(k)}">${favs.has(k) ? "♥ Nos favoritos" : "♡ Favoritar"}</button>
    </div>`;
  const abriu = mostrarFolha();
  if (abriu) { $(".folha-corpo").scrollTop = 0; voarFoto(origem); }
}

// abre a folha de baixo subindo com mola; devolve true se ela estava fechada
let _folhaT = 0;
function mostrarFolha() {
  const f = $("#folha");
  const abrir = f.hidden || f.classList.contains("fechando");
  clearTimeout(_folhaT);
  f.classList.remove("fechando");
  $(".folha-corpo").style.transform = "";
  f.hidden = false;
  if (abrir && !reduzir()) {
    f.classList.remove("abrindo");
    void f.offsetWidth;
    f.classList.add("abrindo");
    _folhaT = setTimeout(() => f.classList.remove("abrindo"), 950);
  }
  return abrir;
}

function fecharFolha() {
  const f = $("#folha");
  estado.folha = null;
  estado.detalhe = null;
  if (f.hidden) return;
  clearTimeout(_folhaT);
  if (reduzir()) { f.hidden = true; return; }
  f.classList.remove("abrindo");
  f.classList.add("fechando");
  _folhaT = setTimeout(() => { f.hidden = true; f.classList.remove("fechando"); $(".folha-corpo").style.transform = ""; }, 240);
}

// arrastar o puxador para baixo fecha a folha
(function prepararPuxador() {
  const p = $(".puxador"), corpo = $(".folha-corpo");
  if (!p || !corpo) return;
  let y0 = null, dy = 0;
  p.addEventListener("pointerdown", (ev) => { y0 = ev.clientY; dy = 0; p.setPointerCapture(ev.pointerId); corpo.style.transition = "none"; });
  p.addEventListener("pointermove", (ev) => {
    if (y0 == null) return;
    dy = Math.max(0, ev.clientY - y0);
    corpo.style.transform = `translateY(${dy}px)`;
  });
  const soltar = () => {
    if (y0 == null) return;
    y0 = null;
    corpo.style.transition = "";
    if (dy > 90) fecharFolha();
    else if (dy > 0) {
      corpo.style.transition = "transform .25s cubic-bezier(.3,1.3,.5,1)";
      corpo.style.transform = "";
      setTimeout(() => { corpo.style.transition = ""; }, 260);
    }
  };
  p.addEventListener("pointerup", soltar);
  p.addEventListener("pointercancel", soltar);
})();

/* ---------------------------------------------------------------- zoom da foto (dois dedos, toque duplo ou rodinha do mouse) */
const Z = { s: 1, x: 0, y: 0, dedos: new Map(), pinca: null, arraste: null, ultimoToque: 0, moveu: false };
function abrirZoom(src) {
  const img = $("#zoom-img");
  img.onerror = () => { img.onerror = null; img.src = src; };  // sem versão grande: usa a normal
  img.src = fotoGrande(src);
  Object.assign(Z, { s: 1, x: 0, y: 0, pinca: null, arraste: null });
  Z.dedos.clear();
  aplicarZoom(false);
  $("#zoom").hidden = false;
}
function fecharZoom() { $("#zoom").hidden = true; $("#zoom-img").removeAttribute("src"); }
function aplicarZoom(suave) {
  const img = $("#zoom-img");
  img.style.transition = suave ? "transform .2s ease-out" : "none";
  img.style.transform = `translate(${Z.x}px, ${Z.y}px) scale(${Z.s})`;
}
function limitarZoom() {
  if (Z.s <= 1.02) { Z.s = 1; Z.x = 0; Z.y = 0; return; }
  Z.s = Math.min(Z.s, 5);
  const img = $("#zoom-img");
  const w = img.offsetWidth * (Z.s - 1) / 2, h = img.offsetHeight * (Z.s - 1) / 2;
  Z.x = Math.max(-w, Math.min(w, Z.x));
  Z.y = Math.max(-h, Math.min(h, Z.y));
}
// muda a escala mantendo o ponto (px, py) da tela parado
function zoomEm(px, py, novaEscala, base = Z) {
  const img = $("#zoom-img");
  const r = img.parentElement.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const dx = (px - cx - base.x) / base.s, dy = (py - cy - base.y) / base.s;
  Z.s = novaEscala;
  Z.x = px - cx - novaEscala * dx;
  Z.y = py - cy - novaEscala * dy;
}
(function prepararZoom() {
  const img = $("#zoom-img"), caixa = $("#zoom");
  if (!img || !caixa) return;
  img.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    img.setPointerCapture(ev.pointerId);
    Z.dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    Z.moveu = false;
    if (Z.dedos.size === 2) {
      const [a, b] = [...Z.dedos.values()];
      Z.pinca = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: Z.s, x: Z.x, y: Z.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      Z.arraste = null;
    } else if (Z.dedos.size === 1) {
      Z.arraste = { px: ev.clientX, py: ev.clientY, x: Z.x, y: Z.y };
    }
  });
  img.addEventListener("pointermove", (ev) => {
    if (!Z.dedos.has(ev.pointerId)) return;
    Z.dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (Z.pinca && Z.dedos.size >= 2) {
      const [a, b] = [...Z.dedos.values()];
      const s = Math.max(1, Math.min(5, Z.pinca.s * Math.hypot(a.x - b.x, a.y - b.y) / Z.pinca.dist));
      zoomEm((a.x + b.x) / 2, (a.y + b.y) / 2, s, Z.pinca);
      Z.moveu = true;
      aplicarZoom(false);
    } else if (Z.arraste && Z.s > 1) {
      Z.x = Z.arraste.x + ev.clientX - Z.arraste.px;
      Z.y = Z.arraste.y + ev.clientY - Z.arraste.py;
      if (Math.abs(ev.clientX - Z.arraste.px) + Math.abs(ev.clientY - Z.arraste.py) > 6) Z.moveu = true;
      aplicarZoom(false);
    } else if (Z.arraste && Math.abs(ev.clientX - Z.arraste.px) + Math.abs(ev.clientY - Z.arraste.py) > 6) {
      Z.moveu = true;
    }
  });
  const soltar = (ev) => {
    if (!Z.dedos.has(ev.pointerId)) return;
    Z.dedos.delete(ev.pointerId);
    if (Z.dedos.size < 2) Z.pinca = null;
    if (Z.dedos.size === 1) { const [a] = [...Z.dedos.values()]; Z.arraste = { px: a.x, py: a.y, x: Z.x, y: Z.y }; }
    if (Z.dedos.size) return;
    Z.arraste = null;
    if (!Z.moveu && ev.type === "pointerup") {
      const agora = Date.now();
      if (agora - Z.ultimoToque < 320) {  // toque duplo: aproxima no ponto tocado ou volta ao normal
        if (Z.s > 1.05) { Z.s = 1; Z.x = 0; Z.y = 0; } else zoomEm(ev.clientX, ev.clientY, 2.5);
        Z.ultimoToque = 0;
      } else Z.ultimoToque = agora;
    }
    limitarZoom();
    aplicarZoom(true);
  };
  img.addEventListener("pointerup", soltar);
  img.addEventListener("pointercancel", soltar);
  caixa.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    zoomEm(ev.clientX, ev.clientY, Math.max(1, Math.min(5, Z.s * (ev.deltaY < 0 ? 1.2 : 1 / 1.2))));
    limitarZoom();
    aplicarZoom(false);
  }, { passive: false });
})();

/* ---------------------------------------------------------------- desenho e eventos */
// animar: os cards entram em sequência (troca de tela, filtro, busca nova); direcao: -1/1 desliza do lado da aba
let _vistos = new Set(), _entradaT = 0, _contou = false;
function desenhar(animar = false, direcao = 0) {
  if (!FEED) return;
  const c = $("#conteudo");
  if (estado.busca.trim()) c.innerHTML = telaBusca();
  else c.innerHTML = { inicio: telaInicio, catalogo: telaCatalogo, favoritos: telaFavoritos, encartes: telaEncartes, carrinho: telaCarrinho }[estado.aba]();
  document.querySelectorAll(".abas button").forEach((b) => b.classList.toggle("ativa", !estado.busca.trim() && b.dataset.aba === estado.aba));
  moverIndicador();
  numerar(c);
  if (animar) {
    _vistos = new Set();
    clearTimeout(_entradaT);
    c.classList.remove("entrando");
    if (!reduzir()) {
      void c.offsetWidth;
      c.classList.add("entrando");
      _entradaT = setTimeout(() => c.classList.remove("entrando"), 1200);
      if (direcao && c.animate) c.animate([{ transform: `translateX(${direcao * 30}px)`, opacity: 0.2 }, { transform: "none", opacity: 1 }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }
  observarVistos(c);
  observarMais(c);
  prepararHero(c);
  if (!_contou) {
    _contou = true;
    c.querySelectorAll("[data-contar]").forEach((el) => contarAte(el, 0, +el.dataset.contar, (v) => Math.round(v).toLocaleString("pt-BR"), 1100));
  }
  if (!estado.busca.trim() && estado.aba === "carrinho") festejarCarrinho();
  tic();
}

function numerar(c) {
  c.querySelectorAll(".grade, .trilho, .lista, .relampago").forEach((g) => [...g.children].forEach((el, i) => el.style.setProperty("--i", i)));
  c.querySelectorAll(".secao > h2, .relampago-cab").forEach((h, i) => h.style.setProperty("--i", i));
}

function moverIndicador() {
  const ind = $(".indicador");
  if (!ind) return;
  const i = ABAS.indexOf(estado.aba);
  ind.style.width = (100 / Math.max(1, ABAS.length)) + "%";
  ind.style.setProperty("--n", Math.max(0, i));
  ind.classList.toggle("sem", !!estado.busca.trim());
}

// o preço "pisca" uma vez quando o card aparece na tela
let _olhoVisto = null;
function observarVistos(raiz) {
  if (!("IntersectionObserver" in window) || reduzir()) return;
  if (!_olhoVisto) {
    _olhoVisto = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!e.isIntersecting) continue;
        const el = e.target, k = el.dataset.k;
        _olhoVisto.unobserve(el);
        if (_vistos.has(k)) continue;
        _vistos.add(k);
        el.classList.add("visto");
      }
    }, { threshold: 0.6 });
  }
  raiz.querySelectorAll(".card:not(.visto), .rl:not(.visto)").forEach((el) => {
    if (_vistos.has(el.dataset.k)) return;
    _olhoVisto.observe(el);
  });
}

let _olhoMais = null;
function observarMais(raiz) {
  if (!("IntersectionObserver" in window)) return;
  if (!_olhoMais) {
    _olhoMais = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { _olhoMais.unobserve(e.target); maisCards(e.target.dataset.mais); }
    }, { rootMargin: "600px 0px" });
  }
  raiz.querySelectorAll("[data-mais]").forEach((b) => _olhoMais.observe(b));
}

// confete quando o carrinho mostra economia (de novo só se a economia aumentar)
let _celebrada = 0, _ultimoTotal = null;
function festejarCarrinho() {
  const tb = $("[data-total]");
  if (tb) {
    const v = +tb.dataset.total;
    if (_ultimoTotal != null && _ultimoTotal !== v) contarAte(tb, _ultimoTotal, v, (x) => R(x), 500);
    _ultimoTotal = v;
  }
  const el = $(".economia[data-eco]");
  const eco = el ? +el.dataset.eco : 0;
  if (eco >= 0.01 && eco > _celebrada + 0.009) {
    el.classList.add("festa");
    vibrar(25);
    setTimeout(confete, 150);
  }
  _celebrada = eco;
}

/* ---------------------------------------------------------------- busca: sugestões e exemplos digitando sozinhos */
const POPULARES = ["arroz 5kg", "feijão", "café", "leite", "açúcar", "óleo de soja", "picanha", "frango", "ovos", "cerveja", "sabão em pó", "papel higiênico"];
function marcar(nome, termos) {
  let s = "";
  const mapa = [];
  for (let i = 0; i < nome.length; i++) for (const ch of norm(nome[i])) { s += ch; mapa.push(i); }
  const on = new Array(nome.length).fill(false);
  for (const t of termos) {
    const p = s.indexOf(t);
    if (p >= 0) for (let j = p; j < p + t.length; j++) on[mapa[j]] = true;
  }
  let out = "", aberto = false;
  for (let i = 0; i < nome.length; i++) {
    if (on[i] !== aberto) { out += on[i] ? "<mark>" : "</mark>"; aberto = on[i]; }
    out += esc(nome[i]);
  }
  return out + (aberto ? "</mark>" : "");
}
function mostrarSugestoes() {
  const caixa = $("#sugestoes"), campo = $("#campo-busca");
  if (!caixa) return;
  if (!FEED || document.activeElement !== campo) { caixa.hidden = true; return; }
  const termo = campo.value.trim();
  if (!termo) {
    caixa.innerHTML = `<div class="sug-titulo">Buscas populares</div><div class="sug-chips">${POPULARES.map((p, i) => `<button class="chip" data-sug-termo="${esc(p)}" style="--i:${i}">${esc(p)}</button>`).join("")}</div>`;
    caixa.hidden = false;
    return;
  }
  if (norm(termo).trim() !== norm(estado.busca).trim()) return;  // ainda digitando: espera a busca
  const achados = achadosBusca();
  if (!achados.length) { caixa.hidden = true; return; }
  const termos = norm(termo).split(/\s+/).filter(Boolean);
  const nm = (it) => Object.keys(it.o).length;
  const comeca = (it) => (norm(it.n).startsWith(termos[0]) ? 1 : 0);
  const top = achados.slice().sort((a, b) => (comeca(b) - comeca(a)) || (nm(b) - nm(a)) || (a.n.length - b.n.length)).slice(0, 6);
  caixa.innerHTML = top.map((it, i) => `<button class="sug" data-sug-k="${esc(it.k)}" style="--i:${i}">
      ${it.f ? `<img src="${esc(it.f)}" alt="" referrerpolicy="no-referrer">` : `<span class="sem-foto"></span>`}
      <span class="sn">${marcar(it.n, termos)}</span>
      <span class="sp">${nm(it) > 1 ? `${nm(it)} mercados` : esc(nomeMercado(Object.keys(it.o)[0]))}<b>${R(it._min)}</b></span></button>`).join("")
    + `<button class="sug-todos" data-sug-fechar>Ver ${achados.length === 1 ? "o resultado" : `os ${achados.length.toLocaleString("pt-BR")} resultados`}</button>`;
  caixa.hidden = false;
}
function fecharSugestoes() { const c = $("#sugestoes"); if (c) c.hidden = true; }
function buscarAgora(valor) {
  const campo = $("#campo-busca");
  campo.value = valor;
  clearTimeout(espera);
  const comecou = !estado.busca.trim() && valor.trim();
  if (norm(valor).trim() !== norm(estado.busca).trim()) estado.fb = { ...FILTRO_VAZIO, mercado: estado.fb.mercado, ordem: "relev" };
  estado.busca = valor;
  estado.buscaMostrar = 40;
  if (estado.folha === "filtros") fecharFolha();
  desenhar(!!comecou || !valor.trim(), 0);
  window.scrollTo(0, 0);
}

(function exemplosDigitando() {
  const campo = $("#campo-busca");
  if (!campo || reduzir()) return;
  const ex = ["arroz 5kg", "café 500g", "leite integral", "picanha", "sabão em pó", "cerveja lata", "papel higiênico", "azeite"];
  let i = 0, j = 0, apagando = false;
  const passo = () => {
    let t = 75;
    if (document.activeElement === campo || campo.value) { campo.placeholder = "Buscar produto ou marca"; t = 700; }
    else {
      const alvo = ex[i];
      if (!apagando) { j++; if (j >= alvo.length) { apagando = true; t = 1700; } }
      else { j--; t = 35; if (j <= 0) { apagando = false; i = (i + 1) % ex.length; t = 400; } }
      campo.placeholder = "Buscar " + alvo.slice(0, j) + "|";
    }
    setTimeout(passo, t);
  };
  setTimeout(passo, 1200);
})();

document.addEventListener("click", (ev) => {
  const t = ev.target;
  const g = (sel) => t.closest(sel);
  let el;
  if (g("[data-fechar-zoom]") || t.id === "zoom") { fecharZoom(); return; }
  if ((el = g("[data-zoom]"))) { abrirZoom(el.dataset.zoom); return; }
  if ((el = g("[data-sug-k]"))) {
    const img = el.querySelector("img");
    $("#campo-busca").blur();
    fecharSugestoes();
    detalhe(el.dataset.sugK, img);
    return;
  }
  if ((el = g("[data-sug-termo]"))) { buscarAgora(el.dataset.sugTermo); $("#campo-busca").blur(); fecharSugestoes(); return; }
  if (g("[data-sug-fechar]")) { $("#campo-busca").blur(); fecharSugestoes(); return; }
  if ((el = g("[data-add]"))) {
    ev.stopPropagation();
    voarProCarrinho(el);
    vibrar(12);
    mudarCarrinho(el.dataset.add, +1);
    return;
  }
  if ((el = g("[data-qtd]"))) { ev.stopPropagation(); mudarCarrinho(el.dataset.kq, +el.dataset.qtd); return; }
  if ((el = g("[data-fav]"))) {
    ev.stopPropagation();
    const k = el.dataset.fav;
    const ligou = !favs.has(k);
    alternarFav(k);
    if (ligou) { explodirCoracao(el.querySelector("svg") || el); vibrar(15); }
    if (estado.folha === "detalhe" && estado.detalhe === k) detalhe(k);
    if (!estado.busca.trim() && estado.aba === "favoritos") desenhar();
    else {
      document.querySelectorAll(`.coracao[data-fav="${CSS.escape(k)}"]`).forEach((b) => b.classList.toggle("on", favs.has(k)));
      const sf = $("#sec-favs");
      if (sf && !estado.busca.trim() && estado.aba === "inicio") {
        sf.outerHTML = secaoFavs();
        numerar($("#conteudo"));
        observarVistos($("#conteudo"));
      }
    }
    if (ligou) popCoracao(k);
    return;
  }
  if (g("[data-fechar]")) { fecharFolha(); return; }
  if (g("[data-abrir-filtros]")) { abrirFiltros(); return; }
  if ((el = g("[data-tirar]"))) { mudarFiltro(el.dataset.tirar, null, true); return; }
  if (g("[data-limpar]")) { limparFiltros(); return; }
  if ((el = g("[data-f]")) && el.tagName === "BUTTON") { mudarFiltro(el.dataset.f, el.dataset.v); return; }
  if (g("[data-esvaziar]")) {
    if (estado.esvaziar) { carrinho.clear(); salvarCarrinho(); atualizarSelo(); estado.esvaziar = false; }
    else estado.esvaziar = true;
    desenhar();
    return;
  }
  if (g("[data-sumidos]")) {
    for (const k of [...carrinho.keys()]) if (!MAPA.has(k)) carrinho.delete(k);
    salvarCarrinho(); atualizarSelo(); desenhar();
    return;
  }
  if (g("[data-compartilhar]")) { compartilhar(); return; }
  const aba = g("[data-aba]");
  if (aba) {
    const antes = estado.busca.trim() ? -1 : ABAS.indexOf(estado.aba), depois = ABAS.indexOf(aba.dataset.aba);
    estado.aba = aba.dataset.aba;
    estado.esvaziar = false;
    estado.busca = ""; $("#campo-busca").value = "";
    fecharSugestoes();
    desenhar(true, antes < 0 || antes === depois ? 0 : Math.sign(depois - antes));
    window.scrollTo(0, 0); return;
  }
  const mais = g("[data-mais]");
  if (mais) { maisCards(mais.dataset.mais); return; }
  const enc = g("[data-encarte]");
  if (enc) { abrirZoom(enc.dataset.encarte); return; }
  const item = g("[data-k]");
  if (item) detalhe(item.dataset.k, item.querySelector("img"));
});

// sugestões: mostrar ao focar a busca, esconder ao sair dela ou tocar fora
document.addEventListener("focusin", (ev) => { if (ev.target.id === "campo-busca") mostrarSugestoes(); });
document.addEventListener("focusout", (ev) => { if (ev.target.id === "campo-busca") setTimeout(() => { if (document.activeElement !== $("#campo-busca")) fecharSugestoes(); }, 150); });
document.addEventListener("pointerdown", (ev) => { if (ev.target.closest && ev.target.closest("#sugestoes")) ev.preventDefault(); });

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    if (!$("#sugestoes").hidden) { fecharSugestoes(); $("#campo-busca").blur(); }
    else if (!$("#zoom").hidden) fecharZoom(); else fecharFolha();
    return;
  }
  if (ev.key === "Enter" && ev.target.id === "campo-busca") {
    buscarAgora(ev.target.value);
    ev.target.blur();
    fecharSugestoes();
    return;
  }
  if (ev.key === "Enter" && ev.target.matches && ev.target.matches('[role="button"][data-k]')) detalhe(ev.target.dataset.k);
});

document.addEventListener("change", (ev) => {
  const campo = ev.target.dataset && ev.target.dataset.f;
  if (campo && ev.target.tagName === "SELECT") {
    filtroAtual()[campo] = ev.target.value;
    estado.catMostrar = estado.buscaMostrar = 40;
    desenhar(true);
    if (estado.folha === "filtros") folhaFiltros();
  }
});

let espera;
document.addEventListener("input", (ev) => {
  if (ev.target.id === "campo-busca") {
    clearTimeout(espera);
    if (!ev.target.value.trim()) mostrarSugestoes();
    espera = setTimeout(() => {
      const novo = ev.target.value;
      const comecou = !estado.busca.trim() && novo.trim(), acabou = estado.busca.trim() && !novo.trim();
      // busca nova começa sem filtros, como nos sites dos mercados (fica só o mercado escolhido)
      if (norm(novo).trim() !== norm(estado.busca).trim()) estado.fb = { ...FILTRO_VAZIO, mercado: estado.fb.mercado, ordem: "relev" };
      estado.busca = novo;
      estado.buscaMostrar = 40;
      if (estado.folha === "filtros") fecharFolha();
      desenhar(!!(comecou || acabou)); window.scrollTo(0, 0);
      mostrarSugestoes();
    }, 180);
  }
  if (ev.target.id === "busca-marca") {
    estado.buscaMarca = ev.target.value;
    $("#lista-marcas").innerHTML = htmlMarcas();
  }
});

// foto que não carrega vira um quadradinho cinza (em vez do ícone de imagem quebrada)
document.addEventListener("error", (ev) => {
  const img = ev.target;
  if (img && img.tagName === "IMG" && !img.dataset.falhou && img.id !== "zoom-img") {
    img.dataset.falhou = "1";
    const d = document.createElement("div");
    d.className = "sem-foto";
    if (img.closest(".item-lista")) { d.style.width = "48px"; d.style.height = "48px"; d.style.flex = "none"; }
    img.replaceWith(d);
  }
}, true);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
atualizarSelo();
carregar();
