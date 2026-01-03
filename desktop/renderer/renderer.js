// renderer.js - Hospital ADS (Electron) UI médico
// Enfoque: topbar fija, layout full-screen, pacientes con buscador,
// expediente con tabs estilizados, notas con editar + historial.

const BACKEND_URL = "http://localhost:3000";

// Estado global
let session = {
  usuario: null,
  roles: [],
  medico: null,
};

let navStack = []; // para botón regresar
let currentView = { name: "login", params: {} };

// Cache
let cachePacientes = [];

// ------------------------------
// Helpers
// ------------------------------
function $(sel, root = document) {
  return root.querySelector(sel);
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

function escapeHtml(str) {
  return (str ?? "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function api(path, opts = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function setView(name, params = {}, { pushHistory = true } = {}) {
  if (pushHistory && currentView.name !== "login") {
    navStack.push(currentView);
  }
  currentView = { name, params };
  render();
}

function goBack() {
  if (navStack.length === 0) return;
  const prev = navStack.pop();
  currentView = prev;
  render();
}

function showToast(msg, type = "info") {
  const host = $("#ads-toast-host");
  if (!host) return alert(msg);
  const toast = h(
    "div",
    { class: `ads-toast ads-toast--${type}` },
    msg
  );
  host.appendChild(toast);
  setTimeout(() => toast.classList.add("is-show"), 10);
  setTimeout(() => {
    toast.classList.remove("is-show");
    setTimeout(() => toast.remove(), 200);
  }, 2800);
}

function iconOrText(imgName, fallback) {
  // Solo indicamos dónde poner la imagen. Tú metes el archivo en: desktop/renderer/imagenes/
  // ejemplo: desktop/renderer/imagenes/icono-back.png
  const src = `./imagenes/${imgName}`;
  return h(
    "span",
    { class: "ads-icwrap" },
    h("img", {
      class: "ads-ic",
      src,
      alt: fallback,
      onerror: (e) => {
        e.target.remove();
      },
    }),
    h("span", { class: "ads-ic-fallback" }, fallback)
  );
}

// ------------------------------
// CSS (inyectado)
// ------------------------------
function injectStyles() {
  if ($("#ads-theme")) return;
  const css = `
  :root{
    --bg:#F5F7FA;
    --card:#ffffff;
    --muted:#64748b;
    --text:#0f172a;
    --line:#e5e7eb;
    --primary:#2563eb;
    --primary-2:#1d4ed8;
    --ok:#16a34a;
    --warn:#f59e0b;
    --bad:#dc2626;
    --shadow: 0 10px 30px rgba(2, 6, 23, .06);
    --radius: 14px;
    --radius2: 12px;
  }
  *{ box-sizing:border-box; }
  body{ background:var(--bg); color:var(--text); }
  a{ color:var(--primary); text-decoration:none; }

  /* Layout */
  .ads-shell{ height:100%; }
  .ads-topbar{
    position:fixed; top:0; left:0; right:0;
    height:84px;
    display:flex; align-items:center; gap:16px;
    padding:14px 18px;
    background: rgba(245,247,250,.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
    z-index: 999;
  }
  .ads-topbar__inner{
    width: 100%;
    max-width: 1300px;
    margin: 0 auto;
    display:flex; align-items:center; gap:16px;
  }
  .ads-brand{ display:flex; align-items:center; gap:12px; min-width: 240px; }
  .ads-brand__logo{
    width:46px; height:46px; border-radius:12px;
    background: #eaf1ff;
    display:flex; align-items:center; justify-content:center;
    border: 1px solid #dbeafe;
    overflow:hidden;
  }
  .ads-brand__logo img{ width:100%; height:100%; object-fit:cover; display:block; }
  .ads-brand__txt{ line-height:1.1; }
  .ads-brand__txt b{ display:block; font-size:16px; }
  .ads-brand__txt span{ color:var(--muted); font-size:12px; }

  .ads-tabs{ display:flex; gap:10px; align-items:center; flex: 1; justify-content:center; }
  .ads-tab{
    display:flex; align-items:center; gap:10px;
    padding:10px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--card);
    cursor:pointer;
    transition: transform .08s ease, box-shadow .15s ease, border-color .15s ease;
    font-weight: 600;
  }
  .ads-tab:hover{ border-color:#cbd5e1; box-shadow: 0 8px 20px rgba(2,6,23,.05); }
  .ads-tab:active{ transform: translateY(1px); }
  .ads-tab.is-active{ background: #eaf1ff; border-color: #c7ddff; color: var(--primary-2); }

  .ads-actions{ display:flex; gap:10px; align-items:center; justify-content:flex-end; min-width: 240px; }
  .ads-iconbtn{
    width:40px; height:40px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--card);
    cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition: box-shadow .15s ease, border-color .15s ease, transform .08s ease;
  }
  .ads-iconbtn:hover{ border-color:#cbd5e1; box-shadow: 0 8px 20px rgba(2,6,23,.05); }
  .ads-iconbtn:active{ transform: translateY(1px); }

  .ads-main{
    padding: 110px 20px 24px;
  }
  .ads-container{
    width:100%;
    max-width: 1300px;
    margin: 0 auto;
    display:flex;
    flex-direction:column;
    gap:16px;
  }

  .ads-card{
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .ads-card__hd{ padding: 16px 18px; border-bottom: 1px solid var(--line); display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .ads-card__hd h2,.ads-card__hd h3{ margin:0; }
  .ads-card__bd{ padding: 16px 18px; }

  .ads-muted{ color: var(--muted); }

  /* Forms */
  .ads-row{ display:flex; gap:12px; flex-wrap:wrap; align-items:end; }
  .ads-field{ display:flex; flex-direction:column; gap:6px; min-width: 240px; flex:1; }
  .ads-field label{ font-size: 12px; color: var(--muted); font-weight: 600; }
  .ads-input, .ads-select, .ads-textarea{
    width: 100%;
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: #fff;
    outline: none;
    transition: border-color .15s ease, box-shadow .15s ease;
    font-size: 14px;
  }
  .ads-textarea{ min-height: 110px; resize: vertical; }
  .ads-input:focus, .ads-select:focus, .ads-textarea:focus{
    border-color: #b8d2ff;
    box-shadow: 0 0 0 4px rgba(37,99,235,.12);
  }

  .ads-btn{
    border: 0;
    padding: 11px 14px;
    border-radius: 12px;
    background: var(--primary);
    color: white;
    font-weight: 700;
    cursor:pointer;
    transition: transform .08s ease, filter .15s ease;
  }
  .ads-btn:hover{ filter: brightness(.98); }
  .ads-btn:active{ transform: translateY(1px); }
  .ads-btn--ghost{ background: #f1f5f9; color:#0f172a; }
  .ads-btn--danger{ background: var(--bad); }

  /* Tables */
  .ads-tablewrap{ overflow:auto; border-radius: 12px; border: 1px solid var(--line); }
  table.ads-table{ width:100%; border-collapse:collapse; min-width: 760px; }
  table.ads-table th{
    text-align:left;
    background: #eef6ff;
    border-bottom: 1px solid var(--line);
    padding: 12px;
    font-size: 13px;
  }
  table.ads-table td{ padding: 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.ads-table tr:hover td{ background: #fafcff; }

  .ads-pill{
    display:inline-flex; align-items:center; gap:6px;
    padding: 6px 10px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 12px;
    border: 1px solid var(--line);
    background: #fff;
  }
  .ads-pill--ok{ background:#ecfdf3; border-color:#bbf7d0; color: var(--ok); }
  .ads-pill--warn{ background:#fffbeb; border-color:#fde68a; color: var(--warn); }
  .ads-pill--bad{ background:#fef2f2; border-color:#fecaca; color: var(--bad); }

  /* Expediente tabs */
  .ads-subtabs{ display:flex; gap:10px; flex-wrap:wrap; }
  .ads-subtab{
    padding: 10px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: #fff;
    cursor:pointer;
    font-weight: 800;
  }
  .ads-subtab.is-active{ background:#eaf1ff; border-color:#c7ddff; color: var(--primary-2); }

  .ads-note{
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 14px;
    background: #fff;
  }
  .ads-note__hd{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
  .ads-note__meta{ font-size: 12px; color: var(--muted); }
  .ads-note__actions{ display:flex; gap:8px; }
  .ads-note__body{ margin-top: 10px; white-space: pre-wrap; }

  /* Login */
.ads-login{
  min-height: calc(100vh - 48px);
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 28px;
}

.ads-login-card{
  width: min(1120px, 96vw);
  min-height: 420px;
  display:grid;
  grid-template-columns: 1.15fr .85fr;
  gap: 0;
  overflow:hidden;
}

.ads-login-left,
.ads-login-right{
  padding: 34px;
  display:flex;
  flex-direction:column;
  justify-content:center;
}

.ads-login-left{
  background: linear-gradient(135deg, #eaf1ff, #f5f7fa);
}

.ads-login-brand{ display:flex; align-items:center; gap:14px; }

.ads-login-brand .logo{
  width: 92px;
  height: 92px;
  border-radius: 22px;
  overflow:hidden;
  background:#fff;
  border:1px solid #dbeafe;
}

.ads-login-brand .logo img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}

.ads-login-brand .txt b{ display:block; font-size:22px; }
.ads-login-brand .txt span{ color: var(--muted); font-size:14px; }

.ads-login-hero h1{ margin: 14px 0 10px; font-size: 30px; }
.ads-login-hero p{ margin: 0; color: var(--muted); font-size: 15px; }

/* Botones del login (para que no se encimen) */
.ads-login-actions{
  display:grid;
  grid-template-columns: 1fr 160px;
  gap: 12px;
  margin-top: 14px;
  align-items:center;
}

@media (max-width: 920px){
  .ads-login-card{ grid-template-columns: 1fr; min-height: unset; }
  .ads-login-actions{ grid-template-columns: 1fr; }
}

  /* Toast */
  #ads-toast-host{ position: fixed; right: 16px; bottom: 16px; display:flex; flex-direction:column; gap:10px; z-index: 2000; }
  .ads-toast{ opacity:0; transform: translateY(6px); transition: all .2s ease; padding: 12px 14px; border-radius: 12px; border:1px solid var(--line); background: #fff; box-shadow: var(--shadow); max-width: 360px; }
  .ads-toast.is-show{ opacity: 1; transform: translateY(0); }
  .ads-toast--error{ border-color:#fecaca; }
  .ads-toast--ok{ border-color:#bbf7d0; }

  /* Icons */
  .ads-icwrap{ display:inline-flex; align-items:center; gap:8px; }
  .ads-ic{ width:18px; height:18px; }
  .ads-ic-fallback{ font-size: 14px; }

  @media (max-width: 920px){
    .ads-brand{ min-width: auto; }
    .ads-actions{ min-width:auto; }
    .ads-login-card{ grid-template-columns: 1fr; }
  }
    /* Home médico */
.ads-home-grid{ display:grid; grid-template-columns: 1.25fr .75fr; gap:16px; }
@media (max-width: 980px){ .ads-home-grid{ grid-template-columns:1fr; } }

.ads-profile{ display:flex; gap:16px; align-items:center; }
.ads-avatar{
  width:84px; height:84px; border-radius:18px;
  background:#eaf1ff; border:1px solid #dbeafe;
  overflow:hidden; display:flex; align-items:center; justify-content:center;
  font-weight:900; color: var(--primary);
}
.ads-avatar img{ width:100%; height:100%; object-fit:cover; display:block; }

.ads-kpis{ display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-top:12px; }
@media (max-width: 980px){ .ads-kpis{ grid-template-columns: repeat(2, 1fr);} }

.ads-kpi{
  padding:14px;
  border:1px solid var(--line);
  border-radius: var(--radius2);
  background:#fff;
}
.ads-kpi b{ font-size:22px; display:block; margin-bottom:4px; }
.ads-kpi span{ color:var(--muted); font-size:12px; font-weight:700; }

.ads-quick{ display:flex; gap:10px; flex-wrap:wrap; }
.ads-quick .ads-btn{ padding:10px 12px; border-radius:12px; }

.ads-mini-list{ display:flex; flex-direction:column; gap:10px; }
.ads-mini-item{
  padding:12px;
  border:1px solid var(--line);
  border-radius: var(--radius2);
  background:#fff;
  display:flex;
  justify-content:space-between;
  gap:12px;
}
.ads-mini-item b{ display:block; }
.ads-mini-item small{ color:var(--muted); font-weight:700; }
/* Warning (alergias) */
.ads-alert{
  border:1px solid var(--line);
  border-radius: var(--radius2);
  padding: 12px 14px;
  background: #fff;
  display:flex;
  gap:10px;
  align-items:flex-start;
}

.ads-alert--warn{
  border-color: #F5D26A;
  background: #FFF7DB;
}

.ads-alert__icon{
  width:28px; height:28px;
  border-radius: 10px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight: 900;
  background:#FFE8A3;
  color:#6B4E00;
  flex: 0 0 auto;
}

.ads-alert__txt b{ display:block; margin-bottom:2px; }
.ads-alert__txt span{ color: var(--muted); font-weight:700; }


  `;

  const style = document.createElement("style");
  style.id = "ads-theme";
  style.textContent = css;
  document.head.appendChild(style);
}

// ------------------------------
// Layout base
// ------------------------------
function ensureShell() {
  injectStyles();
  const app = document.getElementById("app");
  if (!app) throw new Error("No se encontró #app");
  app.innerHTML = "";

  const shell = h("div", { class: "ads-shell" });

  // Topbar
  const topbar = h("header", { class: "ads-topbar", id: "ads-topbar" });
  const inner = h("div", { class: "ads-topbar__inner" });

  const brand = h(
    "div",
    { class: "ads-brand" },
    h(
      "div",
      { class: "ads-brand__logo" },
      
      h("img", {
        src: "./imagenes/logo.png",
        alt: "Hospital ADS",
        onerror: (e) => {
          // si no existe el logo, dejamos un ícono de fallback
          e.target.remove();
          const box = e.target.parentElement;
          box.textContent = "H";
          box.style.fontWeight = "900";
          box.style.color = "#2563eb";
        },
      })
    ),
    h(
      "div",
      { class: "ads-brand__txt" },
      h("b", {}, "Hospital ADS"),
      h("span", { id: "ads-brand-sub" }, "Módulo Médico")
    )
  );

  const tabs = h("nav", { class: "ads-tabs", id: "ads-tabs" },
    tabBtn("pacientes", "icono-pacientes.png", "Pacientes"),
    tabBtn("agenda", "icono-citas.png", "Agenda"),
    tabBtn("notas", "icono-notas.png", "Notas"),
    tabBtn("ordenes", "icono-lab.png", "Laboratorio")
  );

  const actions = h("div", { class: "ads-actions" },
    iconButton("Inicio", "icono-home.png", () => setView("home", {}, { pushHistory: false })),
    iconButton("Regresar", "icono-back.png", () => goBack()),
    iconButton("Recargar", "icono-recargar.png", () => render()),
    iconButton("Salir", "icono-salir.png", () => logout())
  );

  inner.appendChild(brand);
  inner.appendChild(tabs);
  inner.appendChild(actions);
  topbar.appendChild(inner);

  // Main
  const main = h("main", { class: "ads-main" },
    h("div", { class: "ads-container", id: "ads-container" })
  );

  shell.appendChild(topbar);
  shell.appendChild(main);
  shell.appendChild(h("div", { id: "ads-toast-host" }));

  app.appendChild(shell);

  // Oculta topbar en login
  if (currentView.name === "login") {
    topbar.style.display = "none";
    main.style.paddingTop = "24px";
  }
}

function tabBtn(view, iconFile, label) {
  const btn = h(
    "button",
    {
      class: "ads-tab",
      type: "button",
      onclick: () => setView(view, {}, { pushHistory: false }),
    },
    iconOrText(iconFile, ""),
    h("span", {}, label)
  );
  btn.dataset.view = view;
  return btn;
}

function iconButton(title, iconFile, onClick) {
  return h(
    "button",
    {
      class: "ads-iconbtn",
      type: "button",
      title,
      onclick: onClick,
    },
    // Pon tu icono en: desktop/renderer/imagenes/<iconFile>
    h("img", {
      src: `./imagenes/${iconFile}`,
      alt: title,
      class: "ads-ic",
      onerror: (e) => {
        e.target.remove();
        // fallback minimal
        const span = document.createElement("span");
        span.className = "ads-ic-fallback";
        span.textContent = title.slice(0, 1);
        e.currentTarget.appendChild(span);
      },
    })
  );
}

function setActiveTab() {
  const tabs = document.querySelectorAll(".ads-tab");
  tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.view === currentView.name));
}

