// Стили панели. Панель живёт в Shadow DOM, поэтому стили сайта на неё не влияют.
(function (SPP) {
  'use strict';
  SPP.CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #ffffff; --bg2: #f5f7fb; --bg3: #eef1f7; --fg: #1d2433; --fg2: #5b6578; --fg3: #8b94a6;
  --line: #e2e6ef; --accent: #2f6fde; --accent-bg: #e8f0fd;
  --lv1: #d9363e; --lv2: #ef7a1a; --lv3: #e0a800; --lv4: #6aa628; --lv5: #23944a;
  --lv1-bg: #fde8e8; --lv2-bg: #fdeedd; --lv3-bg: #fdf5d6; --lv4-bg: #ebf5df; --lv5-bg: #ddf2e4;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .root {
    --bg: #1b1f27; --bg2: #232833; --bg3: #2b3140; --fg: #e7eaf0; --fg2: #a9b1c1; --fg3: #7d8698;
    --line: #353c4b; --accent: #6b9cf5; --accent-bg: #26324a;
    --lv1-bg: #4a2427; --lv2-bg: #4a3220; --lv3-bg: #463b17; --lv4-bg: #2f4020; --lv5-bg: #1f3d2a;
  }
}
.fab {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
  display: flex; align-items: center; gap: 8px; padding: 10px 16px 10px 12px;
  border: 0; border-radius: 24px; background: var(--accent); color: #fff; cursor: pointer;
  font: 600 14px/1 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(20, 40, 90, .3);
}
.fab:hover { filter: brightness(1.08); }
.fab svg { width: 18px; height: 18px; }
.overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(15, 20, 30, .35); display: flex; justify-content: flex-end; }
.hidden { display: none !important; }
.panel {
  width: min(960px, 100vw); height: 100vh; background: var(--bg); display: flex; flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, .2);
}
header { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
header h1 { margin: 0; font-size: 16px; font-weight: 700; }
header h1 span { color: var(--accent); }
header .who { color: var(--fg2); }
header .sp { flex: 1; }
.status { padding: 6px 18px; font-size: 12px; color: var(--fg3); border-bottom: 1px solid var(--line); background: var(--bg2); }
.status.err { color: var(--lv1); background: var(--lv1-bg); }
button.btn, select, input {
  font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line);
  border-radius: 8px; padding: 6px 10px;
}
button.btn { cursor: pointer; }
button.btn:hover { background: var(--bg3); }
button.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.btn:disabled { opacity: .5; cursor: default; }
button.icon { border: 0; background: none; font-size: 22px; line-height: 1; cursor: pointer; color: var(--fg2); padding: 2px 6px; }
nav { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--line); }
nav button {
  border: 0; background: none; padding: 10px 12px; cursor: pointer; font: 600 13px system-ui, sans-serif;
  color: var(--fg2); border-bottom: 2px solid transparent; margin-bottom: -1px;
}
nav button.on { color: var(--accent); border-bottom-color: var(--accent); }
main { flex: 1; overflow: auto; padding: 16px 18px 40px; }
h2 { font-size: 14px; margin: 22px 0 10px; }
h2:first-child { margin-top: 0; }
.muted { color: var(--fg3); }
.small { font-size: 12px; }
.empty { padding: 30px; text-align: center; color: var(--fg3); }

.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.kpi { background: var(--bg2); border-radius: 10px; padding: 10px 12px; }
.kpi .t { font-size: 12px; color: var(--fg2); }
.kpi .v { font-size: 24px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
.kpi .v small { font-size: 13px; font-weight: 500; color: var(--fg2); margin-left: 6px; }
.kpi .s { font-size: 12px; color: var(--fg3); }

table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: center; white-space: nowrap; }
th { font-size: 12px; color: var(--fg2); font-weight: 600; position: sticky; top: -16px; background: var(--bg); z-index: 1; }
th.sort { cursor: pointer; user-select: none; }
th.sort:hover { color: var(--accent); }
th:first-child, td:first-child { text-align: left; }
td.subj { white-space: normal; min-width: 140px; }
tr.row { cursor: pointer; }
tr.row:hover td { background: var(--bg2); }
th.cur, td.cur { background: var(--accent-bg); }
tr.row:hover td.cur { background: var(--accent-bg); }
tfoot td { font-weight: 600; border-bottom: 0; border-top: 2px solid var(--line); }

