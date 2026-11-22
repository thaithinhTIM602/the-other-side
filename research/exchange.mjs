// The Python harness exchanges one public observation and one quote per order.
// Pricing and accounting are imported from the browser's exchange.
import { createInterface } from 'node:readline';
import { STEPS, STRATEGIES, nextSeed, makeMarket, observation, advance, startState, evaluateRule, accumulator, addResult, summarize } from '../dist/engine.mjs';

const [rounds,seed]=process.argv.slice(2).map(Number);
if (!Number.isInteger(rounds)||rounds<1||rounds>10000||!Number.isInteger(seed)||seed<0||seed>0xffffffff) {
  throw new Error('Expected a round count from 1 to 10,000 and an unsigned 32 bit seed.');
}
const input=createInterface({input:process.stdin,terminal:false});
const replies=input[Symbol.asyncIterator]();
const send=msg=>process.stdout.write(JSON.stringify(msg)+'\n');
const totals=[...STRATEGIES.map(accumulator),accumulator()];
try{
  for(let index=0;index<rounds;index++){
    const market=makeMarket(nextSeed(seed,index));
    let state=startState();
    send({type:'start'});
    for(let i=0;i<STEPS;i++){
      send({type:'quote',observation:observation(market,state,i)});
      const response=await replies.next();
      if(response.done) throw new Error('The Python strategy disconnected.');
      const q=JSON.parse(response.value);
      state=advance(market,state,{mode:'manual',quote:q}).after;
    }
    addResult(totals[3],state);
    STRATEGIES.forEach((s,i)=>addResult(totals[i],evaluateRule(market,s.rule)));
  }
  const names=[...STRATEGIES.map(s=>s.name),'Your rule'];
  send({type:'results',rounds,seed,rows:totals.map((a,i)=>({name:names[i],...summarize(a)}))});
}finally{input.close();}
