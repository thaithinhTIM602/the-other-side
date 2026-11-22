import { STEPS, makeMarket, runRound, fork, STRATEGIES } from './engine.mjs';
import { $, price, num, money, time, tone, fillText, sideLabel, venue, integerInput } from './view.mjs';

const sample = { seed:93817, actions:Array.from({length:STEPS},()=>({mode:'rule',rule:STRATEGIES[1].rule})) };
const motives={fund:'A fund splitting a large order',informed:'A trader with a private clue',liquidity:'A customer who needs to trade'};
export function replayRoom(getHistory) {
  let recording, market, original, selected=0, sourceKey, history=[];
  function options(){
    history=getHistory();
    const select=$('replay-source'), old=select.value;
    select.replaceChildren();
    history.forEach((rec,i)=>select.add(new Option((i===0?'Latest':'Round')+' · Seed '+rec.seed,rec.id)));
    select.add(new Option('Sample round · Seed '+sample.seed,'sample'));
    if(old && [...select.options].some(o=>o.value===old)) select.value=old;
  }
  function inspect(index) {
    selected=Math.min(STEPS-1,Math.max(0,index));const i=selected,e=market.events[i],l=original.logs[i];
    $('event-name').textContent=time(i)+' · Order '+(i+1);
    $('motive-name').textContent=motives[e.type];
    const limit=e.side===1?'pay up to ':'accept at least ';
    const reason=e.type==='fund'?'This order was one piece of a larger position change. More orders from this fund could arrive on the same side.':
      e.type==='informed'?'Their noisy private estimate was '+price(e.clue)+'. They required at least a cent of potential advantage.':
      'This customer needed to trade for an unrelated cash or share need. Their limit came from the public reference plus a tolerance for a worse price.';
    $('motive-detail').textContent=reason+' They wanted to '+sideLabel(e.side).toLowerCase()+' '+num(e.qty)+' shares and would '+limit+price(e.limit)+'.';
    const facts=[
      ['Public reference before order',price(e.ref)],['Private underlying value',price(e.fair)],
      ['Your bid / ask',price(l.book.bid)+' / '+price(l.book.ask)],['Rival bid / ask',price(e.rivalBid)+' / '+price(e.rivalAsk)],
      ['Your execution',fillText(l.fill)],['Rival execution',l.fill.rivalQty?num(l.fill.rivalQty)+' @ '+price(l.fill.rivalPx):'0 shares'],
      ['Unfilled shares',num(l.fill.unfilled)],['Inventory after order',num(l.after.inventory)+' shares']
    ];
    $('replay-facts').innerHTML=facts.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('');
    $('scrub').value=i+1;
    $('prev-order').disabled=i===0;$('next-order').disabled=i===STEPS-1;
    $('alt-half').value=l.quote.half;$('alt-tilt').value=l.quote.tilt;$('alt-size').value=l.quote.size;
    $('fork-output').innerHTML='<p>Original closing P&amp;L <b class="'+tone(original.state.pnl)+'">'+money(original.state.pnl)+'</b></p>';
    document.querySelectorAll('#ledger tr').forEach((tr,n)=>tr.classList.toggle('selected',n===i));
  }
  function selectSource(id, force=false){
    if(!force && id===sourceKey) return;
    sourceKey=id;recording=id==='sample'?sample:history.find(r=>r.id===id)||sample;
    market=makeMarket(recording.seed);original=runRound(market,recording.actions);
    $('replay-tag').textContent=id==='sample'?'Sample round':'Completed round';
    $('ledger').innerHTML=original.logs.map((l,i)=>{
      const e=market.events[i];
      return '<tr><td><button class="ledger-link" data-event="'+i+'">'+time(i)+'</button></td><td><span class="side '+(e.side===1?'buy':'sell')+'">'+sideLabel(e.side)+'</span></td><td class="num">'+num(e.qty)+'</td><td class="num">'+fillText(l.fill)+'</td><td class="num">'+num(l.after.inventory)+'</td><td class="num '+tone(l.after.pnl)+'">'+money(l.after.pnl)+'</td></tr>';
    }).join('');
    const interesting=original.logs.findIndex((r,i)=>market.events[i].type==='informed'&&r.fill.deskQty>0 && i>=4);
    inspect(interesting<0?0:interesting);
  }
  function open(requestedId){
    options();
    if(requestedId && [...$('replay-source').options].some(o=>o.value===requestedId)) $('replay-source').value=requestedId;
    selectSource($('replay-source').value);
  }
  function compare() {
    const half=integerInput($('alt-half')),tilt=integerInput($('alt-tilt')),size=integerInput($('alt-size'));
    if([half,tilt,size].includes(null)) return;
    const alternative=fork(market,recording.actions,selected,{half,tilt,size});
    const alt=alternative.logs[selected],base=original.logs[selected],delta=alternative.state.pnl-original.state.pnl;
    const rows=[['Your original fill',fillText(base.fill)],['Your alternative fill',fillText(alt.fill)],
      ['Original closing P&L',money(original.state.pnl)],['Alternative closing P&L',money(alternative.state.pnl)]];
    const routed=venue(base.fill)===venue(alt.fill)?'Execution venue: '+venue(alt.fill)+'.':'Execution moved from '+venue(base.fill).toLowerCase()+' to '+venue(alt.fill).toLowerCase()+'.';
    $('fork-output').innerHTML='<h3>Change in closing profit</h3><b class="delta '+tone(delta)+'">'+money(delta)+'</b><p>'+routed+' The alternative bid was '+price(alt.book.bid)+' and the ask was '+price(alt.book.ask)+'.</p>'+rows.map(([k,v])=>'<div class="comparison-row"><span>'+k+'</span><b class="num">'+v+'</b></div>').join('');
  }
  $('replay-source').addEventListener('change',()=>selectSource($('replay-source').value));
  $('scrub').addEventListener('input',()=>inspect(Number($('scrub').value)-1));
  $('ledger').addEventListener('click',evt=>{const btn=evt.target.closest('[data-event]');if(btn)inspect(Number(btn.dataset.event));});
  return { open, compare, move:delta=>inspect(selected+delta) };
}