.qv { display: inline-flex; align-items: baseline; gap: 5px; }
.qv .ex { font-size: 11px; color: var(--fg2); }
.m {
  display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; padding: 0 5px;
  border-radius: 6px; font-weight: 700; font-size: 13px;
}
.lv1 { color: var(--lv1); background: var(--lv1-bg); }
.lv2 { color: var(--lv2); background: var(--lv2-bg); }
.lv3 { color: var(--lv3); background: var(--lv3-bg); }
.lv4 { color: var(--lv4); background: var(--lv4-bg); }
.lv5 { color: var(--lv5); background: var(--lv5-bg); }
.tag { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: var(--bg3); color: var(--fg2); margin-left: 4px; font-weight: 600; }
.up { color: var(--lv5); }
.down { color: var(--lv1); }
.flat { color: var(--fg3); }
.spark path { fill: none; stroke: var(--accent); stroke-width: 1.6; }
.spark circle { fill: var(--accent); }

.chart { width: 100%; height: auto; display: block; }
.chart .grid { stroke: var(--line); stroke-width: 1; }
.chart .tick { stroke: var(--fg3); }
.chart .axis { fill: var(--fg3); font-size: 10px; }
.chart .axis.strong { fill: var(--fg2); font-size: 12px; font-weight: 600; }
.chart .band { fill: var(--bg2); }
.chart .band.odd { fill: var(--bg3); }
.chart .band-label { fill: var(--fg2); font-size: 11px; font-weight: 600; }
.chart .ln { fill: none; stroke: var(--accent); stroke-width: 2.2; stroke-linejoin: round; }
.chart .ln.alt { stroke: var(--fg3); stroke-width: 1.5; stroke-dasharray: 4 3; }
.chart .ln.soft { stroke: var(--accent); stroke-width: 1.2; opacity: .45; }
.chart .dot { fill: var(--accent); stroke: var(--bg); stroke-width: 1.5; }
.chart .dot.lv1 { fill: var(--lv1); } .chart .dot.lv2 { fill: var(--lv2); } .chart .dot.lv3 { fill: var(--lv3); }
.chart .dot.lv4 { fill: var(--lv4); } .chart .dot.lv5 { fill: var(--lv5); }
.chart .bar.lv1 { fill: var(--lv1); } .chart .bar.lv2 { fill: var(--lv2); } .chart .bar.lv3 { fill: var(--lv3); }
.chart .bar.lv4 { fill: var(--lv4); } .chart .bar.lv5 { fill: var(--lv5); }
.chart .bar { color: inherit; background: none; }
.chart .bar-val { fill: var(--fg2); font-size: 11px; }
.legend { display: flex; gap: 16px; font-size: 12px; color: var(--fg2); margin: 4px 0 0 30px; flex-wrap: wrap; }
.legend i { display: inline-block; width: 16px; height: 0; border-top: 2.5px solid var(--accent); vertical-align: middle; margin-right: 5px; }
.legend i.alt { border-top: 2px dashed var(--fg3); }
.legend i.dot { width: 8px; height: 8px; border: 0; border-radius: 50%; background: var(--accent); }

.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
.card { background: var(--bg2); border-radius: 10px; padding: 12px 14px; }
.card h3 { margin: 0 0 8px; font-size: 13px; }
.card p { margin: 4px 0; }

