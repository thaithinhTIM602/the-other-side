import { BASE_FORMULA, compileFormula, pythonSource } from './formula.mjs';
import { $, num, money, price, pct, tone, integerInput } from './view.mjs';
const fields=[
  ['half','Half spread (¢)','Distance from your quote center to each side.',1,20],
  ['risk','Inventory weight','Cents to lower both prices per 100 shares held.',0,8],
  ['flow','Flow weight','Cents to shift when all six recent customers bought.',-8,8],
  ['size','Shares per side','Maximum shares offered to each customer.',1,500]
];
export function strategyLab(getRule,setRule) {
  let worker=null, resultSignature='', doneText='', progress=0;
  $('lab-fields').innerHTML=fields.map(([id,label,desc,min,max])=>'<div class="lab-field"><div class="field-row"><label for="rule-'+id+'">'+label+'</label><input type="number" id="rule-'+id+'" min="'+min+'" max="'+max+'" step="1" required></div><small>'+desc+'</small></div>').join('');
  const signature=()=>JSON.stringify([getRule(),Number($('tournament-rounds').value),Number($('tournament-seed').value)]);
  function status(){
    if(worker){$('tournament-status').textContent='Tournament running · '+Math.round(progress*100)+'%';return;}
    $('tournament-status').textContent=resultSignature ? (signature()===resultSignature?doneText:doneText+' Settings changed. Run again for updated results.') : '';
  }
  function reflect(){
    const r=getRule();fields.forEach(([key])=>$('rule-'+key).value=r[key]);
    $('formula').value=r.formula||BASE_FORMULA;
    $('rule-python').textContent=pythonSource(r);
    status();
  }
  function readFields(){
    const r={...getRule()};
    for(const [key] of fields){
      const value=integerInput($('rule-'+key));
      if(value===null)return null;
      r[key]=value;
    }
    return r;
  }
  function applySettings(){
    const r=readFields();if(!r)return false;
    const text=$('formula').value.trim();
    try {
      compileFormula(text);
      if(text===BASE_FORMULA)delete r.formula;else r.formula=text;
    }catch(e){$('formula-status').textContent=e.message;$('formula').closest('details').open=true;$('formula').focus();return false;}
    $('formula-status').textContent='';
    setRule(r);reflect();return true;
  }
  for(const [key] of fields) $('rule-'+key).addEventListener('change',()=>{
    const r=readFields();if(r){setRule(r);$('rule-python').textContent=pythonSource(r);status();}
  });
  $('tournament-rounds').addEventListener('change',status);$('tournament-seed').addEventListener('input',status);
  function show(data){
    const ranked=data.rows.slice().sort((a,b)=>b.mean-a.mean);
    const rows=ranked.map(r=>'<tr class="'+(r.id==='custom'?'custom':'')+'"><td>'+r.name+'</td><td>'+money(r.mean)+'</td><td>'+money(r.worst)+'</td><td>'+pct(r.extreme)+'</td><td>'+pct(r.fillRate)+'</td></tr>').join('');
    const r=data.rows.find(x=>x.id==='custom'), lo=Math.min(...data.outcomes),hi=Math.max(...data.outcomes), bins=new Array(20).fill(0);
    for(const v of data.outcomes)bins[Math.min(19,Math.floor((v-lo)/Math.max(1,hi-lo)*20))]++;
    const max=Math.max(...bins);
    const bars=bins.map((count,i)=>{
      const from=lo+(hi-lo)*i/20;
      return '<span class="'+(from<0?'loss':'')+'" style="height:'+Math.round(count/max*100)+'%" title="'+money(from)+' and above: '+count+' rounds"></span>';
    }).join('');
    $('tournament-output').innerHTML='<div class="table-wrap"><table class="rank-table"><thead><tr><th>Dealer</th><th>Mean P&amp;L</th><th>Worst P&amp;L</th><th>Risk limit¹</th><th>Fill rate</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="result-foot">¹ Rounds that reached 800 shares long or short. The hard limit is 1,000.</p><div class="lab-insight"><h3>Your closing results</h3><p>Median P&amp;L <b class="'+tone(r.median)+'">'+money(r.median)+'</b> · Profitable rounds <b>'+pct(r.winRate)+'</b><br>Largest peak to trough loss <b>'+price(r.drawdown)+'</b></p><div class="histogram" role="img" aria-label="Distribution of closing profit across simulated rounds">'+bars+'</div><div class="range-ends"><span>'+money(lo)+'</span><span>'+money(hi)+'</span></div></div>';
  }
  function stop(){
    if(worker)worker.terminate();worker=null;
    $('run-tournament').disabled=false;$('cancel-tournament').hidden=true;
  }
  function fail(msg){stop();$('tournament-status').textContent=msg;}
  function run(evt){
    evt.preventDefault();
    if(worker || !applySettings())return;
    const seed=integerInput($('tournament-seed'));if(seed===null)return;
    const rounds=Number($('tournament-rounds').value);
    const runSignature=signature();
    try{worker=new Worker(new URL('./tournament.mjs',import.meta.url),{type:'module'});}
    catch{fail('The tournament worker could not start. Reload the page and try again.');return;}
    $('run-tournament').disabled=true;$('cancel-tournament').hidden=false;progress=0;status();
    worker.onmessage=({data})=>{
      if(data.error){fail(data.error);return;}
      if('progress' in data){progress=data.progress;status();return;}
      if(data.rows){stop();show(data);resultSignature=runSignature;doneText=num(rounds)+' rounds per dealer · Seed '+seed+'.';status();}
    };
    worker.onerror=()=>fail('The tournament stopped unexpectedly. Reload the page and try again.');
    worker.postMessage({seed,rounds,rule:getRule()});
  }
  function download(){
    if(!applySettings())return;
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([pythonSource(getRule())],{type:'text/x-python'}));
    link.href=url;link.download='my_strategy.py';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('tournament-form').addEventListener('submit',run);reflect();
  return { applySettings,download,cancel:()=>{stop();$('tournament-status').textContent='Tournament cancelled.';} };
}
