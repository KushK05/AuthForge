import { brandMark, renderPage } from "./theme.js";

// 16px stroke icons (Lucide-style paths, drawn inline so the CSP needs no image hosts).
const icon = (paths: string, size = 16): string =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

const icons = {
  home: icon('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>'),
  users: icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/>'),
  key: icon('<circle cx="7.5" cy="15.5" r="4"/><path d="m10.4 12.6 9.1-9.1"/><path d="m16 6 3 3"/><path d="m14 8 2 2"/>'),
  sessions: icon('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>'),
  events: icon('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  settings: icon('<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/>'),
  book: icon('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>'),
  code: icon('<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/>'),
  menu: icon('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>', 18),
  close: icon('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>', 18),
  plus: icon('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  search: icon('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/>'),
  logout: icon('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l-4-4 4-4"/><path d="M5 12h11"/>'),
  external: icon('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 14),
  arrow: icon('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', 14),
  mail: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>'),
  shield: icon('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>'),
  reset: icon('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  globe: icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  lock: icon('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  building: icon('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1"/><path d="M14 7h1"/><path d="M9 11h1"/><path d="M14 11h1"/><path d="M10 21v-4h4v4"/>'),
  copy: icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 14),
  warn: icon('<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4"/><path d="M12 17h0"/>'),
  chevrons: icon('<path d="m8 9 4-4 4 4"/><path d="m8 15 4 4 4-4"/>', 14)
};

const navItem = (section: string, label: string, svg: string): string =>
  `<a class="nav-item" href="#${section}" data-section="${section}">${svg}<span>${label}</span></a>`;

const pageHead = (title: string, description: string, action = ""): string =>
  `<div class="page-head"><div><h1>${title}</h1><p class="desc">${description}</p></div>${action}</div>`;

const table = (id: string, headings: ReadonlyArray<readonly [string, string?]>, emptyId: string): string =>
  `<div class="table-wrap"><table class="table" id="${id}"><thead><tr>${headings.map(([label, cls]) => `<th scope="col"${cls ? ` class="${cls}"` : ""}>${label}</th>`).join("")}</tr></thead><tbody></tbody></table></div><div class="empty" id="${emptyId}" hidden></div>`;

const settingCard = (svg: string, title: string, body: string, value: string): string =>
  `<div class="card setting"><div class="setting-head"><span class="setting-icon">${svg}</span><div class="setting-title"><h3>${title}</h3><span class="badge-ro">Read-only</span></div></div><p class="setting-body">${body}</p><div class="setting-value">${value}</div></div>`;

const soonCard = (svg: string, title: string, body: string): string =>
  `<div class="card setting is-soon"><div class="setting-head"><span class="setting-icon">${svg}</span><div class="setting-title"><h3>${title}</h3><span class="badge-soon">Coming soon</span></div><span class="switch" role="switch" aria-checked="false" aria-disabled="true" aria-label="${title} (coming soon)"><span></span></span></div><p class="setting-body">${body}</p></div>`;

const css = String.raw`
body{background:var(--surface);font-size:14px;line-height:1.5}
.shell{display:flex;min-height:100vh}
.i{flex:none;display:block}
/* Sidebar */
.sidebar{position:fixed;inset:0 auto 0 0;width:248px;display:flex;flex-direction:column;background:var(--sidebar);border-right:1px solid var(--border);z-index:40}
.sb-top{padding:14px 12px 10px}
.sb-brand{display:flex;align-items:center;gap:8px;padding:2px 6px 12px;color:var(--text);font-weight:700;font-size:15px;letter-spacing:-.01em;text-decoration:none}
.sb-brand .mark{width:22px;height:22px}
.sidebar .sb-close{display:none;margin-left:auto}
.app-switch{display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:9px;background:var(--surface);box-shadow:var(--shadow-sm);cursor:default}
.app-logo{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;font-size:12px;flex:none}
.app-meta{min-width:0;flex:1;display:grid;gap:1px}
.app-name{font-weight:600;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.env{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--warn);font-weight:500}
.env::before{content:"";width:6px;height:6px;border-radius:50%;background:#f59e0b}
.app-switch .i{color:var(--subtle)}
.sb-nav{flex:1;overflow-y:auto;padding:6px 12px 12px}
.nav-group{padding:16px 8px 6px;font-size:11.5px;font-weight:600;color:var(--subtle);letter-spacing:.02em}
.nav-item{position:relative;display:flex;align-items:center;gap:10px;height:32px;padding:0 8px;margin:1px 0;border-radius:7px;color:var(--muted);font-size:13.5px;font-weight:500;text-decoration:none}
.nav-item:hover{background:var(--hover);color:var(--text);text-decoration:none}
.nav-item[aria-current="page"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--border),var(--shadow-sm)}
.nav-item[aria-current="page"] .i{color:var(--accent-text)}
.nav-item .ext{margin-left:auto;color:var(--subtle)}
.sb-user{display:flex;align-items:center;gap:10px;margin:0 12px 12px;padding:10px 8px;border-top:1px solid var(--border)}
.avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#a5b4fc,#6366f1);color:#fff;font-weight:600;font-size:13px;text-transform:uppercase;flex:none}
.who{min-width:0;flex:1;display:grid}
.who .email{font-size:12.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who .role{font-size:11.5px;color:var(--subtle)}
.icon-btn{display:inline-grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--muted);cursor:pointer;flex:none}
.icon-btn:hover:not([disabled]){background:var(--hover);color:var(--text)}
.icon-btn[disabled]{opacity:.5;cursor:wait}
/* Main */
.main{flex:1;min-width:0;margin-left:248px;display:flex;flex-direction:column}
.mainbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;height:52px;padding:0 28px;background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.menu-btn{display:none}
.crumbs{display:flex;align-items:center;gap:8px;min-width:0;font-size:13.5px;color:var(--subtle)}
.crumbs .sep{color:var(--border)}
.crumbs [aria-current]{color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mainbar .docs{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:7px;color:var(--muted);font-size:13px;font-weight:500;text-decoration:none}
.mainbar .docs:hover{background:var(--hover);color:var(--text)}
.content{width:100%;max-width:1100px;margin:0 auto;padding:32px 28px 64px}
.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}
.page-head h1{font-size:22px;font-weight:650;letter-spacing:-.02em}
.page-head .desc{margin-top:4px;color:var(--muted);font-size:13.5px;max-width:620px}
.btn{min-height:34px;padding:0 13px;font-size:13px;border-radius:8px;gap:6px}
.btn-primary{box-shadow:0 1px 2px rgba(16,24,40,.12),inset 0 1px 0 rgba(255,255,255,.12)}
.btn-secondary{box-shadow:var(--shadow-sm)}
.btn-sm{min-height:28px;padding:0 10px;font-size:12.5px;border-radius:7px}
.card{border-radius:12px;box-shadow:var(--shadow-sm)}
/* Overview */
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.stat{padding:16px 18px}
.stat-top{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:13px;font-weight:500}
.stat-ico{display:grid;place-items:center;width:28px;height:28px;border-radius:7px;background:var(--surface-2);color:var(--muted)}
.stat-n{margin-top:10px;font-size:26px;font-weight:650;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums}
.stat-sub{margin-top:4px;color:var(--subtle);font-size:12.5px}
.ov-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border)}
.card-head h2{white-space:nowrap;font-size:14px;font-weight:600;letter-spacing:-.01em}
.card-head .meta{font-size:12.5px;color:var(--subtle)}
.card-head a{font-size:12.5px;font-weight:500;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.steps{list-style:none;margin:0;padding:6px 0}
.step{display:flex;gap:14px;padding:12px 18px}
.step-dot{display:grid;place-items:center;width:22px;height:22px;margin-top:1px;border-radius:50%;border:1.5px solid var(--border);color:var(--subtle);font-size:11.5px;font-weight:600;flex:none;background:var(--surface)}
.step.is-done .step-dot{background:var(--accent);border-color:var(--accent);color:#fff}
.step-body{min-width:0;flex:1}
.step-title{font-weight:600;font-size:13.5px}
.step.is-done .step-title{color:var(--muted)}
.step-copy{color:var(--muted);font-size:12.5px;margin-top:2px}
.step-link{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:12.5px;font-weight:500;text-decoration:none}
.progress{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--subtle)}
.bar{width:72px;height:6px;border-radius:99px;background:var(--surface-2);overflow:hidden}
.bar>span{display:block;height:100%;width:0;background:var(--accent);border-radius:inherit;transition:width .3s}
.activity{list-style:none;margin:0;padding:4px 0}
.act{display:flex;align-items:center;gap:12px;padding:10px 18px}
.act + .act{border-top:1px solid var(--border-soft)}
.act-dot{width:8px;height:8px;border-radius:50%;flex:none;box-shadow:0 0 0 4px var(--surface-2)}
.act-dot.is-ok{background:var(--success)}
.act-dot.is-warn{background:#f59e0b}
.act-main{min-width:0;flex:1}
.act-title{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.act-type{font:11.5px var(--mono);color:var(--subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.act-time{font-size:12px;color:var(--subtle);white-space:nowrap}
/* Tables */
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.search{position:relative;flex:0 1 300px;min-width:0}
.search .i{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--subtle)}
.search .input{min-height:32px;padding-left:32px;font-size:13px;border-radius:8px}
.input{min-height:36px;font-size:14px;border-radius:8px}
.count{font-size:12.5px;color:var(--subtle)}
.seg{display:inline-flex;padding:2px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);gap:2px}
.seg button{height:26px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--muted);font:500 12.5px var(--font);cursor:pointer;white-space:nowrap}
.seg button:hover{color:var(--text)}
.seg button[aria-pressed="true"]{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--border),var(--shadow-sm)}
.seg .n{margin-left:5px;color:var(--subtle);font-variant-numeric:tabular-nums}
.table-wrap{overflow-x:auto}
.table{width:100%;border-collapse:collapse;font-size:13px}
.table th{padding:9px 16px;text-align:left;font-size:12px;font-weight:500;color:var(--subtle);background:var(--sidebar);border-bottom:1px solid var(--border);white-space:nowrap}
.table td{height:50px;padding:8px 16px;border-bottom:1px solid var(--border-soft);vertical-align:middle;white-space:nowrap}
.table tbody tr:last-child td{border-bottom:0}
.table tbody tr:hover td{background:var(--hover)}
.table .end{text-align:right;width:1%}
.cell-main{display:flex;align-items:center;gap:10px;min-width:0}
.cell-title{font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;max-width:280px}
.cell-sub{font-size:12px;color:var(--subtle)}
.mono{font:12.5px var(--mono);color:var(--muted)}
.pill-code{display:inline-block;padding:1px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);font:12px var(--mono);color:var(--muted)}
.muted-cell{color:var(--muted)}
.avatar-sm{width:28px;height:28px;font-size:12px}
.status{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:99px;font-size:12px;font-weight:500;border:1px solid var(--border);color:var(--muted);background:var(--surface)}
.status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.status-ok{color:var(--success);background:var(--success-soft);border-color:transparent}
.status-warn{color:var(--warn);background:var(--warn-soft);border-color:transparent}
.status-off{color:var(--subtle);background:var(--surface-2);border-color:transparent}
.status-bad{color:var(--danger);background:var(--danger-soft);border-color:transparent}
.row-action{min-height:28px;padding:0 10px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--danger);font:500 12.5px var(--font);cursor:pointer;box-shadow:var(--shadow-sm)}
.row-action:hover{background:var(--danger-soft)}
.sk{display:block;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--surface-2),var(--hover),var(--surface-2));background-size:200% 100%;animation:sk 1.2s ease-in-out infinite}
@keyframes sk{from{background-position:100% 0}to{background-position:-100% 0}}
@media (prefers-reduced-motion:reduce){.sk{animation:none}}
.empty{display:grid;justify-items:center;gap:6px;padding:44px 20px;text-align:center}
.empty svg.art{margin-bottom:6px}
.empty h3{font-size:14px;font-weight:600}
.empty p{color:var(--muted);font-size:13px;max-width:380px}
.empty .actions{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.empty code{white-space:nowrap;font-size:12px;padding:1px 5px;border-radius:5px;background:var(--surface-2)}
/* Secret panel */
.secret{display:grid;gap:10px;margin-bottom:16px;padding:16px 18px;border:1px solid color-mix(in srgb,var(--warn) 45%,var(--border));border-radius:12px;background:var(--warn-soft)}
.secret-head{display:flex;gap:10px;align-items:flex-start;color:var(--warn)}
.secret-head strong{display:block;color:var(--text);font-size:13.5px}
.secret-head p{color:var(--muted);font-size:12.5px}
.secret-row{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}
.secret-row code{flex:1 1 260px;min-width:0;display:flex;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12.5px;overflow-wrap:anywhere}
/* Settings */
.settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.section-title{display:flex;align-items:baseline;gap:10px;margin:28px 0 12px}
.section-title h2{font-size:15px;font-weight:600}
.section-title p{font-size:12.5px;color:var(--subtle)}
.setting{padding:16px 18px;display:grid;gap:10px;align-content:start}
.setting-head{display:flex;align-items:center;gap:12px}
.setting-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);flex:none}
.setting-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1}
.setting-title h3{font-size:13.5px;font-weight:600;letter-spacing:-.01em}
.setting-body{font-size:12.5px;color:var(--muted)}
.setting-value{display:flex;gap:6px;flex-wrap:wrap}
.kv{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);font-size:12px;color:var(--muted)}
.kv b{color:var(--text);font-weight:600}
.badge-ro,.badge-soon{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:.01em}
.badge-ro{background:var(--surface-2);color:var(--subtle);border:1px solid var(--border)}
.badge-soon{background:var(--accent-soft);color:var(--accent-text)}
.is-soon .setting-icon{opacity:.6}
.switch{width:32px;height:18px;border-radius:99px;background:var(--border);position:relative;flex:none;opacity:.7;cursor:not-allowed}
.switch span{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--surface);box-shadow:var(--shadow-sm)}
/* Dialogs */
dialog{width:min(440px,calc(100vw - 32px));padding:0;border:1px solid var(--border);border-radius:14px;background:var(--surface);color:var(--text);box-shadow:0 24px 48px -12px rgba(16,24,40,.25)}
dialog::backdrop{background:var(--overlay)}
.dlg-body{padding:20px 20px 4px}
.dlg-body h2{font-size:16px;font-weight:600;letter-spacing:-.01em}
.dlg-body p{margin-top:6px;color:var(--muted);font-size:13.5px}
.dlg-body .field{margin:16px 0 8px}
.dlg-body .field label{font-size:13px;font-weight:500}
.dlg-body .alert{margin:12px 0 0;font-size:13px}
.dlg-foot{display:flex;justify-content:flex-end;gap:8px;padding:16px 20px;margin-top:12px;border-top:1px solid var(--border);background:var(--sidebar);border-radius:0 0 14px 14px}
.danger-ico{display:grid;place-items:center;width:36px;height:36px;margin-bottom:12px;border-radius:50%;background:var(--danger-soft);color:var(--danger)}
/* Toasts */
.toasts{position:fixed;right:20px;bottom:20px;z-index:60;display:grid;gap:8px;width:min(360px,calc(100vw - 32px))}
.toast{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-shadow:0 12px 32px -8px rgba(16,24,40,.25);animation:toast-in .18s ease-out}
.toast::before{content:"";width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--success);flex:none}
.toast.is-error::before{background:var(--danger)}
@keyframes toast-in{from{opacity:0;transform:translateY(6px)}}
.backdrop{display:none}
.page-error{margin-bottom:16px}
/* Responsive */
@media (max-width:1100px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1000px){.ov-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:899px){
  .sidebar{transform:translateX(-100%);transition:transform .2s ease;box-shadow:none;width:min(280px,86vw)}
  .sidebar.is-open{transform:none;box-shadow:0 24px 48px rgba(16,24,40,.25)}
  .sidebar .sb-close{display:inline-grid}
  .backdrop{position:fixed;inset:0;z-index:35;background:var(--overlay)}
  .backdrop.is-open{display:block}
  .main{margin-left:0}
  .mainbar{padding:0 12px}
  .menu-btn{display:inline-grid}
  .content{padding:20px 16px 48px}
  .settings{grid-template-columns:minmax(0,1fr)}
  .hide-sm{display:none}
}
@media (max-width:560px){
  .page-head{flex-direction:column;align-items:stretch}
  .page-head .btn{align-self:flex-start}
  .stats{gap:10px}
  .stat{padding:14px}
  .stat-n{font-size:22px}
  .hide-xs{display:none}
  .table th,.table td{padding-left:12px;padding-right:12px}
  .cell-title{max-width:150px}
  .search{flex:1 1 100%}
  .mainbar .docs span{display:none}
}
@media (prefers-reduced-motion:reduce){.sidebar{transition:none}.toast{animation:none}}
`;

// Static illustration cloned by the client into empty states.
const emptyArt = `<svg class="art" width="112" height="72" viewBox="0 0 112 72" aria-hidden="true"><rect x="22" y="6" width="68" height="18" rx="6" fill="var(--surface)" stroke="var(--border)"/><rect x="14" y="27" width="84" height="20" rx="7" fill="var(--surface)" stroke="var(--border)" /><circle cx="27" cy="37" r="5" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/><rect x="37" y="34" width="38" height="6" rx="3" fill="var(--surface-2)"/><rect x="22" y="50" width="68" height="18" rx="6" fill="var(--surface)" stroke="var(--border)" opacity=".6"/><rect x="32" y="12" width="30" height="5" rx="2.5" fill="var(--surface-2)"/><rect x="32" y="56" width="40" height="5" rx="2.5" fill="var(--surface-2)"/></svg>`;

const body = `<div class="shell">
<aside class="sidebar" id="sidebar" aria-label="Console navigation">
<div class="sb-top"><div style="display:flex;align-items:center"><a class="sb-brand" href="/" aria-label="AuthForge home">${brandMark}<span>AuthForge</span></a><button class="icon-btn sb-close" id="sb-close" type="button" aria-label="Close navigation">${icons.close}</button></div>
<div class="app-switch" title="Single demo application. Switching applications is not available in this showcase."><span class="app-logo" aria-hidden="true">A</span><span class="app-meta"><span class="app-name">AuthForge Demo</span><span class="env">Development</span></span>${icons.chevrons}</div></div>
<nav class="sb-nav" aria-label="Console sections">
${navItem("overview", "Overview", icons.home)}
<div class="nav-group">Manage</div>
${navItem("users", "Users", icons.users)}
${navItem("api-keys", "API keys", icons.key)}
${navItem("sessions", "Sessions", icons.sessions)}
${navItem("events", "Events", icons.events)}
<div class="nav-group">Configure</div>
${navItem("settings", "Authentication settings", icons.settings)}
<div class="nav-group">Developers</div>
<a class="nav-item" href="/docs">${icons.book}<span>Documentation</span></a>
<a class="nav-item" href="/docs#api">${icons.code}<span>API reference</span></a>
</nav>
<div class="sb-user"><span class="avatar" id="user-avatar" aria-hidden="true"></span><div class="who"><span class="email" id="user-email"></span><span class="role">Console operator</span></div><button id="signout" class="icon-btn" type="button" aria-label="Sign out" title="Sign out">${icons.logout}</button></div>
</aside>
<div class="backdrop" id="backdrop"></div>
<div class="main">
<header class="mainbar"><button class="icon-btn menu-btn" id="menu-btn" type="button" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${icons.menu}</button>
<nav class="crumbs" aria-label="Breadcrumb"><span>AuthForge Demo</span><span class="sep" aria-hidden="true">/</span><span id="crumb" aria-current="page">Overview</span></nav>
<a class="docs" href="/docs">${icons.book}<span>Docs</span></a></header>
<main class="content" id="app" hidden>
<div id="page-error" class="alert alert-error page-error" role="alert"></div>

<section id="view-overview" data-view="overview" aria-labelledby="h-overview">
${pageHead('<span id="h-overview">Overview</span>', "A live snapshot of this shared demo application. Everyone signed in manages the same keys, sessions, and events.")}
<div class="stats">
<div class="card stat"><div class="stat-top">Users<span class="stat-ico">${icons.users}</span></div><div class="stat-n" id="m-users">-</div><div class="stat-sub" id="m-users-sub">Demo accounts</div></div>
<div class="card stat"><div class="stat-top">Active API keys<span class="stat-ico">${icons.key}</span></div><div class="stat-n" id="m-keys">-</div><div class="stat-sub" id="m-keys-sub">Not revoked</div></div>
<div class="card stat"><div class="stat-top">Active sessions<span class="stat-ico">${icons.sessions}</span></div><div class="stat-n" id="m-sessions">-</div><div class="stat-sub" id="m-sessions-sub">Valid right now</div></div>
<div class="card stat"><div class="stat-top">Events<span class="stat-ico">${icons.events}</span></div><div class="stat-n" id="m-events">-</div><div class="stat-sub" id="m-events-sub">Delivered and pending</div></div>
</div>
<div class="ov-grid">
<div class="card"><div class="card-head"><h2>Get started</h2><div class="progress" title="Step 3 is not tracked by the console"><span id="progress-label">0 of 2 done</span><span class="bar"><span id="progress-bar"></span></span></div></div>
<ol class="steps">
<li class="step" id="step-key"><span class="step-dot">1</span><div class="step-body"><div class="step-title">Create an API key</div><div class="step-copy">Your backend uses it to create and manage sessions.</div><a class="step-link" href="#api-keys">Go to API keys ${icons.arrow}</a></div></li>
<li class="step" id="step-session"><span class="step-dot">2</span><div class="step-body"><div class="step-title">Create a session from your backend</div><div class="step-copy">Call <code class="pill-code">POST /v1/sessions</code> with the key as a Bearer token.</div><a class="step-link" href="/docs#create-session">Read the guide ${icons.arrow}</a></div></li>
<li class="step" id="step-validate"><span class="step-dot">3</span><div class="step-body"><div class="step-title">Validate the session token</div><div class="step-copy">Validation calls are not tracked here. Follow the guide to try it.</div><a class="step-link" href="/docs#validate-session">Read the guide ${icons.arrow}</a></div></li>
</ol></div>
<div class="card"><div class="card-head"><h2>Recent activity</h2><a href="#events">View all ${icons.arrow}</a></div><ul class="activity" id="activity"></ul><div class="empty" id="activity-empty" hidden><h3>No activity yet</h3><p>Key and session changes will appear here.</p></div></div>
</div>
</section>

<section id="view-users" data-view="users" aria-labelledby="h-users" hidden>
${pageHead('<span id="h-users">Users</span>', "Demo accounts registered through the hosted sign-up page. This list is read-only.")}
<div class="card"><div class="toolbar"><label class="search"><span class="sr-only">Search users by email</span>${icons.search}<input id="user-search" class="input" type="search" placeholder="Search by email" autocomplete="off"></label><span class="count" id="user-count"></span></div>
${table("user-table", [["User"], ["Status"], ["Created", "hide-xs"]], "users-empty")}</div>
</section>

<section id="view-api-keys" data-view="api-keys" aria-labelledby="h-api-keys" hidden>
${pageHead('<span id="h-api-keys">API keys</span>', "Secret keys authenticate your backend to the sessions API. Each secret is shown only once, when it is created.", `<button id="open-create-key" class="btn btn-primary" type="button">${icons.plus}Create API key</button>`)}
<div id="new-secret" class="secret" role="region" aria-label="New API key secret" hidden><div class="secret-head">${icons.warn}<div><strong>Copy your new secret key now</strong><p>For security it will not be shown again. Store it in your backend's environment.</p></div></div>
<div class="secret-row"><code id="new-secret-value"></code><button id="copy-secret" class="btn btn-primary" type="button">${icons.copy}Copy</button><button id="dismiss-secret" class="btn btn-secondary" type="button">I've saved it</button></div></div>
<div class="card">${table("key-table", [["Name"], ["Key", "hide-xs"], ["Created", "hide-sm"], ["Status"], ['<span class="sr-only">Actions</span>', "end"]], "keys-empty")}</div>
</section>

<section id="view-sessions" data-view="sessions" aria-labelledby="h-sessions" hidden>
${pageHead('<span id="h-sessions">Sessions</span>', "Application sessions created through the API. Revoking a session makes its token fail validation immediately.")}
<div class="card"><div class="toolbar"><div class="seg" role="group" aria-label="Filter sessions"><button type="button" data-filter="all" aria-pressed="true">All<span class="n" id="f-all"></span></button><button type="button" data-filter="active" aria-pressed="false">Active<span class="n" id="f-active"></span></button><button type="button" data-filter="ended" aria-pressed="false">Revoked or expired<span class="n" id="f-ended"></span></button></div></div>
${table("session-table", [["Subject"], ["API key", "hide-sm"], ["Created", "hide-sm"], ["Expires", "hide-xs"], ["Status"], ['<span class="sr-only">Actions</span>', "end"]], "sessions-empty")}</div>
</section>

<section id="view-events" data-view="events" aria-labelledby="h-events" hidden>
${pageHead('<span id="h-events">Events</span>', "Redacted lifecycle records for key and session changes. The worker delivers each one to S3 and the SES mailbox simulator.")}
<div class="card">${table("event-table", [["Event"], ["Status"], ["Created", "hide-xs"]], "events-empty")}</div>
</section>

<section id="view-settings" data-view="settings" aria-labelledby="h-settings" hidden>
${pageHead('<span id="h-settings">Authentication settings</span>', "How sign-in works in this deployment. These values come from the server configuration and cannot be changed from the console.")}
<div class="settings">
${settingCard(icons.lock, "Email + password", "Users sign up and sign in with an email address and a password, hashed with Argon2id.", '<span class="status status-ok">Enabled</span><span class="kv">Password <b>12 to 256 characters</b></span>')}
${settingCard(icons.mail, "Email verification", "New accounts must confirm a single-use link before they can sign in. Links go only to the configured demo inbox.", '<span class="status status-ok">Required</span><span class="kv">Link expires in <b>1 hour</b></span>')}
${settingCard(icons.reset, "Password reset", "Verified users can request a single-use reset link. Resetting signs out every browser session for that account.", '<span class="kv">Link expires in <b>15 minutes</b></span>')}
${settingCard(icons.globe, "Allowed sign-up domain", "Only synthetic demo addresses can register. Real personal email addresses are rejected.", '<span class="kv"><b class="mono">@authforge.demo</b></span>')}
${settingCard(icons.clock, "Application sessions", "Lifetime of sessions your backend creates with an API key. Requests may set a shorter lifetime, up to the maximum.", '<span class="kv">Default <b>15 minutes</b></span><span class="kv">Maximum <b>1 hour</b></span>')}
${settingCard(icons.shield, "Console sign-in", "Signed-in users get an HTTP-only browser session. Console changes also require a CSRF token and a trusted origin.", '<span class="kv">Session lasts <b>1 hour</b></span>')}
</div>
<div class="section-title"><h2>More options</h2><p>Not available in this temporary demo.</p></div>
<div class="settings">
${soonCard(icons.link, "Social connections", "Sign in with external identity providers.")}
${soonCard(icons.shield, "Multi-factor authentication", "Require a second factor at sign-in.")}
${soonCard(icons.building, "Organizations", "Group users into teams with shared access.")}
</div>
</section>
</main>
</div>
</div>
<dialog id="create-key" aria-labelledby="create-key-title"><form id="key-form" novalidate><div class="dlg-body"><h2 id="create-key-title">Create API key</h2><p>Give the key a name you will recognize later, such as the service that uses it.</p>
<div class="field"><label for="key-name">Key name</label><input id="key-name" class="input" maxlength="120" autocomplete="off" placeholder="e.g. my-backend" required aria-describedby="key-error"></div>
<div id="key-error" class="alert alert-error" role="alert"></div></div>
<div class="dlg-foot"><button id="key-cancel" class="btn btn-secondary" type="button">Cancel</button><button id="key-submit" class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="label">Create key</span></button></div></form></dialog>
<dialog id="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-copy"><div class="dlg-body"><span class="danger-ico">${icons.warn}</span><h2 id="confirm-title"></h2><p id="confirm-copy"></p><div id="confirm-error" class="alert alert-error" role="alert"></div></div><div class="dlg-foot"><button id="confirm-cancel" class="btn btn-secondary" type="button">Cancel</button><button id="confirm-ok" class="btn btn-danger-solid" type="button"><span class="spinner" aria-hidden="true"></span><span class="label">Revoke</span></button></div></dialog>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<template id="empty-art">${emptyArt}</template>`;

export const consolePage = renderPage({ title: "Console - AuthForge", page: "console", body, css, script: "/dashboard.js" });
