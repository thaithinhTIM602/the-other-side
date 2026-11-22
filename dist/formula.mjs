// Deliberately small arithmetic language shared with the downloadable Python callback.
// Parse before saving. Never execute JavaScript, access globals or allow member access.
export const BASE_FORMULA = '-risk_weight * inventory / 100 + flow_weight * flow';
const names = new Set(['risk_weight','flow_weight','inventory','flow','step','remaining','reference','rival_bid','rival_ask','profit']);
const ops = {
  '+':(a,b)=>a+b, '-':(a,b)=>a-b, '*':(a,b)=>a*b, '/':(a,b)=>{if(b===0) throw new RangeError('Zero divisor');return a/b;},
  '<':(a,b)=>Number(a<b), '>':(a,b)=>Number(a>b), '==':(a,b)=>Number(a===b), '!=':(a,b)=>Number(a!==b),
  '<=':(a,b)=>Number(a<=b), '>=':(a,b)=>Number(a>=b)
};
const compares = ['<','>','==','!=','<=','>='];
const cache = new Map();
export function compileFormula(source) {
  if(typeof source!=='string' || !source.trim() || source.length>300) throw new Error('Use a formula between 1 and 300 characters.');
  source=source.trim();
  if(cache.has(source)) return cache.get(source);
  const tokens=[];
  const pattern=/\s+|(?:\d+\.?\d*|\.\d+)|[A-Za-z_][A-Za-z_0-9]*|<=|>=|==|!=|[+*/(),<>-]/gy;
  let offset=0;
  while(offset<source.length){
    pattern.lastIndex=offset;const token=pattern.exec(source);
    if(!token) throw new Error('Unsupported character at position '+(offset+1)+'.');
    offset=pattern.lastIndex;
    if(token[0].trim()) tokens.push(token[0]);
  }
  if(tokens.length>100) throw new Error('Keep the formula under 101 tokens.');
  let pos=0;
  function requireToken(token){if(tokens[pos++]!==token) throw new Error('Expected '+token+'.');}
  function atom(){
    const t=tokens[pos++];
    if(t==='('){const node=conditional();requireToken(')');return node;}
    if(t==='-'||t==='+'){const a=atom();return t==='-'?e=>-a(e):a;}
    if(t && /^(?:0|[1-9]\d*)(?:\.\d*)?$|^\.\d+$/.test(t)){
      const value=Number(t);if(!Number.isFinite(value)||value>1e12)throw new Error('Use constants up to one trillion.');
      return ()=>value;
    }
    if(names.has(t)) return e=>e[t];
    if(['abs','min','max'].includes(t)){
      requireToken('(');const args=[conditional()];
      while(tokens[pos]===','){pos++;args.push(conditional());}
      requireToken(')');
      if(t==='abs' && args.length===1) return e=>Math.abs(args[0](e));
      if(t!=='abs' && args.length>=2) return e=>Math[t](...args.map(a=>a(e)));
      throw new Error(t==='abs'?'abs needs one number.':'min and max need at least two numbers.');
    }
    throw new Error('Expected a number or a supported variable, found '+(t||'end of formula')+'.');
  }
  function binary(base, allowed){
    let left=base();
    while(allowed.includes(tokens[pos])){
      const op=ops[tokens[pos++]],prior=left,right=base();left=e=>op(prior(e),right(e));
    }
    return left;
  }
  const product=()=>binary(atom,['*','/']);
  const sum=()=>binary(product,['+','-']);
  function comparison(){
    const a=sum();if(!compares.includes(tokens[pos])) return a;
    const op=ops[tokens[pos++]],b=sum();return e=>op(a(e),b(e));
  }
  function conditional(){
    const yes=comparison();
    if(tokens[pos]!=='if') return yes;
    pos++;const condition=comparison();requireToken('else');const no=conditional();
    return e=>condition(e)?yes(e):no(e);
  }
  const fn=conditional();
  if(pos<tokens.length) throw new Error('Unexpected token '+tokens[pos]+'.');
  if(cache.size>128)cache.clear();cache.set(source,fn);return fn;
}
export function formulaTilt(rule,obs) {
  try {
    const value=compileFormula(rule.formula)({risk_weight:rule.risk,flow_weight:rule.flow,inventory:obs.inventory,
      flow:obs.flow,step:obs.step,remaining:obs.remaining,reference:obs.reference,rival_bid:obs.rivalBid,rival_ask:obs.rivalAsk,profit:obs.pnl});
    return Number.isFinite(value)?Math.floor(value+0.5):0;
  } catch(error) {if(error instanceof RangeError) return 0;throw error;}
}
export function pythonSource(rule) {
  const source=rule.formula || BASE_FORMULA;
  compileFormula(source);
  return [
    'from math import floor, isfinite', '', '',
    'def quote(market):', '    """Return half spread and price shift in cents, and size in shares."""',
    '    risk_weight = '+rule.risk, '    flow_weight = '+rule.flow,
    '    inventory = market["inventory"]', '    flow = market["flow"]', '    step = market["step"]',
    '    remaining = market["remaining"]', '    reference = market["reference"]', '    profit = market["pnl"]',
    '    rival_bid = market["rivalBid"]', '    rival_ask = market["rivalAsk"]', '    try:',
    '        shift = ('+source+')', '        tilt = floor(shift + 0.5) if isfinite(shift) else 0',
    '    except (ZeroDivisionError, OverflowError):', '        tilt = 0',
    '    return {"half": '+rule.half+', "tilt": max(-20, min(20, tilt)), "size": '+rule.size+'}', ''
  ].join('\n');
}
