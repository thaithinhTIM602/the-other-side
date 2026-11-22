export const $ = id => document.getElementById(id);
export const num = n => n.toLocaleString('en-US');
export const price = cents => (cents / 100).toLocaleString('en-US', { style:'currency', currency:'USD' });
export const money = cents => (cents < -0.0001 ? '−' : cents > 0.0001 ? '+' : '') + price(Math.abs(cents));
export const pct = n => (100*n).toFixed(1) + '%';
export const tone = n => n > 0 ? 'positive' : n < 0 ? 'negative' : '';
export function time(index) {
  const seconds = 9*3600 + 30*60 + 5*(index + 1);
  return [Math.floor(seconds/3600), Math.floor(seconds/60)%60, seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
export const sideLabel = n => n === 1 ? 'Buy' : 'Sell';
export const venue = f => f.deskQty && f.rivalQty ? 'Split' : f.deskQty ? 'Your desk' : f.rivalQty ? 'Rival' : 'No fill';
export const fillText = f => f.deskQty ? num(f.deskQty)+' @ '+price(f.deskPx) : '0 shares';
export function integerInput(el, report = true) {
  if (!el.value.trim() || !el.checkValidity() || !Number.isInteger(el.valueAsNumber)) {
    if (report) { el.focus(); el.reportValidity(); }
    return null;
  }
  return el.valueAsNumber;
}
let toastTimer;
export function announce(message) {
  $('toast').textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').textContent='',2900);
}
const paths = {
  desk:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M10 10v10"/>',
  replay:'<path d="M3 10a9 9 0 1 1 1.5 8M3 4v6h6M12 7v5l3 2"/>',
  lab:'<path d="M9 3h6m-5 0v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 15h8"/>',
  book:'<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6v14"/>',
  pnl:'<path d="M3 17l6-6 4 4 8-10M15 5h6v6"/>',
  layers:'<path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  spread:'<path d="M7 5v14M17 5v14M3 9l4-4 4 4M13 15l4 4 4-4"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  chart:'<path d="M3 4v16h18M6 14l4-5 4 4 6-7"/>',
  sliders:'<path d="M4 6h8m4 0h4M4 12h2m4 0h10M4 18h10m4 0h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  tape:'<path d="M7 5h13M7 12h13M7 19h13M3 5h.1M3 12h.1M3 19h.1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play:'<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>',
  step:'<path d="M5 5l10 7-10 7zM19 5v14"/>',
  fast:'<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/>',
  check:'<path d="M4 12l5 5L20 6"/>',
  branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10m0-2h3a9 9 0 0 0 9-7"/>',
  download:'<path d="M12 3v12m-5-5l5 5 5-5M4 16v4h16v-4"/>'
};
export function icon(name) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||'')+'</svg>';
}