// ------------------------------
// Login
// ------------------------------
function renderLogin() {
  const container = $("#ads-container");
  container.innerHTML = "";

  const card = h("div", { class: "ads-card ads-login-card" });

  const left = h("div", { class: "ads-login-left" },
    h("div", { class: "ads-login-brand" },
      h("div", { class: "logo" },
        // Pon tu logo en: desktop/renderer/imagenes/logo.png
        h("img", {
          src: "./imagenes/logo.png",
          alt: "Hospital ADS",
          onerror: (e) => { e.target.remove(); e.currentTarget.textContent = "H"; e.currentTarget.style.display="flex"; e.currentTarget.style.alignItems="center"; e.currentTarget.style.justifyContent="center"; e.currentTarget.style.fontWeight="900"; e.currentTarget.style.color="#2563eb"; },
        })
      ),
      h("div", { class: "txt" },
        h("b", {}, "Hospital ADS"),
        h("span", {}, "Aplicación de escritorio")
      )
    ),
    h("div", { class: "ads-login-hero" },
      h("h1", {}, "Inicio de sesión"),
      h("p", {}, "Ingresa con tu usuario del hospital. Verás las opciones según tu rol."),
      h("div", { class: "ads-alert", id: "ads-login-msg" }, "")
    )
  );

  const right = h("div", { class: "ads-login-right" });

  const form = h("form", { id: "login-form" },
    h("div", { class: "ads-field" },
      h("label", {}, "Usuario"),
      h("input", { class: "ads-input", name: "usuario", autocomplete: "username", placeholder: "usuario" })
    ),
    h("div", { class: "ads-field" },
      h("label", {}, "Contraseña"),
      h("input", { class: "ads-input", type: "password", name: "contrasena", autocomplete: "current-password", placeholder: "••••" })
    ),
    h("div", { class: "ads-login-actions" },
  h("button", { class: "ads-btn", type: "submit" }, "Ingresar"),
  h("button", {
    class: "ads-btn ads-btn--ghost",
    type: "button",
    onclick: () => {
      $("#login-form [name=usuario]").value = "";
      $("#login-form [name=contrasena]").value = "";
    }
  }, "Limpiar")
)

  );

  form.addEventListener("submit", onLogin);
  right.appendChild(form);

  card.appendChild(left);
  card.appendChild(right);

  const wrap = h("div", { class: "ads-login" }, card);
  container.appendChild(wrap);

  const msg = $("#ads-login-msg");
  msg.textContent = "";
}

async function onLogin(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const usuario = form.usuario.value.trim();
  const contrasena = form.contrasena.value.trim();
  const msg = $("#ads-login-msg");

  if (!usuario || !contrasena) {
    msg.textContent = "Debes ingresar usuario y contraseña.";
    return;
  }

  msg.textContent = "Verificando credenciales…";

  try {
    const data = await api("/api/usuarios/login", {
      method: "POST",
      body: JSON.stringify({ nombre_usuario: usuario, contrasena }),
    });

    session.usuario = data.nombre_usuario;
    session.roles = data.roles || [];
    session.medico = data.medico || null;

    // Persistimos solo para no pedir login a cada rato 
    localStorage.setItem("ads_session", JSON.stringify(session));

    if (!session.roles.includes("MEDICO")) {
      msg.textContent = `Tu usuario no es MÉDICO. Roles: ${(session.roles || []).join(", ") || "N/A"}`;
      return;
    }

    navStack = [];
    setView("home", {}, { pushHistory: false });

  } catch (err) {
    msg.textContent = err.message;
  }
}

