import { compileFormula, formulaTilt } from './formula.mjs';
// All prices, cash, fees, and profit are integer cents. One event is five simulated seconds.
export const STEPS = 60;
export const STEP_SECONDS = 5;
export const LIMIT = 1000;
export const WARNING_POSITION = 800;
export const FEE = 1;
export const DEFAULT_SEED = 41726;
export const DEFAULT_QUOTE = Object.freeze({ half: 4, tilt: 0, size: 100 });
export const DEFAULT_RULE = Object.freeze({ half: 4, risk: 2, flow: 1, size: 100 });
export const STRATEGIES = Object.freeze([
  { id: 'fixed', name: 'Fixed spread', rule: { half: 4, risk: 0, flow: 0, size: 100 } },
  { id: 'inventory', name: 'Inventory guard', rule: { half: 4, risk: 3, flow: 0, size: 100 } },
  { id: 'flow', name: 'Flow reader', rule: { half: 4, risk: 1, flow: 4, size: 100 } }
]);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (n, lo, hi, fallback) => Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : fallback;

export function normalizeQuote(q = {}) {
  return { half: int(q.half, 1, 20, 4), tilt: int(q.tilt, -20, 20, 0), size: int(q.size, 1, 500, 100) };
}
export function normalizeRule(r = {}) {
  const rule = { half: int(r.half, 1, 20, 4), risk: int(r.risk, 0, 8, 2),
    flow: int(r.flow, -8, 8, 1), size: int(r.size, 1, 500, 100) };
  if (r.formula) { compileFormula(r.formula); rule.formula = r.formula.trim(); }
  return rule;
}
export function normalizeAction(action) {
  return action?.mode === 'rule'
    ? { mode: 'rule', rule: normalizeRule(action.rule) }
    : { mode: 'manual', quote: normalizeQuote(action?.quote) };
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The exogenous tape contains the market environment, never a preselected winner or fill.
// A fund has several child orders on the same side. Other customers may arrive between them.
export function makeMarket(seed = DEFAULT_SEED) {
  const random = rng(seed);
  const pick = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  let fair = 10000, ref = 10000, remaining = 0, fundSide = 1;
  const events = [];
  for (let i = -STEPS; i < STEPS; i++) {
    if (remaining === 0 && random() < 0.10) {
      remaining = pick(3, 8);
      fundSide = random() < 0.5 ? 1 : -1;
    }
    const shock = random() < 0.09 ? pick(11, 29) * (random() < 0.5 ? -1 : 1) : 0;
    fair = Math.max(100, fair + pick(-5, 5) + shock);
    const clue = fair + pick(-8, 8);
    const type = remaining > 0 && random() < 0.68 ? 'fund' : random() < 0.33 ? 'informed' : 'liquidity';
    const side = type === 'fund' ? fundSide : type === 'informed' ? (clue >= ref ? 1 : -1) : random() < 0.5 ? 1 : -1;
    if (type === 'fund') remaining--;
    const qty = type === 'fund' ? 25 * pick(4, 12) : 25 * pick(1, 8);
    // A buyer's limit is a maximum. A seller's limit is a minimum.
    const limit = type === 'informed' ? clue - side : ref + side * pick(8, type === 'fund' ? 19 : 15);
    const rivalMid = ref + pick(-3, 3), rivalHalf = pick(3, 7);
    const next = Math.max(100, ref + Math.round((fair - ref) * 0.27) + pick(-2, 2));
    events.push({ i, ref, next, fair, clue, type, side, qty, limit, rivalBid: rivalMid - rivalHalf,
      rivalAsk: rivalMid + rivalHalf, deskFirst: random() < 0.5 });
    ref = next;
  }
  return { seed: seed >>> 0, opening: events.slice(0, STEPS), events: events.slice(STEPS) };
}

export function startState() {
  return { inventory: 0, cash: 0, fees: 0, pnl: 0, peakPnl: 0, drawdown: 0, maxInventory: 0,
    filled: 0, offered: 0, fillOrders: 0, steps: 0 };
}

// Only information observable before this customer's arrival reaches an automated trader.
export function observation(market, state, i) {
  const e = market.events[i];
  let flowSum = 0;
  for (let offset = 1; offset <= 6; offset++) {
    const past = i - offset;
    flowSum += (past < 0 ? market.opening[STEPS + past] : market.events[past]).side;
  }
  return { step: i, reference: e.ref, rivalBid: e.rivalBid, rivalAsk: e.rivalAsk,
    inventory: state.inventory, pnl: state.pnl, flow: flowSum / 6, remaining: STEPS - i };
}
export function ruleQuote(rule, obs) {
  // floor(x + .5) is also the rounding rule in the exported Python callback.
  return normalizeQuote({ half: rule.half, size: rule.size,
    tilt: rule.formula ? formulaTilt(rule, obs) : Math.floor(-rule.risk * obs.inventory / 100 + rule.flow * obs.flow + 0.5) });
}
export function prices(ref, quote, inventory = 0) {
  return { bid: ref + quote.tilt - quote.half, ask: ref + quote.tilt + quote.half,
    bidSize: Math.min(quote.size, LIMIT - inventory), askSize: Math.min(quote.size, LIMIT + inventory) };
}

// Best eligible price first. The rival can fill the entire order. Split an order if our size runs out.
export function match(e, book) {
  const buys = e.side === 1;
  const ours = buys ? book.ask : book.bid, rival = buys ? e.rivalAsk : e.rivalBid;
  const capacity = buys ? book.askSize : book.bidSize;
  const eligible = p => buys ? p <= e.limit : p >= e.limit;
  const best = buys ? ours < rival : ours > rival;
  const ourTurn = eligible(ours) && (!eligible(rival) || best || (ours === rival && e.deskFirst));
  const deskQty = ourTurn ? Math.min(e.qty, capacity) : 0;
  const rivalQty = eligible(rival) ? e.qty - deskQty : 0;
  return { deskQty, rivalQty, deskPx: ours, rivalPx: rival, unfilled: e.qty - deskQty - rivalQty };
}
export function markState(state, e, fill, final) {
  const signedShares = -e.side * fill.deskQty;
  const inventory = state.inventory + signedShares;
  const fee = FEE * fill.deskQty;
  const cash = state.cash - signedShares * fill.deskPx - fee;
  const mark = final ? e.fair : e.next;
  const pnl = cash + inventory * mark;
  const peakPnl = Math.max(state.peakPnl, pnl);
  return { inventory, cash, fees: state.fees + fee, pnl, peakPnl, drawdown: Math.max(state.drawdown, peakPnl - pnl),
    maxInventory: Math.max(state.maxInventory, Math.abs(inventory)), steps: state.steps + 1,
    filled: state.filled + fill.deskQty, offered: state.offered + e.qty,
    fillOrders: state.fillOrders + Number(fill.deskQty > 0) };
}
export function advance(market, state, action) {
  if (state.steps >= STEPS) throw new RangeError('Round is closed');
  const i = state.steps, e = market.events[i];
  const quote = action.mode === 'rule' ? ruleQuote(action.rule, observation(market, state, i)) : normalizeQuote(action.quote);
  const book = prices(e.ref, quote, state.inventory);
  const fill = match(e, book);
  const after = markState(state, e, fill, i === STEPS - 1);
  return { i, book, quote, fill, before: state, after };
}
export function runRound(market, actions) {
  if (actions.length > STEPS) throw new RangeError('Too many orders');
  const logs = [];
  let state = startState();
  for (const action of actions) {
    const row = advance(market, state, action);
    logs.push(row);
    state = row.after;
  }
  return { logs, state };
}
// Change only the selected action; after it, replay the originally posted instructions.
// Any later inventory-aware rule is evaluated against the new inventory.
export function fork(market, actions, index, alternative) {
  if (!Number.isInteger(index) || index < 0 || index >= actions.length) throw new RangeError('Choose a completed order');
  const changed = actions.slice();
  changed[index] = { mode: 'manual', quote: normalizeQuote(alternative) };
  return runRound(market, changed);
}
export function openingFill(e) {
  return match(e, { bid: e.ref, ask: e.ref, bidSize: 0, askSize: 0 });
}
export function nextSeed(seed, index) {
  return (seed + Math.imul(index, 0x9e3779b1)) >>> 0;
}
export function evaluateRule(market, rule) {
  let state = startState();
  const action = { mode: 'rule', rule };
  for (let i = 0; i < STEPS; i++) state = advance(market, state, action).after;
  return state;
}
export function accumulator() {
  return { count: 0, sum: 0, worst: Infinity, highRisk: 0, maxDrawdown: 0, wins: 0, filled: 0, offered: 0, outcomes: [] };
}
export function addResult(acc, s) {
  acc.count++;
  acc.sum += s.pnl;
  acc.worst = Math.min(acc.worst, s.pnl);
  acc.highRisk += Number(s.maxInventory >= WARNING_POSITION);
  acc.maxDrawdown = Math.max(acc.maxDrawdown, s.drawdown);
  acc.wins += Number(s.pnl > 0);
  acc.filled += s.filled;
  acc.offered += s.offered;
  acc.outcomes.push(s.pnl);
}
export function summarize(acc) {
  if (!acc.count) throw new RangeError('At least one round is required');
  const sorted = acc.outcomes.slice().sort((a,b) => a-b), mid = Math.floor(sorted.length / 2);
  return { mean: acc.sum / acc.count, worst: acc.worst, extreme: acc.highRisk / acc.count,
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2,
    drawdown: acc.maxDrawdown, winRate: acc.wins / acc.count, fillRate: acc.offered ? acc.filled / acc.offered : 0 };
}
