(function(root){
  'use strict';
  function parse(text, name='') {
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
    const touch=/\.s2p$/i.test(name)||lines.some(l=>/^\s*#/.test(l));
    let rows=[];
    if(!touch){
      for(let i=0;i<lines.length;i++){
        const line=lines[i].trim(); if(!line)continue;
        const parts=line.split(';').map(x=>x.trim().replace(',','.'));
        if(parts.length!==9||parts.some(x=>x===''||!Number.isFinite(Number(x))))throw Error(`CSV: рядок ${i+1} повинен містити 9 чисел, розділених «;».`);
        rows.push(parts.map(Number));
      }
    }else{
      let scale=1, format='MA', header=false, tokens=[];
      for(let i=0;i<lines.length;i++){
        const line=lines[i].split('!')[0].trim(); if(!line)continue;
        if(line.startsWith('['))throw Error('Підтримується Touchstone 1.x (.s2p). Експортуйте файл без блоків Touchstone 2.0.');
        if(line.startsWith('#')){
          if(header||tokens.length)throw Error('Некоректне розташування заголовка Touchstone.');
          const p=line.slice(1).trim().toUpperCase().split(/\s+/);
          const units={HZ:1,KHZ:1e3,MHZ:1e6,GHZ:1e9};
          if(!units[p[0]]||p[1]!=='S'||!['RI','MA','DB'].includes(p[2])||p[3]!=='R'||Number(p[4])!==50)throw Error('Потрібен заголовок # Hz/kHz/MHz/GHz S RI/MA/DB R 50.');
          scale=units[p[0]];format=p[2];header=true;continue;
        }
        const p=line.split(/\s+/).map(x=>Number(x.replace(/[dD]/,'e')));
        if(p.some(x=>!Number.isFinite(x)))throw Error(`Touchstone: нечислове значення у рядку ${i+1}.`);
        tokens.push(...p);
      }
      if(!header)throw Error('Touchstone: немає заголовка #.');
      if(tokens.length%9)throw Error('Touchstone: неповний запис; потрібно 9 значень на частоту.');
      for(let i=0;i<tokens.length;i+=9){
        const row=tokens.slice(i,i+9);row[0]*=scale;
        if(format!=='RI')for(let j=1;j<9;j+=2){
          const mag=format==='DB'?10**(row[j]/20):row[j], angle=row[j+1]*Math.PI/180;
          if(mag<0||!Number.isFinite(mag))throw Error('Некоректний модуль S-параметра.');
          row[j]=mag*Math.cos(angle);row[j+1]=mag*Math.sin(angle);
        }
        rows.push(row);
      }
    }
    if(!rows.length)throw Error('Файл не містить вимірювань.');
    if(rows.length>100000)throw Error('Максимум 100 000 точок у файлі.');
    for(let i=0;i<rows.length;i++)if(rows[i][0]<=0||(i&&rows[i][0]<=rows[i-1][0]))throw Error('Частоти повинні бути додатними та строго зростати.');
    return rows;
  }
  function calculate(rows,p){
    if(!(p.distance>0)||!(p.diameter1>0)||!(p.diameter2>0)||![p.correction,p.referenceGain].every(Number.isFinite))throw Error('Перевірте параметри: відстань і розміри > 0; поправка та еталон — числа.');
    return rows.map(r=>{
      const wavelength=(p.legacy?300e6:299792458)/r[0],rho=Math.hypot(r[1],r[2]),mag=Math.hypot(r[3],r[4]);
      const s11=rho>0?20*Math.log10(rho):-Infinity, s21=mag>0?20*Math.log10(mag):-Infinity;
      const swr=rho<1?(1+rho)/(1-rho):NaN;
      const fspl=20*Math.log10(4*Math.PI*p.distance/wavelength);
      const gain=Number.isFinite(s21)?(p.mode==='reference'?s21+fspl-p.referenceGain:(p.legacy?11+10*Math.log10(p.distance/wavelength)+s21/2:(s21+fspl)/2))+p.correction:NaN;
      const farfield=Math.max(2*p.diameter1**2/wavelength,2*p.diameter2**2/wavelength);
      return {frequency:r[0],s11,s21,swr,gain,wavelength,farfield,rho};
    });
  }
  function nearest(data,f){return data.reduce((best,p)=>Math.abs(p.frequency-f)<Math.abs(best.frequency-f)?p:best,data[0]);}
  const api={parse,calculate,nearest};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.AntennaAnalysis=api;
})(typeof globalThis!=='undefined'?globalThis:this);
