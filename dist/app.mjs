import { STEPS, STEP_SECONDS, DEFAULT_SEED, DEFAULT_QUOTE, DEFAULT_RULE, LIMIT, makeMarket, runRound, advance,
  startState, normalizeAction, normalizeQuote, normalizeRule, observation, ruleQuote, prices, openingFill, clamp } from './engine.mjs';
import { $, num, price, money, pct, time, tone, sideLabel, venue, icon, integerInput, announce } from './view.mjs';
import { marketChart } from './chart.mjs';
import { replayRoom } from './replay.mjs';
import { strategyLab } from './lab.mjs';

const KEY='the-other-side.session.v1';
function validSeed(n){return Number.isInteger(n)&&n>=0&&n<=0xffffffff;}
function readRecording(rec, closed=false){
  if(!rec || !validSeed(rec.seed) || !Array.isArray(rec.actions) || rec.actions.length>STEPS || (closed && rec.actions.length!==STEPS))return null;
  return {seed:rec.seed,id:typeof rec.id==='string'?rec.id.slice(0,60):'round-'+rec.seed,
    actions:rec.actions.map(normalizeAction)};
}
function load() {
  try{
    const s=JSON.parse(localStorage.getItem(KEY));if(!s)return {};
    return {round:readRecording(s.round),history:(Array.isArray(s.history)?s.history:[]).slice(0,5).map(x=>readRecording(x,true)).filter(Boolean),
      manual:normalizeQuote(s.manual),rule:normalizeRule(s.rule),mode:s.mode==='rule'?'rule':'manual',speed:[1,4,20].includes(s.speed)?s.speed:1};
  }catch{return {};}
}
const memory=load();
function roundId(){return crypto.randomUUID?.()||'round-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
let round=memory.round||{seed:DEFAULT_SEED,id:roundId(),actions:[]}, history=memory.history||[];
let market=makeMarket(round.seed),{logs,state}=runRound(market,round.actions);
let manual=memory.manual||{...DEFAULT_QUOTE},rule=memory.rule||{...DEFAULT_RULE},mode=memory.mode||'manual',speed=memory.speed||1;
let windowSize=60,showFills=true,filter='all',timer=null,view='desk',opening=[],lastPosted=false;
let storageWarning=false;
function save(){
  try{localStorage.setItem(KEY,JSON.stringify({round,history,manual,rule,mode,speed}));}
  catch{if(!storageWarning){storageWarning=true;announce('Browser storage is unavailable. This round lasts until the page closes.');}}
}
const isClosed=()=>state.steps===STEPS;
function publicReference(){return isClosed()?market.events.at(-1).fair:market.events[state.steps].ref;}
function activeAction(){return mode==='rule'?{mode:'rule',rule:{...rule}}:{mode:'manual',quote:{...manual}};}
function liveQuote(){
  if(isClosed())return logs.at(-1).quote;
  return mode==='rule'?ruleQuote(rule,observation(market,state,state.steps)):manual;
}
function chartData(){
  const tape=logs.map((l,i)=>({i,ref:i===STEPS-1?market.events[i].fair:market.events[i].next,
    volume:l.fill.deskQty+l.fill.rivalQty,side:market.events[i].side,fill:l.fill.deskQty}));
  return [...opening,...tape].slice(-windowSize);
}
function updateOpening(){
  opening=market.opening.map(e=>({i:e.i,ref:e.next,volume:openingFill(e).rivalQty,side:e.side,fill:0}));
}
document.querySelectorAll('i[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const draw=marketChart();
const replay=replayRoom(()=>history);
const lab=strategyLab(()=>rule,r=>{rule=normalizeRule(r);save();});
updateOpening();

function buttons(selector,dataset,value){
  document.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[dataset])===String(value)?'true':'false'));
}
function renderTape(){
  const pre=market.opening.map(e=>({e,fill:openingFill(e)}));
  const live=logs.map((l,i)=>({e:market.events[i],fill:l.fill}));
  const recent=[...pre,...live].reverse().filter(row=>filter!=='mine'||row.fill.deskQty>0).slice(0,7);
  $('tape').innerHTML=recent.length?recent.map(({e,fill:f})=>{
    const qty=filter==='mine'?f.deskQty:f.deskQty+f.rivalQty;
    const avg=filter==='mine'?f.deskPx:qty?(f.deskQty*f.deskPx+f.rivalQty*f.rivalPx)/qty:0;
    return '<tr><td class="time">'+time(e.i)+'</td><td><span class="side '+(e.side===1?'buy':'sell')+'">'+sideLabel(e.side)+'</span></td><td class="num">'+num(qty)+'</td><td class="num">'+(qty?price(avg):'—')+'</td><td class="dealer '+(f.deskQty?'mine':'')+'">'+(filter==='mine'?'Your desk':venue(f))+'</td></tr>';
  }).join(''):'<tr><td class="empty" colspan="5">Your fills will appear here when a customer trades with your desk.</td></tr>';
}
function validDraft(){
  const half=Number($('half').value),tilt=Number($('tilt').value),size=Number($('size').value);
  if(!$('half').value.trim()||!$('tilt').value.trim()||!Number.isInteger(half)||!Number.isInteger(tilt)||half<1||half>20||tilt<-20||tilt>20)return null;
  return {half,tilt,size};
}
function setFields(){
  $('half').value=manual.half;$('tilt').value=manual.tilt;
  if(![...$('size').options].some(o=>Number(o.value)===manual.size))$('size').add(new Option(String(manual.size),String(manual.size)));
  $('size').value=manual.size;$('desk-mode').value=mode;
}
function ticket(){
  const closed=isClosed(),draft=validDraft(),active=liveQuote();
  const changed=!closed && mode==='manual' && draft && (draft.half!==manual.half||draft.tilt!==manual.tilt||draft.size!==manual.size);
  const q=changed?draft:active, book=closed?logs.at(-1).book:prices(publicReference(),q,state.inventory);
  const rival=market.events[closed?STEPS-1:state.steps];
  $('rival-quote').textContent=price(rival.rivalBid)+' / '+price(rival.rivalAsk);
  $('bid').textContent=price(book.bid);$('ask').textContent=price(book.ask);
  $('bid-size').textContent=num(book.bidSize)+' shares';$('ask-size').textContent=num(book.askSize)+' shares';
  $('desk-mode').value=mode;$('desk-mode').disabled=closed;$('manual-fields').hidden=mode!=='manual';$('auto-fields').hidden=mode!=='rule';
  for(const e of document.querySelectorAll('#manual-fields button,#manual-fields input,#manual-fields select'))e.disabled=closed;
  $('ticket-note').textContent=closed?'Last quote before the closing valuation.':changed?'Preview only. Post to activate these prices.':mode==='rule'?'Lab rule active on the next order.':lastPosted?'Posted. Your settings follow the reference price.':'Quotes follow the reference price.';
  $('spread').textContent=price(active.half*2);
}
function renderDesk(){
  if(view!=='desk')return;
  const closed=isClosed(),ref=publicReference(),openRef=market.events[0].ref;
  $('pnl').textContent=money(state.pnl);$('pnl').className=tone(state.pnl);
  $('inventory').textContent=num(state.inventory);
  $('inv-cap').textContent=Math.abs(state.inventory)>=800?'Near the ±1,000 share limit':'Position limit ±'+num(LIMIT);
  $('inv-cap').className=Math.abs(state.inventory)>=800?'negative':'';
  $('fill-rate').textContent=pct(state.offered?state.filled/state.offered:0);
  $('filled-detail').textContent=num(state.filled)+' of '+num(state.offered)+' shares captured';
  $('reference').textContent=price(ref);
  // Before the opening bell, show change over the displayed opening tape.
  const prior=state.steps?openRef:market.opening.at(-windowSize).ref;
  const move=ref-prior;
  $('ref-change').textContent=money(move)+' ('+(move>0?'+':'')+(100*move/prior).toFixed(2)+'%)';
  $('ref-change').className='change '+tone(move);$('ref-change').title=state.steps?'Change since desk opened':'Change across the visible opening window';
  const sec=(STEPS-state.steps)*STEP_SECONDS;$('clock').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  $('round-status').textContent=closed?'Round complete':timer?'Round running':state.steps?'Round paused':'Ready to open';
  $('market-status').textContent=closed?'Closing value':state.steps||timer?'Session tape':'Opening tape';
  const btn=$('play-btn');btn.innerHTML='<i data-icon="">'+icon(closed?'replay':timer?'pause':'play')+'</i><span>'+(closed?'Review round':timer?'Pause round':state.steps?'Resume round':'Start round')+'</span>';
  $('round-progress').style.width=(state.steps/STEPS*100)+'%';$('step-count').textContent=state.steps+' / '+STEPS;
  $('desk-seed').textContent='Seed '+round.seed;$('step-btn').disabled=closed;$('close-btn').disabled=closed;
  $('fills-toggle').setAttribute('aria-pressed',String(showFills));
  buttons('[data-window]','window',windowSize);buttons('[data-speed]','speed',speed);buttons('[data-filter]','filter',filter);
  ticket();renderTape();draw(chartData(),showFills);
}
function pause(){if(timer!==null)clearInterval(timer);timer=null;}
function consume(){
  if(isClosed())return;
  const a=activeAction(), row=advance(market,state,a);
  round.actions.push(a);logs.push(row);state=row.after;
}
function completed(){
  pause();history=[{id:round.id,seed:round.seed,actions:round.actions.slice()},...history.filter(r=>r.id!==round.id)].slice(0,5);
  announce('Round complete. Review the traders and their motives in the replay room.');
}
function tick(){consume();if(isClosed())completed();save();renderDesk();}
function schedule(){pause();timer=setInterval(tick,STEP_SECONDS*1000/speed);}
let requestedReplay=null;
function showPage(){
  const dest=location.hash.slice(1),next=['desk','replay','lab'].includes(dest)?dest:'desk';
  if(next!=='desk')pause();view=next;
  for(const tab of ['desk','replay','lab']){
    $(tab+'-page').hidden=tab!==view;
    const link=document.querySelector('[data-tab="'+tab+'"]');
    if(tab===view)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  document.title='The Other Side | '+({desk:'Trading desk',replay:'Replay room',lab:'Strategy lab'}[view]);
  if(view==='desk')renderDesk();
  if(view==='replay'){replay.open(requestedReplay);requestedReplay=null;}
}
function openDialog(id){pause();renderDesk();$(id).showModal();}
function post(){
  const half=integerInput($('half')),tilt=integerInput($('tilt'));if(half===null||tilt===null||isClosed())return;
  manual=normalizeQuote({half,tilt,size:Number($('size').value)});lastPosted=true;save();renderDesk();announce('Quote posted for the next order.');
}
function handleClick(evt){
  const b=evt.target.closest('button');if(!b || b.disabled)return;
  if(b.dataset.dismiss){$(b.dataset.dismiss).close();return;}
  if(b.dataset.window){windowSize=Number(b.dataset.window);renderDesk();return;}
  if(b.dataset.speed){speed=Number(b.dataset.speed);if(timer)schedule();save();renderDesk();return;}
  if(b.dataset.filter){filter=b.dataset.filter;renderDesk();return;}
  if(b.dataset.step){const el=$(b.dataset.step);el.value=clamp(Number(el.value)+Number(b.dataset.delta),Number(el.min),Number(el.max));ticket();return;}
  switch(b.dataset.cmd){
    case 'guide':openDialog('guide');break;
    case 'play':
      if(isClosed()){requestedReplay=round.id;location.hash='replay';}
      else{if(timer)pause();else schedule();renderDesk();}break;
    case 'step':pause();tick();break;
    case 'close':pause();while(!isClosed())consume();completed();save();renderDesk();break;
    case 'new':
      $('new-note').textContent=state.steps&&!isClosed()?'Opening a new desk will replace this unfinished round. Completed rounds are kept in the replay room.':'Choose a seed to repeat a market, or use the new seed below.';
      $('new-seed').value=crypto.getRandomValues(new Uint32Array(1))[0];openDialog('new-dialog');break;
    case 'post':post();break;
    case 'fills':showFills=!showFills;renderDesk();break;
    case 'prev':replay.move(-1);break;
    case 'next':replay.move(1);break;
    case 'fork':replay.compare();break;
    case 'save-formula':if(lab.applySettings()){$('formula-status').textContent='Formula applied.';announce('Price shift formula applied.');}break;
    case 'python':lab.download();break;
    case 'cancel-tournament':lab.cancel();break;
    case 'use-rule':
      if(!lab.applySettings())break;
      if(isClosed()){announce('Open a new round to use your rule.');location.hash='desk';$('new-seed').value=crypto.getRandomValues(new Uint32Array(1))[0];$('new-note').textContent='Your lab rule will be active when you open this round.';pendingRule=true;openDialog('new-dialog');}
      else{mode='rule';save();setFields();location.hash='desk';announce('Your lab rule is active.');}break;
  }
}
let pendingRule=false;
$('new-dialog').addEventListener('close',()=>{pendingRule=false;});
$('new-form').addEventListener('submit',evt=>{
  evt.preventDefault();const seed=integerInput($('new-seed'));if(seed===null)return;pause();
  round={seed,id:roundId(),actions:[]};market=makeMarket(seed);logs=[];state=startState();lastPosted=false;
  manual={...DEFAULT_QUOTE};mode=pendingRule?'rule':'manual';pendingRule=false;filter='all';updateOpening();setFields();save();$('new-dialog').close();renderDesk();announce('New desk ready.');
});
$('desk-mode').addEventListener('change',()=>{if(isClosed())return;mode=$('desk-mode').value;save();renderDesk();});
['half','tilt','size'].forEach(id=>$(id).addEventListener('input',ticket));
document.addEventListener('click',handleClick);
window.addEventListener('hashchange',()=>{showPage();window.scrollTo(0,0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden && timer){pause();save();renderDesk();}});
window.addEventListener('pagehide',()=>{pause();save();});
setFields();showPage();