.subj-head { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.subj-head select { min-width: 240px; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chips .m { cursor: default; }
.qblock { margin: 10px 0 14px; }
.qblock .qt { font-weight: 600; margin-bottom: 6px; display: flex; gap: 8px; align-items: center; }

.hbars { display: flex; flex-direction: column; gap: 6px; }
.hbar { display: grid; grid-template-columns: 32px 1fr 44px 70px; gap: 8px; align-items: center; }
.hbar-label { color: var(--fg2); font-weight: 600; }
.hbar-track { height: 10px; border-radius: 5px; background: var(--bg3); overflow: hidden; }
.hbar-fill { display: block; height: 100%; border-radius: 5px; }
.hbar-fill.lv1 { background: var(--lv1); } .hbar-fill.lv2 { background: var(--lv2); } .hbar-fill.lv3 { background: var(--lv3); }
.hbar-fill.lv4 { background: var(--lv4); } .hbar-fill.lv5 { background: var(--lv5); }
.hbar-val { font-weight: 600; font-variant-numeric: tabular-nums; }
.hbar-n { color: var(--fg3); font-size: 12px; }

.whatif { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.whatif input { width: 200px; }
.form-row { display: flex; gap: 12px; align-items: center; margin: 10px 0; flex-wrap: wrap; }
.form-row label { min-width: 230px; }
.form-row input[type=number] { width: 90px; }
.progress { height: 3px; background: var(--accent-bg); overflow: hidden; }
.progress::after { content: ""; display: block; height: 100%; width: 30%; background: var(--accent); animation: slide 1.2s infinite ease-in-out; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }

.tscroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -2px; }
.tip {
  position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  z-index: 2147483647; background: var(--fg); color: var(--bg); padding: 8px 14px; border-radius: 10px;
  font: 600 13px system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0, 0, 0, .25); max-width: 90vw;
}
.msort { margin-bottom: 10px; }
.msort select { width: 100%; }
.scards { display: flex; flex-direction: column; gap: 8px; }
.scard { background: var(--bg2); border-radius: 12px; padding: 10px 12px; cursor: pointer; }
.scard:active { background: var(--bg3); }
.scard.total { cursor: default; border: 1px solid var(--line); background: var(--bg); }
.sc-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.sc-name { font-weight: 600; font-size: 14px; }
.sc-year { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.sc-qs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 8px; }
.sc-q { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 2px; border-radius: 8px; background: var(--bg); }
.sc-q.cur { background: var(--accent-bg); }
.sc-ql { font-size: 10px; color: var(--fg3); font-weight: 600; }
.sc-foot { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 12px; color: var(--fg2); }
.sc-foot > span:first-child { flex: 1; }

@media (max-width: 640px) {
  .fab { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); padding: 12px; border-radius: 50%; }
  .fab .fab-text { display: none; }
  .fab svg { width: 22px; height: 22px; }
  .panel { width: 100vw; height: 100vh; height: 100dvh; box-shadow: none; }
  header { padding: 10px 12px; padding-top: calc(10px + env(safe-area-inset-top)); gap: 8px; }
  header h1 { font-size: 15px; }
  header .who { font-size: 12px; max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header select { max-width: 44vw; }
  button.btn { padding: 8px 12px; }
  button.icon { font-size: 28px; padding: 0 4px; }
  .status { padding: 6px 12px; }
  nav { padding: 0 4px; overflow-x: auto; scrollbar-width: none; }
  nav button { padding: 12px 10px; flex: 1 0 auto; }
  main { padding: 12px 12px calc(40px + env(safe-area-inset-bottom)); overscroll-behavior: contain; }
  .kpis { grid-template-columns: 1fr 1fr; gap: 8px; }
  .kpi { padding: 8px 10px; }
  .kpi .v { font-size: 20px; }
  .kpi .v small { display: block; margin: 0; font-size: 11px; }
  .subj-head select { min-width: 0; width: 100%; }
  th, td { padding: 6px 6px; }
  th { top: -12px; }
  .whatif input { width: 100%; }
  .form-row label { min-width: 0; }
  .hbar { grid-template-columns: 28px 1fr 40px 56px; }
  .legend { margin-left: 0; }
  .dk { display: none; }
  td.subj { min-width: 110px; }
  select, input { font-size: 16px; } /* иначе iOS/Android масштабируют страницу при фокусе */
}
`;
})(globalThis.SPP = globalThis.SPP || {});
