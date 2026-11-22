import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {STEPS, LIMIT, FEE, DEFAULT_QUOTE, DEFAULT_RULE, makeMarket, nextSeed, prices, match, startState,
  markState, observation, runRound, fork, evaluateRule, advance, normalizeQuote, normalizeRule, accumulator, addResult, summarize} from '../dist/engine.mjs';
import {BASE_FORMULA,compileFormula,pythonSource} from '../dist/formula.mjs';

const base={i:0,side:1,qty:150,limit:10012,ref:10000,next:10000,fair:10000,rivalAsk:10007,rivalBid:9993,deskFirst:false};
const book={bid:9996,ask:10004,bidSize:100,askSize:100};
const manual=quote=>({mode:'manual',quote});
const guard={mode:'rule',rule:DEFAULT_RULE};
test('the same seed reproduces all orders; distinct seeds give different tapes',()=>{
  assert.deepEqual(makeMarket(4),makeMarket(4));assert.notDeepEqual(makeMarket(4),makeMarket(5));
  const m=makeMarket(0xffffffff);assert.equal(m.events.length,STEPS);assert.equal(m.opening.length,STEPS);
  assert.equal(new Set(Array.from({length:1000},(_,i)=>nextSeed(0xffffffff,i))).size,1000);
});
test('best eligible ask fills first, and the rival picks up excess demand',()=>{
  const f=match(base,book);
  assert.deepEqual([f.deskQty,f.rivalQty,f.unfilled],[100,50,0]);
  assert.deepEqual([f.deskPx,f.rivalPx],[10004,10007]);
  assert.equal(match({...base,rivalAsk:10002},book).deskQty,0);
});
test('best eligible bid wins a sell order',()=>{
  const e={...base,side:-1,limit:9990,rivalBid:9995};assert.equal(match(e,book).deskQty,100);
  assert.equal(match({...e,rivalBid:9998},book).deskQty,0);
});
test('customer limits prevent a fill, and can leave a partial order unfilled',()=>{
  const none=match({...base,limit:10003},book);assert.equal(none.unfilled,150);
  const some=match({...base,limit:10005},book);assert.deepEqual([some.deskQty,some.rivalQty,some.unfilled],[100,0,50]);
  assert.equal(match({...base,side:-1,limit:9998},book).unfilled,150);
});
test('price ties follow the event tie break, including a full side at a risk limit',()=>{
  assert.equal(match({...base,rivalAsk:10004},book).deskQty,0);
  assert.equal(match({...base,rivalAsk:10004,deskFirst:true},book).deskQty,100);
  const f=match({...base,rivalAsk:10004,deskFirst:true},{...book,askSize:0});
  assert.equal(f.rivalQty,150);
});
test('size is capped on the correct side of the position limit',()=>{
  assert.equal(prices(10000,DEFAULT_QUOTE,975).bidSize,25);
  assert.equal(prices(10000,DEFAULT_QUOTE,-975).askSize,25);
  assert.equal(prices(10000,DEFAULT_QUOTE,LIMIT).bidSize,0);
  assert.equal(prices(10000,DEFAULT_QUOTE,-LIMIT).askSize,0);
});
test('100 shares bought at 99.95 and sold at 100.05 earn exactly $8 after fees',()=>{
  const buy=markState(startState(),{...base,side:-1},{deskQty:100,deskPx:9995},false);
  assert.equal(buy.inventory,100);assert.equal(buy.pnl,400);assert.equal(buy.cash,-999600);
  const sell=markState(buy,base,{deskQty:100,deskPx:10005},false);
  assert.equal(sell.inventory,0);assert.equal(sell.fees,200);assert.equal(sell.pnl,800);
});
test('short inventory gains on a lower close and uses the revealed underlying value',()=>{
  const sold=markState(startState(),{...base,next:10010,fair:9990},{deskQty:100,deskPx:10005},true);
  assert.equal(sold.inventory,-100);assert.equal(sold.pnl,1400);
});
test('quoting rules only receive the pre-arrival public observation',()=>{
  const market=makeMarket(42),s=startState(),obs=observation(market,s,0);
  assert.deepEqual(Object.keys(obs).sort(),['step','reference','rivalBid','rivalAsk','inventory','pnl','flow','remaining'].sort());
  const e=market.events[0];Object.assign(e,{side:-e.side,qty:10000,clue:0,fair:0,limit:0,next:0,type:'fund',deskFirst:!e.deskFirst});
  assert.deepEqual(observation(market,s,0),obs);
});
test('unmodified and changed quotes replay against the same orders and future instructions',()=>{
  const market=makeMarket(41726), actions=Array.from({length:STEPS},()=>guard);
  const original=runRound(market,actions);
  const index=original.logs.findIndex(row=>row.fill.deskQty>0);
  const same=fork(market,actions,index,original.logs[index].quote);
  assert.deepEqual(original,same);
  const other=fork(market,actions,index,{half:20,tilt:0,size:1});
  assert.deepEqual(other.logs.slice(0,index),original.logs.slice(0,index));
  assert.notEqual(other.logs[index].fill.deskQty,original.logs[index].fill.deskQty);
  assert.equal(other.logs[index+1].before.inventory,other.logs[index].after.inventory);
  assert.deepEqual(original,runRound(market,actions));assert.throws(()=>fork(market,actions,STEPS,DEFAULT_QUOTE));
});
test('conservation, marked P&L, capacity, fees and drawdown hold across 1,000 complete rounds',()=>{
  for(let j=0;j<1000;j++){
    const market=makeMarket(nextSeed(99,j));let s=startState();
    for(let i=0;i<STEPS;i++){
      const row=advance(market,s,manual({half:1+j%12,tilt:(i*7)%41-20,size:25+((i+j)*37)%476}));
      const e=market.events[i],f=row.fill,a=row.after;
      assert.equal(f.deskQty+f.rivalQty+f.unfilled,e.qty);
      assert.ok(f.deskQty>=0&&f.rivalQty>=0&&f.unfilled>=0);
      assert.ok(Math.abs(a.inventory)<=LIMIT);assert.equal(a.inventory,s.inventory-e.side*f.deskQty);
      assert.equal(a.cash-s.cash,f.deskQty ? (e.side*f.deskPx-FEE)*f.deskQty : 0);
      assert.equal(a.pnl,a.cash+a.inventory*(i===STEPS-1?e.fair:e.next));
      assert.ok(a.drawdown>=s.drawdown);if(f.deskQty)assert.ok(e.side===1?f.deskPx<=e.limit:f.deskPx>=e.limit);
      assert.equal(a.fees,a.filled*FEE);s=a;
    }
    assert.throws(()=>advance(market,s,guard),RangeError);
  }
});
test('formula syntax has Python precedence, conditionals and no access to arbitrary code',()=>{
  assert.equal(compileFormula('1 + 4 * 2')({}),9);
  assert.equal(compileFormula('-3 if inventory > 100 else max(0, abs(-2))')({inventory:0}),2);
  assert.equal(compileFormula('2 if 3 != 4 else 5')({}),2);
  for(const src of ['.','inventory.__proto__','constructor(1)','10 ** 6','01','min(1)','1; 3','this','[2]','1 < 2 < 3']){
    assert.throws(()=>compileFormula(src),Error,src);
  }
  assert.deepEqual(normalizeQuote({half:0,tilt:-50,size:1200}),{half:1,tilt:-20,size:500});
});
test('the base expression matches the built in rule, and zero divisors quote neutrally',()=>{
  const m=makeMarket(41726);
  assert.deepEqual(evaluateRule(m,DEFAULT_RULE),evaluateRule(m,normalizeRule({...DEFAULT_RULE,formula:BASE_FORMULA})));
  const q=advance(m,startState(),{mode:'rule',rule:{...DEFAULT_RULE,formula:'1 / inventory'}}).quote;
  assert.equal(q.tilt,0);
});
test('zero profit, the median, worst session and risk threshold are accounted for',()=>{
  const acc=accumulator();for(const pnl of [100,0,-100,300])addResult(acc,{...startState(),pnl,maxInventory:pnl===0?800:0});
  const summary=summarize(acc);assert.equal(summary.mean,75);assert.equal(summary.median,50);
  assert.equal(summary.worst,-100);assert.equal(summary.extreme,.25);assert.equal(summary.winRate,.5);assert.equal(summary.fillRate,0);
});
test('browser and native Python return identical statistics for a custom price formula',()=>{
  const custom=normalizeRule({...DEFAULT_RULE,risk:3,formula:'-8 if inventory > 250 else min(4, flow_weight * flow - inventory / 125)'});
  const root=mkdtempSync(path.join(tmpdir(),'other-side-test-'));
  try{
    const file=path.join(root,'callback.py');writeFileSync(file,pythonSource(custom));
    const result=spawnSync('python3',['research/tournament.py',file,'--rounds','10','--seed','77','--json'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const totals=accumulator();for(let i=0;i<10;i++)addResult(totals,evaluateRule(makeMarket(nextSeed(77,i)),custom));
    const row=JSON.parse(result.stdout).rows.at(-1);delete row.name;
    assert.deepEqual(row,summarize(totals));
    assert.equal(readFileSync('research/example_strategy.py','utf8'),pythonSource(DEFAULT_RULE));
  }finally{rmSync(root,{recursive:true,force:true});}
});
