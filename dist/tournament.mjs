import { STRATEGIES, normalizeRule, nextSeed, makeMarket, evaluateRule, accumulator, addResult, summarize } from './engine.mjs';

self.onmessage = ({ data }) => {
  try {
    const { rounds, seed } = data;
    if (![100, 500, 1000].includes(rounds) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid tournament settings.');
    const entrants = [...STRATEGIES, { id: 'custom', name: 'Your rule', rule: normalizeRule(data.rule) }];
    const totals = entrants.map(accumulator);
    for (let i = 0; i < rounds; i++) {
      const market = makeMarket(nextSeed(seed, i));
      entrants.forEach((e, j) => addResult(totals[j], evaluateRule(market, e.rule)));
      if ((i + 1) % 50 === 0) self.postMessage({ progress: (i + 1) / rounds });
    }
    const rows = entrants.map((e,j) => ({ id:e.id, name:e.name, ...summarize(totals[j]) }));
    self.postMessage({ rows, outcomes: totals[3].outcomes });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