function logout() {
  localStorage.removeItem("ads_session");
  session = { usuario: null, roles: [], medico: null };
  navStack = [];
  setView("login", {}, { pushHistory: false });
}

function hydrateSession() {
  const raw = localStorage.getItem("ads_session");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    session = data;
  } catch {
    // ignore
  }
}

// ------------------------------
// Views
// ------------------------------

function ymdToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fullName(m) {
  return `${m?.nombre || ""} ${m?.apellido_paterno || ""} ${m?.apellido_materno || ""}`.trim();
}

function initialsFromName(name) {
  const parts = (name || "").split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "M";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}
async function viewHome() {
  const container = $("#ads-container");
  container.innerHTML = "";

  const m = session.medico || {};
  const nombre = fullName(m) || "Médico";
  const esp = m.especialidad || "Sin especialidad";
  const usuario = session.usuario || "-";

  // KPIs
  const kPac = h("b", {}, "—");
  const kHoy = h("b", {}, "—");
  const kProx = h("b", {}, "—");
  const kOrd = h("b", {}, "—");
  const kOrdSub = h("span", {}, "Órdenes de laboratorio");

  const listaHoy = h("div", { class: "ads-mini-list" },
    h("div", { class: "ads-muted" }, "Cargando citas de hoy…")
  );

  const card = h("section", { class: "ads-card" },
    h("div", { class: "ads-card__hd" },
      h("div", {},
        h("h2", {}, "Home"),
        h("div", { class: "ads-muted" }, "Panel del médico")
      )
    ),
    h("div", { class: "ads-card__bd" },

      // Perfil
      h("div", { class: "ads-profile" },
        h("div", { class: "ads-avatar" },
          // Si no existe imagen, cae a iniciales
          h("img", {
            src: "./imagenes/medico.png",
            alt: "Perfil",
            onerror: (e) => {
              e.target.remove();
              e.currentTarget.textContent = initialsFromName(nombre);
            }
          })
        ),
        h("div", {},
          h("h3", { style: "margin:0" }, nombre),
          h("div", { class: "ads-muted", style: "margin-top:4px" }, `${esp} • Usuario: ${usuario}`)
        )
      ),

      h("div", { style: "height:14px" }),

      // KPIs
      h("div", { class: "ads-kpis" },
        h("div", { class: "ads-kpi" }, kPac, h("span", {}, "Pacientes asignados")),
        h("div", { class: "ads-kpi" }, kHoy, h("span", {}, "Citas hoy")),
        h("div", { class: "ads-kpi" }, kProx, h("span", {}, "Próximas citas")),
        h("div", { class: "ads-kpi" }, kOrd, kOrdSub)
      ),

      h("div", { style: "height:16px" }),

      // Citas de hoy
      h("div", { class: "ads-card", style: "box-shadow:none;" },
        h("div", { class: "ads-card__hd" },
          h("div", {},
            h("h3", {}, "Citas de hoy"),
            h("div", { class: "ads-muted" }, "Próximas 5")
          )
        ),
        h("div", { class: "ads-card__bd" }, listaHoy)
      )
    )
  );

  container.appendChild(card);

  // Cargar data (sin endpoints nuevos)
  try {
    const idMed = session.medico?.id_medico;
    if (!idMed) return;

    const hoy = ymdToday();

    const [pacientes, citasHoy, citasFH, ordenes] = await Promise.allSettled([
      api(`/api/medicos/${idMed}/pacientes`),
      api(`/api/medicos/${idMed}/citas?fecha=${hoy}`),
      api(`/api/medicos/${idMed}/citas`),
      api(`/api/medicos/${idMed}/ordenes-laboratorio`),
    ]);

    const pacList = pacientes.status === "fulfilled" ? (Array.isArray(pacientes.value) ? pacientes.value : []) : [];
    const hoyList = citasHoy.status === "fulfilled" ? (Array.isArray(citasHoy.value?.citas) ? citasHoy.value.citas : []) : [];
    const futList = citasFH.status === "fulfilled" ? (Array.isArray(citasFH.value?.futuras) ? citasFH.value.futuras : []) : [];
    const ordList = ordenes.status === "fulfilled" ? (Array.isArray(ordenes.value) ? ordenes.value : []) : [];

    kPac.textContent = String(pacList.length);
    kHoy.textContent = String(hoyList.length);
    kProx.textContent = String(futList.length);
    kOrd.textContent = String(ordList.length);

    const listos = ordList.filter(o => String(o.estado_orden || "").toLowerCase().includes("resultado")).length;
    kOrdSub.textContent = listos ? `Órdenes (Resultados listos: ${listos})` : "Órdenes de laboratorio";

    // Lista “próximas 5” de hoy
    const sorted = hoyList.slice().sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
    const next5 = sorted.slice(0, 5);

    listaHoy.innerHTML = "";
    if (!next5.length) {
      listaHoy.appendChild(h("div", { class: "ads-muted" }, "No tienes citas hoy."));
    } else {
      for (const c of next5) {
        const dt = c.fecha_hora ? new Date(c.fecha_hora) : null;
        const hora = dt ? `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}` : "-";
        const pac = `${c.nombre || ""} ${c.apellido_paterno || ""} ${c.apellido_materno || ""}`.trim() || "-";
        const est = c.estado_cita || "-";

        listaHoy.appendChild(
          h("div", { class: "ads-mini-item" },
            h("div", {}, h("b", {}, pac), h("small", {}, c.motivo || "Consulta")),
            h("div", { style: "text-align:right;" }, h("b", {}, hora), h("small", {}, est))
          )
        );
      }
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}


async function viewPacientes() {
  const container = $("#ads-container");
  container.innerHTML = "";

  const card = h("section", { class: "ads-card" });
  const hd = h("div", { class: "ads-card__hd" },
    h("div", {},
      h("h2", {}, "Pacientes asignados"),
      h("div", { class: "ads-muted", id: "ads-pac-sub" }, "")
    )
  );
  const bd = h("div", { class: "ads-card__bd" },
    h("div", { class: "ads-row" },
      h("div", { class: "ads-field", style: "flex:2; min-width:340px;" },
        h("label", {}, "Buscar"),
        h("input", { class: "ads-input", id: "ads-buscar", placeholder: "Buscar por nombre o CURP…" })
      ),
      h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: async () => { await loadPacientes(true); } }, "Actualizar lista")
    ),
    h("div", { style: "height:12px" }),
    h("div", { class: "ads-tablewrap" },
      h("table", { class: "ads-table", id: "ads-pac-table" },
        h("thead", {},
          h("tr", {},
            h("th", {}, "Nombre"),
            h("th", {}, "CURP"),
            h("th", {}, "Fecha nac."),
            h("th", {}, "Sexo"),
            h("th", {}, "Estatus"),
            h("th", {}, "Triage"),
            h("th", {}, "")
          )
        ),
        h("tbody", { id: "ads-pac-tbody" })
      )
    )
  );

  card.appendChild(hd);
  card.appendChild(bd);
  container.appendChild(card);

  await loadPacientes(false);

  const input = $("#ads-buscar");
  input.addEventListener("input", () => renderPacientesTable(input.value));
}

async function loadPacientes(force) {
  if (!session.medico?.id_medico) {
    showToast("No hay médico en sesión.", "error");
    return;
  }

  const canRenderPacientesView = !!$("#ads-pac-tbody");
  const buscarValue = $("#ads-buscar")?.value || "";

  if (!force && cachePacientes.length) {
    if (canRenderPacientesView) renderPacientesTable(buscarValue);

    const sub = $("#ads-pac-sub");
    if (sub) sub.textContent = `Mostrando ${cachePacientes.length} de ${cachePacientes.length}`;
    return;
  }

  try {
    const data = await api(`/api/medicos/${session.medico.id_medico}/pacientes`);
    cachePacientes = Array.isArray(data) ? data : [];

    if (canRenderPacientesView) renderPacientesTable(buscarValue);

    const sub = $("#ads-pac-sub");
    if (sub) sub.textContent = `Mostrando ${cachePacientes.length} de ${cachePacientes.length}`;
  } catch (err) {
    showToast(err.message, "error");
  }
}


function triagePill(triage) {
  const t = (triage || "").toLowerCase();
  if (t.includes("verde")) return h("span", { class: "ads-pill ads-pill--ok" }, "Verde");
  if (t.includes("amar")) return h("span", { class: "ads-pill ads-pill--warn" }, "Amarillo");
  if (t.includes("rojo")) return h("span", { class: "ads-pill ads-pill--bad" }, "Rojo");
  return h("span", { class: "ads-pill" }, triage || "-");
}

async function updatePacienteTriage(id_paciente, nuevoTriage) {
  const valor = (nuevoTriage || "").toString().toLowerCase().trim();
  if (!["verde", "amarillo", "rojo"].includes(valor)) {
    showToast("Triage inválido.", "error");
    return null;
  }

  await api(`/api/pacientes/${id_paciente}/triage`, {
    method: "PATCH",
    body: JSON.stringify({ triage: valor }),
  });

  // actualiza cache para que al volver a pacientes se vea el nuevo triage
  const idx = cachePacientes.findIndex((p) => Number(p.id_paciente) === Number(id_paciente));
  if (idx >= 0) cachePacientes[idx].triage = valor;

  return valor;
}


