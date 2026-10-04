'use strict';
const $=id=>document.getElementById(id),core=window.AntennaAnalysis;
let datasets={a:null,b:null},computed={a:null,b:null},lastParams=null,versions={a:0,b:0};
const fmt=(n,d=3)=>Number.isFinite(n)?n.toFixed(d):n===-Infinity?'−∞':'Немає коректного значення';
function params(){
  const p={};for(const id of ['distance','diameter1','diameter2','referenceGain','correction','marker']){
    if($(id).value.trim()==='')throw Error('Заповніть числові параметри.');
    p[id]=Number($(id).value);if(!Number.isFinite(p[id]))throw Error('Параметри повинні бути скінченними числами.');
  }
  if(p.marker<=0)throw Error('Частота маркера повинна бути додатною.');
  p.mode=$('mode').value;p.legacy=$('legacy').checked;return p;
}
async function load(key){
  const version=++versions[key],file=$('file-'+key).files[0];
  datasets[key]=null;computed[key]=null;run();
  if(!file){$('status-'+key).textContent='Файл не вибрано.';run();return;}
  $('status-'+key).textContent='Читання файлу…';
  try{
    if(file.size>15*1024*1024)throw Error('Максимальний розмір файлу — 15 MB.');
    const rows=core.parse(await file.text(),file.name);
    if(version!==versions[key])return;
    datasets[key]={name:file.name,rows};
    $('status-'+key).textContent=`${file.name}: ${rows.length} точок, ${(rows[0][0]/1e9).toFixed(4)}–${(rows.at(-1)[0]/1e9).toFixed(4)} GHz.`;
    $('status-'+key).className='';run();
  }catch(e){if(version!==versions[key])return;$('status-'+key).textContent=e.message;$('status-'+key).className='error';run();}
}
function svgElement(tag,attributes={},text){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attributes))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;}
function plot(field,title,unit,marker){
  const holder=document.createElement('div'),h=document.createElement('h3');h.textContent=title;holder.append(h);
  const svg=svgElement('svg',{viewBox:'0 0 960 350',class:'plot',role:'img','aria-label':title}),data=[computed.a,computed.b].filter(Boolean);
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const series of data)for(const p of series){xmin=Math.min(xmin,p.frequency);xmax=Math.max(xmax,p.frequency);if(Number.isFinite(p[field])){ymin=Math.min(ymin,p[field]);ymax=Math.max(ymax,p[field]);}}
  if(!Number.isFinite(ymin)){const p=document.createElement('p');p.textContent='Немає скінченних значень для графіка.';holder.append(p);return holder;}
  if(xmin===xmax){xmin-=1e6;xmax+=1e6;}
  const pad=Math.max((ymax-ymin)*.08,.1);ymin-=pad;ymax+=pad;
  const x=f=>75+(f-xmin)/(xmax-xmin)*860,y=y=>295-(y-ymin)/(ymax-ymin)*265;
  for(let i=0;i<=5;i++){
    const px=75+i*860/5,py=30+i*265/5;
    svg.append(svgElement('line',{x1:75,y1:py,x2:935,y2:py,stroke:'#d1dde4'}),svgElement('text',{x:68,y:py+5,'text-anchor':'end'},(ymax-i*(ymax-ymin)/5).toFixed(2)));
    svg.append(svgElement('line',{x1:px,y1:30,x2:px,y2:295,stroke:'#d1dde4'}),svgElement('text',{x:px,y:318,'text-anchor':'middle'},((xmin+i*(xmax-xmin)/5)/1e9).toFixed(3)));
  }
  if(marker>=xmin&&marker<=xmax)svg.append(svgElement('line',{x1:x(marker),x2:x(marker),y1:30,y2:295,stroke:'#596875','stroke-dasharray':'5 5'}));
  for(const [key,color]of [['a','#087e9c'],['b','#b66a10']]){
    if(!computed[key])continue;let path='',open=false;
    for(const p of computed[key]){if(!Number.isFinite(p[field])){open=false;continue;}path+=(open?'L':'M')+x(p.frequency).toFixed(2)+' '+y(p[field]).toFixed(2)+' ';open=true;}
    svg.append(svgElement('path',{d:path,fill:'none',stroke:color,'stroke-width':2}));
    if(computed[key].length===1&&Number.isFinite(computed[key][0][field]))svg.append(svgElement('circle',{cx:x(computed[key][0].frequency),cy:y(computed[key][0][field]),r:4,fill:color}));
  }
  svg.append(svgElement('text',{x:505,y:343,'text-anchor':'middle'},'Частота, GHz'),svgElement('text',{x:10,y:18},unit));holder.append(svg);return holder;
}
function run(event){
  if(event)event.preventDefault();$('error').textContent='';
  if(!datasets.a){$('results').hidden=true;computed={a:null,b:null};return;}
  try{
    const p=params(),out={a:core.calculate(datasets.a.rows,p),b:datasets.b?core.calculate(datasets.b.rows,p):null};
    computed=out;lastParams=p;$('results').hidden=false;
    $('summary').textContent=`A: ${datasets.a.name}${datasets.b?'\nB: '+datasets.b.name:''}\nR = ${p.distance} м; поправка ${p.correction} dB; згладжування вимкнено. ${p.mode==='equal'?'Оцінка для однакових антен.':'Оцінка для антени 2; еталон '+p.referenceGain+' dBi.'}`;
    const near={a:core.nearest(out.a,p.marker*1e6),b:out.b?core.nearest(out.b,p.marker*1e6):null},warnings=[];
    for(const key of ['a','b']){
      const d=out[key];if(!d)continue;const prefix=key.toUpperCase()+': ';
      if(p.marker*1e6<d[0].frequency||p.marker*1e6>d.at(-1).frequency)warnings.push(prefix+'маркер поза діапазоном; показано найближчу крайову точку.');
      const threshold=d.reduce((m,q)=>Math.max(m,q.farfield),0);
      if(p.distance<threshold)warnings.push(prefix+`не виконано критерій дальньої зони для частини або всіх частот. Найбільше 2D²/λ = ${threshold.toFixed(3)} м. Оцінка підсилення може бути некоректною.`);
      if(d.some(q=>p.distance<=10*Math.max(q.wavelength,p.diameter1,p.diameter2)))warnings.push(prefix+'додатково перевірте R ≫ λ та R ≫ D. Розрахунок 2D²/λ не гарантує плоску хвилю або точність вимірювання.');
      const invalid=d.filter(q=>!Number.isFinite(q.swr)).length;if(invalid)warnings.push(prefix+`${invalid} точок мають |S11| ≥ 1: КСХ не обчислено.`);
      const zeros=d.filter(q=>q.s21===-Infinity).length;if(zeros)warnings.push(prefix+`${zeros} точок мають нульовий S21: підсилення не обчислено.`);
    }
    if(p.mode==='reference')warnings.push('Підсилення еталона використано як сталу величину на всій розгортці.');
    $('warnings').hidden=!warnings.length;$('warnings').textContent=warnings.join('\n');$('warnings').style.whiteSpace='pre-line';
    $('values').replaceChildren();
    for(const [label,field,digits,scale]of [['Фактична частота, MHz','frequency',3,1e6],['S11, dB','s11',3,1],['S21, dB','s21',3,1],['КСХ','swr',3,1],['Умовна оцінка підсилення, dBi','gain',3,1],['Критерій 2D²/λ, м','farfield',3,1]]){
      const row=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;row.append(th);
      for(const key of ['a','b']){const td=document.createElement('td');td.textContent=near[key]?fmt(near[key][field]/scale,digits):'—';row.append(td);}$('values').append(row);
    }
    $('plots').replaceChildren(...[['s11','S11 — відбиття','dB'],['s21','S21 — передача','dB'],['swr','Коефіцієнт стоячої хвилі','КСХ'],['gain','Умовна оцінка підсилення','dBi']].map(([k,t,u])=>plot(k,t,u,p.marker*1e6)));
    $('export-b').disabled=!out.b;
  }catch(e){$('error').textContent=e.message;$('results').hidden=true;computed={a:null,b:null};}
}
function exportData(key){
  if(!computed[key])return;
  const p=lastParams,notes=JSON.stringify({source:datasets[key].name,...p,smoothing:false,speedOfLight:p.legacy?300000000:299792458});
  let content='# '+notes+'\nfrequency_Hz,S11_dB,S21_dB,VSWR,estimated_gain_dBi,farfield_m\n';
  for(const q of computed[key])content+=[q.frequency,q.s11,q.s21,q.swr,q.gain,q.farfield].map(v=>Number.isFinite(v)?String(v):v===-Infinity?'-Infinity':'').join(',')+'\n';
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=datasets[key].name.replace(/\.[^.]+$/,'')+'-analysis.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
for(const key of ['a','b']){$('file-'+key).addEventListener('change',()=>load(key));$('export-'+key).addEventListener('click',()=>exportData(key));}
$('clear-b').addEventListener('click',()=>{versions.b++;$('file-b').value='';datasets.b=null;$('status-b').textContent='Файл не вибрано.';$('status-b').className='';run();});
$('parameters').addEventListener('submit',run);
$('parameters').addEventListener('change',()=>{$('referenceGain').disabled=$('mode').value!=='reference';run();});
