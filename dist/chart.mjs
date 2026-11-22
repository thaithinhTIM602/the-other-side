import { $, price, num, time } from './view.mjs';
import { clamp } from './engine.mjs';

export function marketChart() {
  const canvas = $('market-chart'), tip = $('hover-tip'), ctx = canvas.getContext('2d');
  let points = [], showFills = true, hot = null;
  let coordinates = [];
  const palette = {line:'#ffa267',grid:'#33373c', muted:'#a4aab4',buy:'#78d9b7',sell:'#f29a9d'};
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !points.length || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1,3);
    const width = Math.round(w*dpr), height = Math.round(h*dpr);
    if (canvas.width!==width || canvas.height!==height) { canvas.width=width; canvas.height=height; }
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const left=6, right=w-61, top=12, bottom=h-57, volumeBottom=h-22, volumeH=24;
    const values=points.map(p=>p.ref);
    const rawMin=Math.min(...values), rawMax=Math.max(...values);
    const step=Math.max(2,Math.ceil((rawMax-rawMin+4)/4/2)*2);
    const low=Math.floor((rawMin-1)/step)*step;
    const high=Math.max(low+4*step,Math.ceil((rawMax+1)/step)*step);
    const x=i=>left+(right-left)*i/Math.max(1,points.length-1);
    const y=v=>bottom-(v-low)*(bottom-top)/(high-low);
    ctx.lineWidth=1; ctx.font='11px "SFMono-Regular", Consolas, monospace'; ctx.textBaseline='middle';
    ctx.strokeStyle=palette.grid; ctx.fillStyle=palette.muted; ctx.textAlign='left';
    for (let v=low; v<=high; v+=step) {
      const py=y(v); ctx.beginPath();ctx.setLineDash([3,4]);ctx.moveTo(left,py);ctx.lineTo(right,py);ctx.stroke();
      ctx.fillText((v/100).toFixed(2),right+8,py);
    }
    ctx.setLineDash([]);
    const maxVolume=Math.max(1,...points.map(p=>p.volume)), barWidth=Math.max(2,Math.min(9,(right-left)/points.length*.62));
    coordinates=points.map((p,i)=>({x:x(i),y:y(p.ref)}));
    const samples= w<500 ? 4 : 6;
    for(let i=0;i<samples;i++){
      const index=Math.round(i*(points.length-1)/(samples-1)),px=x(index);
      ctx.strokeStyle='#292d32';ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,volumeBottom);ctx.stroke();
      ctx.fillStyle=palette.muted;ctx.textAlign=i===0?'left':i===samples-1?'right':'center';
      ctx.fillText(time(points[index].i),px,h-8);
    }
    ctx.textAlign='left'; const end=points.length-1;
    const gradient=ctx.createLinearGradient(0,top,0,bottom);gradient.addColorStop(0,'rgba(250,149,85,.21)');gradient.addColorStop(1,'rgba(250,149,85,.015)');
    ctx.beginPath(); coordinates.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.lineTo(x(end),bottom);ctx.lineTo(left,bottom);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
    ctx.beginPath();coordinates.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.strokeStyle=palette.line;ctx.lineWidth=2.25;ctx.lineJoin='round';ctx.stroke();
    points.forEach((p,i)=>{
      ctx.fillStyle=p.side===1?'#3e655b':'#775459';
      const bh=p.volume/maxVolume*volumeH;
      ctx.fillRect(x(i)-barWidth/2,volumeBottom-bh,barWidth,bh);
      if(showFills && p.fill){ctx.beginPath();ctx.arc(x(i),y(p.ref),3.4,0,Math.PI*2);ctx.fillStyle=p.side===1?palette.sell:palette.buy;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#171a1e';ctx.stroke();}
    });
    const lastY=coordinates[end].y;ctx.beginPath();ctx.arc(right,lastY,3.1,0,Math.PI*2);ctx.fillStyle=palette.line;ctx.fill();
    ctx.fillStyle='#ffa267';ctx.fillRect(right+3,lastY-8,54,16);ctx.fillStyle='#201b18';ctx.fillText((values[end]/100).toFixed(2),right+8,lastY);
    if(hot!==null && coordinates[hot]) {
      const p=coordinates[hot];ctx.beginPath();ctx.setLineDash([3,3]);ctx.moveTo(p.x,top);ctx.lineTo(p.x,volumeBottom);ctx.strokeStyle='#c9cdd4';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle='#f3f0ea';ctx.fill();
      const value=points[hot];tip.textContent=time(value.i)+'  '+price(value.ref)+'\nVolume  '+num(value.volume);
      tip.hidden=false;tip.style.left=clamp(p.x+10,2,w-150)+'px';
      tip.style.top=(p.y<53?65:6)+'px';
    } else tip.hidden=true;
  }
  canvas.addEventListener('pointermove',evt=>{
    if(!coordinates.length) return;
    const x=evt.clientX-canvas.getBoundingClientRect().left;
    hot=clamp(Math.round((x-coordinates[0].x)/(coordinates.at(-1).x-coordinates[0].x)*(points.length-1)),0,points.length-1);draw();
  });
  const clear=()=>{hot=null;draw();};
  canvas.addEventListener('pointerleave',clear);canvas.addEventListener('blur',clear);
  canvas.addEventListener('keydown',e=>{
    if(e.key==='Escape') clear();
    if(!['ArrowRight','ArrowLeft'].includes(e.key)) return;
    e.preventDefault();
    hot=clamp((hot??(points.length-1))+(e.key==='ArrowRight'?1:-1),0,points.length-1);draw();
    if(points[hot]) canvas.setAttribute('aria-label',time(points[hot].i)+', reference '+price(points[hot].ref)+', volume '+points[hot].volume);
  });
  new ResizeObserver(draw).observe(canvas);
  return (next, fills)=>{points=next;showFills=fills;hot=null;draw();};
}