function renderPacientesTable(q) {
  const tbody = $("#ads-pac-tbody");
  if (!tbody) return;

  const query = (q || "").trim().toLowerCase();
  const rows = !query
    ? cachePacientes
    : cachePacientes.filter((p) => {
        const nombre = `${p.nombre || ""} ${p.apellido_paterno || ""} ${p.apellido_materno || ""}`.toLowerCase();
        const curp = (p.curp || "").toLowerCase();
        return nombre.includes(query) || curp.includes(query);
      });

  $("#ads-pac-sub").textContent = `Mostrando ${rows.length} de ${cachePacientes.length}`;

  tbody.innerHTML = "";
  for (const p of rows) {
    const nombre = `${p.nombre || ""} ${p.apellido_paterno || ""} ${p.apellido_materno || ""}`.trim();
    tbody.appendChild(
      h("tr", {},
        h("td", {}, nombre),
        h("td", {}, p.curp || "-"),
        h("td", {}, (p.fecha_nacimiento || "").slice(0,10)),
        h("td", {}, p.sexo || "-"),
        h("td", {}, p.estatus_afiliacion || "-"),
        h("td", {}, triagePill(p.triage)),
        h("td", {},
          h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: () => openExpediente(p.id_paciente) }, "Ver expediente")
        )
      )
    );
  }
}

async function openExpediente(id_paciente) {
  try {
    const data = await api(`/api/pacientes/${id_paciente}/resumen-expediente`);
    const expediente = data.expediente;
    if (!expediente?.id_expediente) {
      showToast("Este paciente no tiene expediente.", "error");
      return;
    }
    setView("expediente", { paciente: data.paciente, expediente }, { pushHistory: true });
  } catch (err) {
    showToast(err.message, "error");
  }
}

function viewExpediente({ paciente, expediente }) {
  const container = $("#ads-container");
  container.innerHTML = "";

  const nombre = `${paciente.nombre || ""} ${paciente.apellido_paterno || ""} ${paciente.apellido_materno || ""}`.trim();

  const headerCard = h("section", { class: "ads-card" },
    h("div", { class: "ads-card__hd" },
      h("div", {},
        h("h2", {}, "Expediente clínico"),
        h("div", { class: "ads-muted" }, `Paciente: ${nombre} • CURP: ${paciente.curp || "-"}`)
      ),
      (() => {
  const t = (paciente.triage || "verde").toLowerCase();
  const currentVal = t.includes("amar") ? "amarillo" : t.includes("rojo") ? "rojo" : "verde";

  const triageSelect = h(
    "select",
    { class: "ads-select", style: "width:160px; padding:8px 10px; border-radius:999px;" },
    h("option", { value: "verde" }, "Verde"),
    h("option", { value: "amarillo" }, "Amarillo"),
    h("option", { value: "rojo" }, "Rojo")
  );
  triageSelect.value = currentVal;

  const btnApply = h(
    "button",
    { class: "ads-btn ads-btn--ghost", type: "button", disabled: true, style: "padding:8px 12px; border-radius:999px;" },
    "Aplicar"
  );

  triageSelect.addEventListener("change", () => {
    btnApply.disabled = triageSelect.value === currentVal;
  });

  btnApply.addEventListener("click", async () => {
    const nuevo = triageSelect.value;

    btnApply.disabled = true;
    const oldText = btnApply.textContent;
    btnApply.textContent = "Guardando...";

    try {
      const updated = await updatePacienteTriage(paciente.id_paciente, nuevo);
      if (updated) {
        // actualiza el paciente en la vista actual y re-render sin afectar historial
        currentView.params.paciente.triage = updated;
        showToast("Triage actualizado.", "ok");
        setView("expediente", currentView.params, { pushHistory: false });
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnApply.textContent = oldText;
    }
  });

  return h(
    "div",
    { class: "ads-row", style: "justify-content:flex-end; align-items:center;" },
    triagePill(paciente.triage),
    triageSelect,
    btnApply
  );
})()

    ),
    h("div", { class: "ads-card__bd" },
      h("div", { class: "ads-row" },
        infoBox("Teléfono", paciente.telefono || "-"),
        infoBox("Correo", paciente.correo || "-"),
        infoBox("Estatus", paciente.estatus_afiliacion || "-"),
        infoBox("ID expediente", String(expediente.id_expediente)),
        infoBox("Estado", expediente.estado_expediente || "-"),
        infoBox("Últ. actualización", fmtDateTime(expediente.fecha_ultima_actualizacion))
      )
    )
  );

  const tabsCard = h("section", { class: "ads-card" });
  const hd = h("div", { class: "ads-card__hd" },
    h("h3", {}, "Secciones"),
    h("div", { class: "ads-muted" }, "Notas, recetas y laboratorio del expediente")
  );

  const subtabs = h("div", { class: "ads-subtabs", id: "ads-exp-subtabs" },
    subtabBtn("exp-notas", "Notas de evolución"),
    subtabBtn("exp-recetas", "Recetas médicas"),
    subtabBtn("exp-ordenes", "Órdenes de laboratorio"),
    subtabBtn("exp-resultados", "Resultados de laboratorio"),
    subtabBtn("exp-urgencias", "Urgencias"),
  );

  const body = h("div", { class: "ads-card__bd" },
    subtabs,
    h("div", { style: "height:14px" }),
    h("div", { id: "ads-exp-panel" }, "")
  );

  tabsCard.appendChild(hd);
  tabsCard.appendChild(body);

  container.appendChild(headerCard);
  container.appendChild(tabsCard);

  // default tab
  setExpSubtab("exp-notas", { paciente, expediente });
}

function infoBox(label, value) {
  return h("div", { class: "ads-field", style: "min-width:200px; flex:1;" },
    h("label", {}, label),
    h("div", { class: "ads-input", style: "background:#f8fafc;" }, value)
  );
}

function subtabBtn(key, label) {
  const b = h("button", { class: "ads-subtab", type: "button", onclick: () => setExpSubtab(key, currentView.params) }, label);
  b.dataset.key = key;
  return b;
}

function setExpSubtab(key, params) {
  const all = document.querySelectorAll(".ads-subtab");
  all.forEach((b) => b.classList.toggle("is-active", b.dataset.key === key));
  const panel = $("#ads-exp-panel");
  if (!panel) return;

  if (key === "exp-notas") return renderNotasExpediente(panel, params);
  if (key === "exp-recetas") return renderRecetasExpediente(panel, params);
  if (key === "exp-ordenes") return renderOrdenesExpediente(panel, params);
  if (key === "exp-resultados") return renderResultadosExpediente(panel, params);
  if (key === "exp-urgencias") return renderUrgenciasExpediente(panel, params);
}

async function renderNotasExpediente(panel, { expediente }) {
  panel.innerHTML = "";

  const form = h("div", { class: "ads-card", style: "box-shadow:none;" },
    h("div", { class: "ads-card__bd" },
      h("div", { class: "ads-row" },
        h("div", { class: "ads-field", style: "flex:3; min-width:360px;" },
          h("label", {}, "Nueva nota"),
          h("textarea", { class: "ads-textarea", id: "ads-new-note", placeholder: "Escribe la nota de evolución…" })
        ),
        h("button", { class: "ads-btn", type: "button", onclick: () => crearNota(expediente.id_expediente) }, "Guardar nota")
      )
    )
  );

  const list = h("div", { id: "ads-notas-list", style: "display:flex; flex-direction:column; gap:12px;" });

  panel.appendChild(form);
  panel.appendChild(h("div", { style: "height:12px" }));
  panel.appendChild(list);

  await cargarNotas(expediente.id_expediente);
}

async function cargarNotas(id_expediente) {
  const list = $("#ads-notas-list");
  if (!list) return;
  list.innerHTML = h("div", { class: "ads-muted" }, "Cargando notas…").outerHTML;

  try {
    const notas = await api(`/api/expedientes/${id_expediente}/notas`);
    list.innerHTML = "";

    if (!Array.isArray(notas) || notas.length === 0) {
      list.appendChild(h("div", { class: "ads-muted" }, "No hay notas registradas."));
      return;
    }

    for (const n of notas) {
      list.appendChild(noteCard(n, id_expediente));
    }
  } catch (err) {
    list.innerHTML = "";
    list.appendChild(h("div", { class: "ads-muted" }, `Error: ${err.message}`));
  }
}

function noteCard(nota, id_expediente) {
  const hd = h("div", { class: "ads-note__hd" },
    h("div", {},
      h("div", { style: "font-weight:900" }, `Nota #${nota.id_nota}`),
      h("div", { class: "ads-note__meta" }, `${fmtDateTime(nota.fecha_hora)} • ${nota.tipo_nota || "evolución"}`)
    ),
    h("div", { class: "ads-note__actions" },
      h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: () => abrirEditorNota(nota, id_expediente) }, "Editar"),
      h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: () => verHistorialNota(nota.id_nota) }, "Historial")
    )
  );

  return h("div", { class: "ads-note" },
    hd,
    h("div", { class: "ads-note__body" }, nota.contenido || "")
  );
}

async function crearNota(id_expediente) {
  const txt = $("#ads-new-note");
  const contenido = (txt?.value || "").trim();
  if (!contenido) {
    showToast("Escribe el contenido de la nota.", "error");
    return;
  }
  try {
    await api(`/api/expedientes/${id_expediente}/notas`, {
      method: "POST",
      body: JSON.stringify({
        id_medico: session.medico?.id_medico,
        tipo_nota: "evolucion",
        contenido,
      }),
    });
    txt.value = "";
    showToast("Nota guardada.", "ok");
    await cargarNotas(id_expediente);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function modal(title, contentEl, { width = 720 } = {}) {
  const overlay = h("div", { style: `position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:1500;padding:18px;` });
  const box = h("div", { class: "ads-card", style: `width:min(${width}px, 96vw); max-height: 92vh; overflow:auto;` });
  box.appendChild(
    h("div", { class: "ads-card__hd" },
      h("h3", {}, title),
      h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: () => overlay.remove() }, "Cerrar")
    )
  );
  box.appendChild(h("div", { class: "ads-card__bd" }, contentEl));
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return overlay;
}

function abrirEditorNota(nota, id_expediente) {
  const area = h("textarea", { class: "ads-textarea" }, nota.contenido || "");
  const actions = h("div", { class: "ads-row", style: "justify-content:flex-end" },
    h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: () => overlay.remove() }, "Cancelar"),
    h("button", { class: "ads-btn", type: "button", onclick: async () => {
      const nuevo = area.value.trim();
      if (!nuevo) { showToast("La nota no puede quedar vacía.", "error"); return; }
      try {
        // Backend esperado: PUT /api/notas/:id_nota  { id_medico, contenido_nuevo }
        await api(`/api/notas/${nota.id_nota}`, {
          method: "PUT",
          body: JSON.stringify({ id_medico: session.medico?.id_medico, contenido_nuevo: nuevo }),
        });
        showToast("Nota actualizada.", "ok");
        overlay.remove();
        await cargarNotas(id_expediente);
      } catch (err) {
        showToast(err.message + " (Si esto falla, revisa que tu backend tenga la ruta PUT /api/notas/:id_nota)", "error");
      }
    } }, "Guardar cambios")
  );

  const content = h("div", {},
    h("div", { class: "ads-muted", style: "margin-bottom:10px" }, `Editando Nota #${nota.id_nota}`),
    area,
    h("div", { style: "height:12px" }),
    actions
  );

  const overlay = modal("Editar nota", content, { width: 820 });
}

async function verHistorialNota(id_nota) {
  const wrap = h("div", {}, h("div", { class: "ads-muted" }, "Cargando historial…"));
  const overlay = modal("Historial de cambios", wrap, { width: 920 });

  try {
    // Backend esperado: GET /api/notas/:id_nota/historial
    const hist = await api(`/api/notas/${id_nota}/historial`);
    wrap.innerHTML = "";

    if (!Array.isArray(hist) || hist.length === 0) {
      wrap.appendChild(h("div", { class: "ads-muted" }, "Esta nota no tiene modificaciones registradas."));
      return;
    }

    for (const it of hist) {
      wrap.appendChild(
        h("div", { class: "ads-note", style: "margin-bottom:12px" },
          h("div", { class: "ads-note__hd" },
            h("div", {},
              h("div", { style: "font-weight:900" }, fmtDateTime(it.fecha_cambio || it.fecha_hora || it.created_at)),
              h("div", { class: "ads-note__meta" }, `Médico: ${it.id_medico || "-"}`)
            )
          ),
          h("div", { class: "ads-note__body" },
            h("div", { class: "ads-muted", style: "font-weight:800" }, "Antes:"),
            h("div", { style: "white-space:pre-wrap" }, it.contenido_anterior || "-"),
            h("div", { style: "height:10px" }),
            h("div", { class: "ads-muted", style: "font-weight:800" }, "Después:"),
            h("div", { style: "white-space:pre-wrap" }, it.contenido_nuevo || "-")
          )
        )
      );
    }
  } catch (err) {
    wrap.innerHTML = "";
    wrap.appendChild(h("div", { class: "ads-muted" }, err.message + " (Si esto falla, revisa que tu backend tenga GET /api/notas/:id_nota/historial)"));
  }
}

// ------------------------------
// Recetas / Órdenes / Resultados (expediente)
// ------------------------------
async function renderRecetasExpediente(panel, { expediente, paciente }) {
  panel.innerHTML = "";

  const list = h("div", { id: "ads-rec-list", class: "ads-tablewrap" });
  panel.appendChild(
    h("div", { class: "ads-row" },
      h("div", { class: "ads-field", style: "flex:2" },
        h("label", {}, "Nueva receta (opcional archivo)"),
        h("div", { class: "ads-muted" }, "Puedes adjuntar PDF/imagen. Si no, deja vacío.")
      )
    )
  );

  const form = h("form", { id: "ads-rec-form" },
    h("div", { class: "ads-row" },
      h("div", { class: "ads-field", style: "flex:2; min-width:280px" },
        h("label", {}, "Descripción"),
        h("input", { class: "ads-input", name: "descripcion", placeholder: "Receta…" })
      ),
      h("div", { class: "ads-field", style: "flex:2; min-width:280px" },
        h("label", {}, "Medicamentos"),
        h("input", { class: "ads-input", name: "medicamentos", placeholder: "Paracetamol 500mg…" })
      )
    ),
    h("div", { class: "ads-row" },
      h("div", { class: "ads-field", style: "flex:3; min-width:360px" },
        h("label", {}, "Indicaciones"),
        h("textarea", { class: "ads-textarea", name: "indicaciones", placeholder: "Tomar cada…" })
      ),
      h("div", { class: "ads-field" },
        h("label", {}, "Archivo"),
        h("input", { class: "ads-input", type: "file", name: "archivo" })
      ),
      h("button", { class: "ads-btn", type: "submit" }, "Guardar receta")
    )
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(form);
      fd.append("id_medico", String(session.medico?.id_medico || ""));

      const res = await fetch(`${BACKEND_URL}/api/expedientes/${expediente.id_expediente}/recetas`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la receta.");

      showToast("Receta guardada.", "ok");
      form.reset();
      await cargarRecetas(expediente.id_expediente);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  panel.appendChild(form);
  panel.appendChild(h("div", { style: "height:12px" }));
  panel.appendChild(h("div", { id: "ads-rec-table" }));

  await cargarRecetas(expediente.id_expediente);
}

async function cargarRecetas(id_expediente) {
  const host = $("#ads-rec-table");
  if (!host) return;
  host.innerHTML = h("div", { class: "ads-muted" }, "Cargando recetas…").outerHTML;
  const alergias = (params?.paciente?.alergias || "").trim();

if (alergias) {
  panel.appendChild(
    h("div", { class: "ads-alert ads-alert--warn", style: "margin-bottom:12px;" },
      h("div", { class: "ads-alert__icon" }, "⚠"),
      h("div", { class: "ads-alert__txt" },
        h("b", {}, "Alergias registradas"),
        h("span", {}, alergias)
      )
    )
  );
}


  try {
    const rows = await api(`/api/expedientes/${id_expediente}/recetas`);
    host.innerHTML = "";

    const wrap = h("div", { class: "ads-tablewrap" });
    const table = h("table", { class: "ads-table" },
      h("thead", {},
        h("tr", {},
          h("th", {}, "Fecha"),
          h("th", {}, "Descripción"),
          h("th", {}, "Medicamentos"),
          h("th", {}, "Vigencia"),
          h("th", {}, "Archivo")
        )
      ),
      h("tbody", {})
    );
    const tb = table.querySelector("tbody");

    if (!Array.isArray(rows) || rows.length === 0) {
      host.appendChild(h("div", { class: "ads-muted" }, "No hay recetas registradas."));
      return;
    }

    for (const r of rows) {
      const openRecetaFile = (ruta) => {
  if (!ruta) return;

  // ✅ Electron (lo correcto)
  if (window.electronAPI?.verArchivoReceta) {
    window.electronAPI.verArchivoReceta(ruta);
    return;
  }

  // 🔁 Fallback: abrir desde backend (si está servido como /uploads)
  const safe = String(ruta).replace(/\\/g, "/");
  window.open(`${BACKEND_URL}/${safe}`, "_blank");
};

const archivo = r.archivo_ruta
  ? h("button", {
      class: "ads-btn ads-btn--ghost",
      type: "button",
      onclick: () => openRecetaFile(r.archivo_ruta)
    }, "Abrir")
  : h("span", { class: "ads-muted" }, "-");

      tb.appendChild(
        h("tr", {},
          h("td", {}, fmtDateTime(r.fecha_receta)),
          h("td", {}, r.descripcion || "-"),
          h("td", {}, r.medicamentos || "-"),
          h("td", {}, r.fecha_vigencia ? fmtDateTime(r.fecha_vigencia) : "-"),
          h("td", {}, archivo)
        )
      );
    }

    wrap.appendChild(table);
    host.appendChild(wrap);
  } catch (err) {
    host.innerHTML = "";
    host.appendChild(h("div", { class: "ads-muted" }, `Error: ${err.message}`));
  }
}

async function renderOrdenesExpediente(panel, { expediente }) {
  panel.innerHTML = "";

  const form = h("div", { class: "ads-row" },
    h("div", { class: "ads-field", style: "flex:3; min-width:360px" },
      h("label", {}, "Nueva orden"),
      h("input", { class: "ads-input", id: "ads-ord-obs", placeholder: "Observaciones / estudios…" })
    ),
    h("button", { class: "ads-btn", type: "button", onclick: () => crearOrden(expediente.id_expediente) }, "Generar orden")
  );

  panel.appendChild(form);
  panel.appendChild(h("div", { style: "height:12px" }));
  panel.appendChild(h("div", { id: "ads-ord-table" }));

  await cargarOrdenes(expediente.id_expediente);
}

async function crearOrden(id_expediente) {
  const obs = $("#ads-ord-obs");
  const observaciones = (obs?.value || "").trim();
  if (!observaciones) {
    showToast("Escribe observaciones para la orden.", "error");
    return;
  }
  try {
    await api(`/api/expedientes/${id_expediente}/ordenes-laboratorio`, {
      method: "POST",
      body: JSON.stringify({ id_medico: session.medico?.id_medico, observaciones }),
    });
    obs.value = "";
    showToast("Orden creada.", "ok");
    await cargarOrdenes(id_expediente);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function cargarOrdenes(id_expediente) {
  const host = $("#ads-ord-table");
  if (!host) return;
  host.innerHTML = h("div", { class: "ads-muted" }, "Cargando órdenes…").outerHTML;

  try {
    const rows = await api(`/api/expedientes/${id_expediente}/ordenes-laboratorio`);
    host.innerHTML = "";

    const wrap = h("div", { class: "ads-tablewrap" });
    const table = h("table", { class: "ads-table" },
      h("thead", {},
        h("tr", {},
          h("th", {}, "Fecha"),
          h("th", {}, "ID"),
          h("th", {}, "Estado"),
          h("th", {}, "Observaciones")
        )
      ),
      h("tbody", {})
    );

    const tb = table.querySelector("tbody");

    if (!Array.isArray(rows) || rows.length === 0) {
      host.appendChild(h("div", { class: "ads-muted" }, "No hay órdenes registradas."));
      return;
    }

    for (const o of rows) {
      tb.appendChild(
        h("tr", {},
          h("td", {}, fmtDateTime(o.fecha_solicitud)),
          h("td", {}, String(o.id_orden || "-")),
          h("td", {}, o.estado_orden || "-"),
          h("td", {}, o.observaciones || "-")
        )
      );
    }

    wrap.appendChild(table);
    host.appendChild(wrap);
  } catch (err) {
    host.innerHTML = "";
    host.appendChild(h("div", { class: "ads-muted" }, `Error: ${err.message}`));
  }
}

function openArchivoRelativo(rutaRelativa) {
  if (!rutaRelativa) return;

  if (window.electronAPI?.verArchivoReceta) {
    window.electronAPI.verArchivoReceta(rutaRelativa);
    return;
  }

  // fallback web
  const safe = String(rutaRelativa).replace(/\\/g, "/");
  window.open(`${BACKEND_URL}/${safe}`, "_blank");
}

async function verResultadosOrden(id_orden) {
  const wrap = h("div", {}, h("div", { class: "ads-muted" }, "Cargando resultados…"));
  modal(`Resultados de la orden #${id_orden}`, wrap, { width: 980 });

  try {
    const rows = await api(`/api/ordenes-laboratorio/${id_orden}/resultados`);
    wrap.innerHTML = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      wrap.appendChild(h("div", { class: "ads-muted" }, "Aún no hay resultados para esta orden."));
      return;
    }

    const tableWrap = h("div", { class: "ads-tablewrap" });
    const table = h("table", { class: "ads-table" },
      h("thead", {},
        h("tr", {},
          h("th", {}, "Fecha"),
          h("th", {}, "Estudio"),
          h("th", {}, "Resultado"),
          h("th", {}, "Unidad"),
          h("th", {}, "Referencia"),
          h("th", {}, "Archivo")
        )
      ),
      h("tbody", {})
    );

    const tb = table.querySelector("tbody");

    for (const r of rows) {
      const archivoCell = r.archivo_ruta
        ? h("button", {
            class: "ads-btn ads-btn--ghost",
            type: "button",
            onclick: () => openArchivoRelativo(r.archivo_ruta)
          }, "Abrir")
        : h("span", { class: "ads-muted" }, "-");

      tb.appendChild(
        h("tr", {},
          h("td", {}, fmtDateTime(r.fecha_resultado)),
          h("td", {}, r.nombre_estudio || "-"),
          h("td", {}, r.resultado || "-"),
          h("td", {}, r.unidad || "-"),
          h("td", {}, r.valores_referencia || "-"),
          h("td", {}, archivoCell)
        )
      );
    }

    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
  } catch (err) {
    wrap.innerHTML = "";
    wrap.appendChild(h("div", { class: "ads-muted" }, `Error: ${err.message}`));
  }
}


async function renderResultadosExpediente(panel, { expediente }) {
  panel.innerHTML = "";
  panel.appendChild(h("div", { id: "ads-res-table" }, ""));
  await cargarResultados(expediente.id_expediente);
}

async function renderUrgenciasExpediente(panel, { paciente }) {
  panel.innerHTML = "";

  const form = h("div", { class: "ads-card", style: "box-shadow:none;" },
    h("div", { class: "ads-card__hd" },
      h("div", {}, h("h3", {}, "Datos de urgencias"), h("div", { class: "ads-muted" }, "Hospital-ADS"))
    ),
    h("div", { class: "ads-card__bd" },
      h("div", { class: "ads-row" },
        h("div", { class: "ads-field", style: "flex:2; min-width:280px;" },
          h("label", {}, "Motivo de ingreso"),
          h("textarea", { class: "ads-textarea", id: "urg-motivo", placeholder: "Motivo...", rows: "2" }, paciente.motivo_ingreso || "")
        ),
        h("div", { class: "ads-field", style: "flex:2; min-width:280px;" },
          h("label", {}, "Enfermedades crónicas"),
          h("textarea", { class: "ads-textarea", id: "urg-cron", placeholder: "Diabetes, hipertensión...", rows: "2" }, paciente.enfermedades_cronicas || "")
        )
      ),

      h("div", { class: "ads-row" },
        h("div", { class: "ads-field", style: "flex:2; min-width:280px;" },
          h("label", {}, "Enfermedades hereditarias"),
          h("textarea", { class: "ads-textarea", id: "urg-her", placeholder: "Antecedentes familiares...", rows: "2" }, paciente.enfermedades_hereditarias || "")
        ),
        h("div", { class: "ads-field", style: "flex:2; min-width:280px;" },
          h("label", {}, "Alergias"),
          h("input", { class: "ads-input", id: "urg-alerg", placeholder: "Ej. penicilina, nueces...", value: paciente.alergias || "" })
        )
      ),

      h("div", { class: "ads-row" },
        h("div", { class: "ads-field", style: "flex:3; min-width:360px;" },
          h("label", {}, "Signos vitales"),
          h("textarea", { class: "ads-textarea", id: "urg-signos", placeholder: "FC, FR, SpO2, etc...", rows: "2" }, paciente.signos_vitales || "")
        )
      ),

      h("div", { class: "ads-row" },
        h("div", { class: "ads-field", style: "min-width:220px;" },
          h("label", {}, "Presión"),
          h("input", { class: "ads-input", id: "urg-presion", placeholder: "120/80", value: paciente.presion || "" })
        ),
        h("div", { class: "ads-field", style: "min-width:220px;" },
          h("label", {}, "Temperatura (°C)"),
          h("input", { class: "ads-input", id: "urg-temp", type: "number", step: "0.1", value: paciente.temperatura ?? "" })
        ),
        h("div", { class: "ads-field", style: "min-width:220px;" },
          h("label", {}, "Glucosa (mg/dL)"),
          h("input", { class: "ads-input", id: "urg-glu", type: "number", step: "0.1", value: paciente.glucosa ?? "" })
        ),
        h("button", { class: "ads-btn", type: "button", onclick: () => guardarUrgencias(paciente.id_paciente) }, "Guardar")
      )
    )
  );

  panel.appendChild(form);
}

async function guardarUrgencias(id_paciente) {
  try {
    const body = {
      motivo_ingreso: $("#urg-motivo")?.value || "",
      enfermedades_cronicas: $("#urg-cron")?.value || "",
      enfermedades_hereditarias: $("#urg-her")?.value || "",
      alergias: $("#urg-alerg")?.value || "",
      signos_vitales: $("#urg-signos")?.value || "",
      presion: $("#urg-presion")?.value || "",
      temperatura: $("#urg-temp")?.value || "",
      glucosa: $("#urg-glu")?.value || "",
    };

    await api(`/api/pacientes/${id_paciente}/urgencias`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    // actualizar cache local del paciente actual
    Object.assign(currentView.params.paciente, body);

    showToast("Datos de urgencias guardados.", "ok");
  } catch (err) {
    showToast(err.message, "error");
  }
}


function abrirArchivo(rutaRelativa) {
  if (!rutaRelativa) return;


  if (window.electronAPI?.verArchivoReceta) {
    window.electronAPI.verArchivoReceta(rutaRelativa);
    return;
  }

  // fallback por si un día corres en navegador
  const safe = String(rutaRelativa).replace(/\\/g, "/");
  window.open(`${BACKEND_URL}/${safe}`, "_blank");
}

async function cargarResultados(id_expediente) {
  const host = $("#ads-res-table");
  if (!host) return;
  host.innerHTML = h("div", { class: "ads-muted" }, "Cargando resultados…").outerHTML;

  try {
    const rows = await api(`/api/expedientes/${id_expediente}/resultados-laboratorio`);
    host.innerHTML = "";

    const wrap = h("div", { class: "ads-tablewrap" });
    const table = h("table", { class: "ads-table" },
      h("thead", {},
        h("tr", {},
          h("th", {}, "Orden"),
          h("th", {}, "Fecha"),
          h("th", {}, "Estudio"),
          h("th", {}, "Resultado"),
          h("th", {}, "Unidad"),
          h("th", {}, "Referencia"),
          h("th", {}, "Archivo")

        )
      ),
      h("tbody", {})
    );
    const tb = table.querySelector("tbody");

    if (!Array.isArray(rows) || rows.length === 0) {
      host.appendChild(h("div", { class: "ads-muted" }, "No hay resultados registrados."));
      return;
    }

    for (const r of rows) {
      tb.appendChild(
        h("tr", {},
          h("td", {}, String(r.id_orden || "-")),
          h("td", {}, fmtDateTime(r.fecha_resultado)),
          h("td", {}, r.nombre_estudio || "-"),
          h("td", {}, r.resultado || "-"),
          h("td", {}, r.unidad || "-"),
          h("td", {}, r.valores_referencia || "-"),
          h("td", {},
  r.archivo_ruta
    ? h("button", {
        class: "ads-btn ads-btn--ghost",
        type: "button",
        onclick: () => openArchivoRelativo(r.archivo_ruta)
      }, "Abrir")
    : h("span", { class: "ads-muted" }, "-")
)

        )
      );
    }

    wrap.appendChild(table);
    host.appendChild(wrap);
  } catch (err) {
    host.innerHTML = "";
    host.appendChild(h("div", { class: "ads-muted" }, `Error: ${err.message}`));
  }
}

// ------------------------------
// Agenda del médico
// ------------------------------
let agendaCurrentTab = "hoy";
let agendaCacheFH = null; // { futuras, historial }
let agendaCacheHoy = null; // { fecha, citas }

function ymd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function agendaTabBtn(key, label) {
  const b = h(
    "button",
    {
      class: "ads-subtab",
      type: "button",
      onclick: () => setAgendaTab(key),
    },
    label
  );
  b.dataset.key = key;
  return b;
}

async function fetchAgendaHoy(force = false) {
  const f = ymd();
  if (!force && agendaCacheHoy && agendaCacheHoy.fecha === f) return agendaCacheHoy;

  const data = await api(`/api/medicos/${session.medico.id_medico}/citas?fecha=${f}`);
  agendaCacheHoy = { fecha: f, citas: Array.isArray(data.citas) ? data.citas : [] };
  return agendaCacheHoy;
}

async function fetchAgendaFutHist(force = false) {
  if (!force && agendaCacheFH) return agendaCacheFH;

  const data = await api(`/api/medicos/${session.medico.id_medico}/citas`);
  agendaCacheFH = {
    futuras: Array.isArray(data.futuras) ? data.futuras : [],
    historial: Array.isArray(data.historial) ? data.historial : [],
  };
  return agendaCacheFH;
}

async function cambiarEstadoCita(id_cita, nuevo_estado) {
  await api(`/api/citas/${id_cita}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ nuevo_estado }),
  });
}

function renderAgendaHoyTabla(citas) {
  const wrap = h("div", { class: "ads-tablewrap" });
  const table = h(
    "table",
    { class: "ads-table" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", {}, "Hora"),
        h("th", {}, "Paciente"),
        h("th", {}, "Motivo"),
        h("th", {}, "Estado"),
        h("th", {}, "Acciones")
      )
    ),
    h("tbody", {})
  );

  const tb = table.querySelector("tbody");

  if (!Array.isArray(citas) || citas.length === 0) {
    tb.appendChild(h("tr", {}, h("td", { colspan: "5", class: "ads-muted" }, "Sin citas para hoy")));
  } else {
    for (const c of citas) {
      const nombre = `${c.nombre || ""} ${c.apellido_paterno || ""} ${c.apellido_materno || ""}`.trim();
      const estado = (c.estado_cita || "-").toLowerCase();

      // Acciones SOLO EN HOY
      let acciones = h("span", { class: "ads-muted" }, "-");
      if (estado === "programada") {
        const btnAtendida = h(
          "button",
          {
            class: "ads-btn ads-btn--ghost",
            type: "button",
            onclick: async () => {
              try {
                await cambiarEstadoCita(c.id_cita, "atendida");
                showToast("Cita marcada como atendida.", "ok");
                // refrescar hoy + mover si ya no aplica
                await setAgendaTab("hoy", { force: true });
              } catch (e) {
                showToast(e.message, "error");
              }
            },
          },
          "Atendida"
        );

        const btnNoAsistio = h(
          "button",
          {
            class: "ads-btn ads-btn--ghost",
            type: "button",
            onclick: async () => {
              try {
                await cambiarEstadoCita(c.id_cita, "no asistió");
                showToast("Cita marcada como no asistió.", "ok");
                await setAgendaTab("hoy", { force: true });
              } catch (e) {
                showToast(e.message, "error");
              }
            },
          },
          "No asistió"
        );

        acciones = h("div", { class: "ads-row" }, btnAtendida, btnNoAsistio);
      }

      // Hora (HH:MM)
      const dt = c.fecha_hora ? new Date(c.fecha_hora) : null;
      const hora = dt ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : "-";

      tb.appendChild(
        h(
          "tr",
          {},
          h("td", {}, hora),
          h("td", {}, nombre || "-"),
          h("td", {}, c.motivo || "-"),
          h("td", {}, c.estado_cita || "-"),
          h("td", {}, acciones)
        )
      );
    }
  }

  wrap.appendChild(table);
  return wrap;
}

async function setAgendaTab(key, opts = {}) {
  agendaCurrentTab = key;

  // activar pestaña
  document.querySelectorAll("#ads-agenda-subtabs .ads-subtab").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.key === key);
  });

  const panel = $("#ads-agenda-panel");
  panel.innerHTML = h("div", { class: "ads-muted" }, "Cargando…").outerHTML;

  try {
    // ✅ Importante: si cambias estado en HOY, debes invalidar cache de futuras/historial
    if (opts.force) agendaCacheFH = null;

    if (key === "hoy") {
      const hoy = await fetchAgendaHoy(true); // hoy siempre force para que refleje cambios
      panel.innerHTML = "";
      panel.appendChild(renderAgendaHoyTabla(hoy.citas));

      // actualiza títulos con contadores
      $("#ads-agenda-tab-hoy").textContent = `Hoy (${hoy.citas.length})`;

      // también refresca futuras/hist en background para que quede consistente
      const fh = await fetchAgendaFutHist(true);
      $("#ads-agenda-tab-prox").textContent = `Próximas (${fh.futuras.length})`;
      $("#ads-agenda-tab-hist").textContent = `Historial (${fh.historial.length})`;
      return;
    }

    const fh = await fetchAgendaFutHist(!!opts.force);
    $("#ads-agenda-tab-prox").textContent = `Próximas (${fh.futuras.length})`;
    $("#ads-agenda-tab-hist").textContent = `Historial (${fh.historial.length})`;

    panel.innerHTML = "";
    if (key === "proximas") panel.appendChild(renderCitasTabla(fh.futuras));
    if (key === "historial") panel.appendChild(renderCitasTabla(fh.historial));
  } catch (err) {
    showToast(err.message, "error");
    panel.innerHTML = h("div", { class: "ads-muted" }, err.message).outerHTML;
  }
}

function viewAgenda() {
  const container = $("#ads-container");
  container.innerHTML = "";

  const card = h(
    "section",
    { class: "ads-card" },
    h(
      "div",
      { class: "ads-card__hd" },
      h("div", {}, h("h2", {}, "Agenda de citas"), h("div", { class: "ads-muted" }, ""))
    ),
    h(
      "div",
      { class: "ads-card__bd" },
      h(
        "div",
        { class: "ads-subtabs", id: "ads-agenda-subtabs" },
        (() => {
          const b = agendaTabBtn("hoy", "Hoy (0)");
          b.id = "ads-agenda-tab-hoy";
          return b;
        })(),
        (() => {
          const b = agendaTabBtn("proximas", "Próximas (0)");
          b.id = "ads-agenda-tab-prox";
          return b;
        })(),
        (() => {
          const b = agendaTabBtn("historial", "Historial (0)");
          b.id = "ads-agenda-tab-hist";
          return b;
        })()
      ),
      h("div", { style: "height:14px" }),
      h("div", { id: "ads-agenda-panel" }, "")
    )
  );

  container.appendChild(card);

  // default: Hoy
  setAgendaTab("hoy", { force: true });
}


function renderCitasTabla(citas) {
  const wrap = h("div", { class: "ads-tablewrap" });
  const table = h("table", { class: "ads-table", style: "min-width:860px" },
    h("thead", {},
      h("tr", {},
        h("th", {}, "Fecha"),
        h("th", {}, "Paciente"),
        h("th", {}, "Motivo"),
        h("th", {}, "Estado")
      )
    ),
    h("tbody", {})
  );
  const tb = table.querySelector("tbody");

  if (!Array.isArray(citas) || citas.length === 0) {
    tb.appendChild(h("tr", {}, h("td", { colspan: "4", class: "ads-muted" }, "Sin registros")));
  } else {
    for (const c of citas) {
      tb.appendChild(
        h("tr", {},
          h("td", {}, fmtDateTime(c.fecha_hora)),
          h("td", {}, `${c.nombre || ""} ${c.apellido_paterno || ""} ${c.apellido_materno || ""}`.trim()),
          h("td", {}, c.motivo || "-"),
          h("td", {}, c.estado_cita || "-")
        )
      );
    }
  }

  wrap.appendChild(table);
  return wrap;
}

// ------------------------------
// Vista global: Notas de evolución (NO estática)
// ------------------------------
async function viewNotasGlobal() {
  const container = $("#ads-container");
  container.innerHTML = "";

  const card = h("section", { class: "ads-card" },
    h("div", { class: "ads-card__hd" },
      h("div", {},
        h("h2", {}, "Notas de evolución"),
        h("div", { class: "ads-muted" }, "Selecciona un paciente asignado y gestiona sus notas")
      )
    ),
    h("div", { class: "ads-card__bd" },
      h("div", { class: "ads-row" },
        h("div", { class: "ads-field", style: "flex:2; min-width:360px" },
          h("label", {}, "Paciente"),
          h("select", { class: "ads-select", id: "ads-notas-paciente" },
            h("option", { value: "" }, "Selecciona…")
          )
        ),
        h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: async () => { await loadPacientes(true); fillNotasSelect(); } }, "Actualizar")
      ),
      h("div", { style: "height:12px" }),
      h("div", { id: "ads-notas-global-panel" }, h("div", { class: "ads-muted" }, "Elige un paciente para ver sus notas."))
    )
  );

  container.appendChild(card);
  const sel = $("#ads-notas-paciente");
sel.disabled = true;
sel.innerHTML = "";
sel.appendChild(h("option", { value: "" }, "Cargando pacientes…"));


 await loadPacientes(false);
fillNotasSelect();
sel.disabled = false;


  $("#ads-notas-paciente").addEventListener("change", async (e) => {
  const id = e.target.value;
  if (!id) {
    $("#ads-notas-global-panel").innerHTML =
      h("div", { class: "ads-muted" }, "Elige un paciente para ver sus notas.").outerHTML;
    return;
  }

  $("#ads-notas-global-panel").innerHTML =
    h("div", { class: "ads-muted" }, "Cargando notas del paciente…").outerHTML;

  await openExpedienteFromNotas(Number(id));
});

}

function fillNotasSelect() {
  const sel = $("#ads-notas-paciente");
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = "";
  sel.appendChild(h("option", { value: "" }, "Selecciona…"));
  for (const p of cachePacientes) {
    const nombre = `${p.nombre || ""} ${p.apellido_paterno || ""} ${p.apellido_materno || ""}`.trim();
    sel.appendChild(h("option", { value: String(p.id_paciente) }, `${nombre} • ${p.curp || "-"}`));
  }
  sel.value = current;
}

async function openExpedienteFromNotas(id_paciente) {
  try {
    const data = await api(`/api/pacientes/${id_paciente}/resumen-expediente`);
    const expediente = data.expediente;
    if (!expediente?.id_expediente) {
      $("#ads-notas-global-panel").innerHTML = h("div", { class: "ads-muted" }, "Este paciente no tiene expediente.").outerHTML;
      return;
    }

    // Reusamos renderNotasExpediente pero sin cambiar de vista
    const panel = $("#ads-notas-global-panel");
    panel.innerHTML = "";

    const sub = h("div", { class: "ads-muted", style: "margin-bottom:10px" }, `Expediente #${expediente.id_expediente}`);
    panel.appendChild(sub);

    // Panel interno similar a expediente
    const inner = h("div", { id: "ads-exp-panel" });
    panel.appendChild(inner);

    // Render notas en ese panel
    await renderNotasExpediente(inner, { expediente, paciente: data.paciente });
  } catch (err) {
    $("#ads-notas-global-panel").innerHTML = h("div", { class: "ads-muted" }, err.message).outerHTML;
  }
}

// ------------------------------
// Laboratorio global (listado de órdenes del médico)
// ------------------------------
async function viewLaboratorioGlobal() {
  const container = $("#ads-container");
  container.innerHTML = "";

  const card = h(
    "section",
    { class: "ads-card" },
    h(
      "div",
      { class: "ads-card__hd" },
      h("div", {},
        h("h2", {}, "Laboratorio"),
        h("div", { class: "ads-muted" }, "Órdenes y resultados del médico")
      )
    ),
    h(
      "div",
      { class: "ads-card__bd" },

      // filtros
      h("div", { class: "ads-row" },
        h("div", { class: "ads-field", style: "flex:2; min-width:320px;" },
          h("label", {}, "Buscar"),
          h("input", { class: "ads-input", id: "ads-lab-buscar", placeholder: "Paciente o ID orden..." })
        ),
        h("div", { class: "ads-field", style: "min-width:220px;" },
          h("label", {}, "Estado"),
          h("select", { class: "ads-select", id: "ads-lab-estado" },
            h("option", { value: "" }, "Todos"),
            h("option", { value: "Solicitada" }, "Solicitada"),
            h("option", { value: "Resultado Listo" }, "Resultado Listo")
          )
        ),
        h("button", {
          class: "ads-btn ads-btn--ghost",
          type: "button",
          onclick: () => cargarOrdenesMedico(true)
        }, "Actualizar")
      ),

      h("div", { style: "height:12px" }),

      // tabla de órdenes
      h("div", { id: "ads-lab-ordenes-host" },
        h("div", { class: "ads-muted" }, "Cargando órdenes…")
      ),

      h("div", { style: "height:14px" }),

      // panel resultados
      h("div", { id: "ads-lab-resultados-host" },
        h("div", { class: "ads-muted" }, "Selecciona una orden para ver sus resultados.")
      )
    )
  );

  container.appendChild(card);

  $("#ads-lab-buscar").oninput = renderOrdenesMedicoTable;
  $("#ads-lab-estado").onchange = renderOrdenesMedicoTable;

  await cargarOrdenesMedico(false);
}

let cacheOrdenesMedico = [];

async function cargarOrdenesMedico(force) {
  const host = $("#ads-lab-ordenes-host");
  if (!host) return;

  if (!force && cacheOrdenesMedico.length) {
    renderOrdenesMedicoTable();
    return;
  }

  host.innerHTML = h("div", { class: "ads-muted" }, "Cargando órdenes...").outerHTML;

  try {
    const rows = await api(`/api/medicos/${session.medico.id_medico}/ordenes-laboratorio`);
    cacheOrdenesMedico = Array.isArray(rows) ? rows : [];
    renderOrdenesMedicoTable();
  } catch (err) {
    host.innerHTML = h("div", { class: "ads-muted" }, `Error: ${err.message}`).outerHTML;
  }
}

function renderOrdenesMedicoTable() {
  const host = $("#ads-lab-ordenes-host");
  if (!host) return;

  const q = ($("#ads-lab-buscar")?.value || "").trim().toLowerCase();
  const est = ($("#ads-lab-estado")?.value || "").trim().toLowerCase();

  let rows = cacheOrdenesMedico.slice();

  if (q) {
    rows = rows.filter((o) => {
      const nombre = `${o.nombre || ""} ${o.apellido_paterno || ""} ${o.apellido_materno || ""}`.toLowerCase();
      const id = String(o.id_orden || "");
      return nombre.includes(q) || id.includes(q);
    });
  }

  if (est) {
    rows = rows.filter((o) => (o.estado_orden || "").toLowerCase() === est);
  }

  if (!rows.length) {
    host.innerHTML = "";
    host.appendChild(h("div", { class: "ads-muted" }, "No hay órdenes con esos filtros."));
    return;
  }

  const wrap = h("div", { class: "ads-tablewrap" });
  const table = h("table", { class: "ads-table", style: "min-width:980px" },
    h("thead", {},
      h("tr", {},
        h("th", {}, "Fecha"),
        h("th", {}, "Orden"),
        h("th", {}, "Paciente"),
        h("th", {}, "Estado"),
        h("th", {}, "Observaciones"),
        h("th", {}, "Resultados"),
        h("th", {}, "Acción")
      )
    ),
    h("tbody", {})
  );

  const tb = table.querySelector("tbody");

  for (const o of rows) {
    const pacienteNombre = `${o.nombre || ""} ${o.apellido_paterno || ""} ${o.apellido_materno || ""}`.trim();

    const btnVer = h("button", {
      class: "ads-btn ads-btn--ghost",
      type: "button",
      onclick: () => verResultadosOrdenGlobal(o.id_orden, pacienteNombre),
    }, `Ver (${o.num_resultados || 0})`);

    tb.appendChild(
      h("tr", {},
        h("td", {}, fmtDateTime(o.fecha_solicitud)),
        h("td", {}, String(o.id_orden || "-")),
        h("td", {}, pacienteNombre),
        h("td", {}, o.estado_orden || "-"),
        h("td", {}, o.observaciones || "-"),
        h("td", {}, String(o.num_resultados || 0)),
        h("td", {}, btnVer)
      )
    );
  }

  wrap.appendChild(table);
  host.innerHTML = "";
  host.appendChild(wrap);
}

async function verResultadosOrdenGlobal(id_orden, pacienteNombre) {
  const host = $("#ads-lab-resultados-host");
  if (!host) return;

  host.innerHTML = h("div", { class: "ads-muted" }, "Cargando resultados...").outerHTML;

  try {
    const rows = await api(`/api/ordenes-laboratorio/${id_orden}/resultados`);

    const head = h("div", { class: "ads-row", style: "justify-content:space-between; align-items:flex-start;" },
      h("div", {},
        h("h3", {}, `Resultados de orden #${id_orden}`),
        h("div", { class: "ads-muted" }, `Paciente: ${pacienteNombre || "-"}`)
      ),
      h("button", {
        class: "ads-btn ads-btn--ghost",
        type: "button",
        onclick: () => {
          host.innerHTML = h("div", { class: "ads-muted" }, "Selecciona una orden para ver sus resultados.").outerHTML;
        }
      }, "Cerrar")
    );

    if (!Array.isArray(rows) || !rows.length) {
      host.innerHTML = "";
      host.appendChild(h("div", { class: "ads-card" }, h("div", { class: "ads-card__bd" }, head,
        h("div", { class: "ads-muted" }, "Esta orden no tiene resultados todavía.")
      )));
      return;
    }

    const wrap = h("div", { class: "ads-tablewrap" });
    const table = h("table", { class: "ads-table", style: "min-width:980px" },
      h("thead", {},
        h("tr", {},
          h("th", {}, "Fecha"),
          h("th", {}, "Estudio"),
          h("th", {}, "Resultado"),
          h("th", {}, "Unidad"),
          h("th", {}, "Referencia"),
          h("th", {}, "Archivo")
        )
      ),
      h("tbody", {})
    );

    const tb = table.querySelector("tbody");

    for (const r of rows) {
      const archivo = r.archivo_ruta
        ? h("button", { class: "ads-btn ads-btn--ghost", type: "button", onclick: () => abrirArchivo(r.archivo_ruta) }, "Abrir")
        : h("span", { class: "ads-muted" }, "-");

      tb.appendChild(
        h("tr", {},
          h("td", {}, fmtDateTime(r.fecha_resultado)),
          h("td", {}, r.nombre_estudio || "-"),
          h("td", {}, r.resultado || "-"),
          h("td", {}, r.unidad || "-"),
          h("td", {}, r.valores_referencia || "-"),
          h("td", {}, archivo)
        )
      );
    }

    wrap.appendChild(table);

    host.innerHTML = "";
    host.appendChild(
      h("div", { class: "ads-card" },
        h("div", { class: "ads-card__bd" }, head, h("div", { style: "height:10px" }), wrap)
      )
    );
  } catch (err) {
    host.innerHTML = h("div", { class: "ads-muted" }, `Error: ${err.message}`).outerHTML;
  }
}


// ------------------------------
// Render principal
// ------------------------------
function render() {
  ensureShell();

  const topbar = $("#ads-topbar");
  const container = $("#ads-container");

  if (currentView.name === "login") {
    topbar.style.display = "none";
    renderLogin();
    return;
  }

  topbar.style.display = "flex";

  // Subtitulo con datos del médico
  const sub = $("#ads-brand-sub");
  if (session.medico) {
    sub.textContent = `${session.medico.nombre} ${session.medico.apellido_paterno || ""} • ${session.medico.especialidad || "Sin especialidad"}`;
  } else {
    sub.textContent = "Módulo Médico";
  }

  setActiveTab();

  if (currentView.name === "home") return viewHome();
  if (currentView.name === "pacientes") return viewPacientes();
  if (currentView.name === "agenda") return viewAgenda();
  if (currentView.name === "notas") return viewNotasGlobal();
  if (currentView.name === "ordenes") return viewLaboratorioGlobal();
  if (currentView.name === "expediente") return viewExpediente(currentView.params);

  container.innerHTML = h("div", { class: "ads-muted" }, "Vista no encontrada.").outerHTML;
}

// Init
(function init() {
  hydrateSession();

  if (session?.roles?.includes("MEDICO")) {
    currentView = { name: "home", params: {} };
  } else {
    currentView = { name: "login", params: {} };
  }

  render();
})();
