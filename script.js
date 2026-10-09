const RI = {1:0,2:0,3:0.58,4:0.90,5:1.12,6:1.24,7:1.32,8:1.41,9:1.45,10:1.49,11:1.51,12:1.48,13:1.56,14:1.57,15:1.59};
const SAATY = [
  {v:1/9,l:'1/9 — B extreme'},
  {v:1/8,l:'1/8 — B very strong ↔ extreme'},
  {v:1/7,l:'1/7 — B very strong'},
  {v:1/6,l:'1/6 — B strong ↔ very strong'},
  {v:1/5,l:'1/5 — B strong'},
  {v:1/4,l:'1/4 — B moderate ↔ strong'},
  {v:1/3,l:'1/3 — B moderate'},
  {v:1/2,l:'1/2 — B slight'},
  {v:1,l:'1 — Equal importance'},
  {v:2,l:'2 — A slight'},
  {v:3,l:'3 — A moderate'},
  {v:4,l:'4 — A moderate ↔ strong'},
  {v:5,l:'5 — A strong'},
  {v:6,l:'6 — A strong ↔ very strong'},
  {v:7,l:'7 — A very strong'},
  {v:8,l:'8 — A very strong ↔ extreme'},
  {v:9,l:'9 — A extreme'}
];
const BAR_COLORS = [
  ['#0B63CE','#25B7D3'],
  ['#00897B','#46C7A7'],
  ['#F59E0B','#FFD166'],
  ['#E84A5F','#FF8091'],
  ['#6D4AFF','#A98BFF'],
  ['#1565C0','#64B5F6'],
  ['#00A878','#62D2A2'],
  ['#7B2CBF','#C77DFF'],
  ['#F97316','#FDBA74'],
  ['#0891B2','#67E8F9'],
  ['#DB2777','#F9A8D4'],
  ['#65A30D','#BEF264'],
  ['#0E7490','#5EEAD4'],
  ['#CA8A04','#FDE047'],
  ['#4F46E5','#A5B4FC']
];

const state = {
  hazard: 'Hazard Susceptibility',
  n: 8,
  respondents: 6,
  indicators: [],
  descriptions: [],
  judgments: {},
  result: null
};

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, Number(x) || a));
const pairKey = (i,j) => `${i}-${j}`;
const fmt = (x, d=4) => Number.isFinite(x) ? x.toFixed(d) : '—';

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2300);
}

function defaultIndicators(n) {
  return Array.from({length:n}, (_,i) => `Indicator ${i+1}`);
}

function initializeIndicators() {
  if (!state.indicators.length) state.indicators = defaultIndicators(state.n);
  while (state.indicators.length < state.n) state.indicators.push(`Indicator ${state.indicators.length+1}`);
  while (state.descriptions.length < state.n) state.descriptions.push('');
  state.indicators = state.indicators.slice(0, state.n);
  state.descriptions = state.descriptions.slice(0, state.n);
}

function renderIndicatorInputs() {
  initializeIndicators();
  const box = $('indicatorInputs');
  box.innerHTML = '';
  state.indicators.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'indicator-row';
    row.innerHTML = `
      <div class="indicator-no">${i+1}</div>
      <input class="criterion-name" data-i="${i}" value="${escapeHtml(name)}" placeholder="Criterion ${i+1}" />
      <input class="criterion-desc" data-i="${i}" value="${escapeHtml(state.descriptions[i] || '')}" placeholder="Optional description / unit" />`;
    box.appendChild(row);
  });
  box.querySelectorAll('.criterion-name').forEach(el => el.addEventListener('input', e => state.indicators[+e.target.dataset.i] = e.target.value || `Indicator ${+e.target.dataset.i + 1}`));
  box.querySelectorAll('.criterion-desc').forEach(el => el.addEventListener('input', e => state.descriptions[+e.target.dataset.i] = e.target.value));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function syncSetupFromInputs() {
  state.hazard = $('hazardName').value.trim() || 'Hazard Susceptibility';
  state.n = clamp($('indicatorCount').value, 5, 15);
  state.respondents = clamp($('respondentCount').value, 6, 20);
  $('indicatorCount').value = state.n;
  $('respondentCount').value = state.respondents;
  initializeIndicators();
  updateCounts();
}

function updateCounts() {
  const pairs = state.n * (state.n - 1) / 2;
  $('pairCount').textContent = pairs;
  $('judgmentCount').textContent = pairs * state.respondents;
}

function rebuildIndicatorsIfCountChanged() {
  const newN = clamp($('indicatorCount').value,5,15);
  const newR = clamp($('respondentCount').value,6,20);
  if (newN !== state.n || newR !== state.respondents) {
    state.n = newN;
    state.respondents = newR;
    initializeIndicators();
    state.judgments = {};
    state.result = null;
    renderIndicatorInputs();
    renderJudgmentTable();
    clearResults();
  }
  updateCounts();
}

function optionsHtml(selected='') {
  const first = `<option value="">—</option>`;
  return first + SAATY.map(o => `<option value="${o.v}" ${String(selected)===String(o.v)?'selected':''}>${o.l}</option>`).join('');
}

function renderJudgmentTable() {
  syncSetupFromInputs();
  const table = $('judgmentTable');
  const head = [`<thead><tr><th>Pair</th><th>Criterion A</th><th>Criterion B</th>`];
  for (let r=0;r<state.respondents;r++) head.push(`<th>R${r+1}</th>`);
  head.push(`<th>Group GM</th><th>Status</th></tr></thead>`);
  const body = ['<tbody>'];
  let p = 1;
  for (let i=0;i<state.n;i++) {
    for (let j=i+1;j<state.n;j++) {
      const key = pairKey(i,j);
      if (!Array.isArray(state.judgments[key])) state.judgments[key] = Array(state.respondents).fill('');
      state.judgments[key] = state.judgments[key].slice(0,state.respondents);
      while (state.judgments[key].length < state.respondents) state.judgments[key].push('');
      body.push(`<tr data-pair="${key}"><td>${p++}</td><td>${escapeHtml(state.indicators[i])}</td><td>${escapeHtml(state.indicators[j])}</td>`);
      for (let r=0;r<state.respondents;r++) {
        body.push(`<td><select class="judge-select" data-key="${key}" data-r="${r}">${optionsHtml(state.judgments[key][r])}</select></td>`);
      }
      const gm = groupGM(state.judgments[key]);
      const complete = pairComplete(state.judgments[key]);
      body.push(`<td class="gm-cell">${complete ? fmt(gm,4) : '—'}</td><td class="pair-status"><span class="status-pill ${complete?'ok':'missing'}">${complete?'Complete':'Missing'}</span></td></tr>`);
    }
  }
  body.push('</tbody>');
  table.innerHTML = head.join('') + body.join('');
  table.querySelectorAll('.judge-select').forEach(sel => sel.addEventListener('change', onJudgmentChange));
  updateCompletion();
}

function onJudgmentChange(e) {
  const key = e.target.dataset.key;
  const r = +e.target.dataset.r;
  state.judgments[key][r] = e.target.value;
  const row = e.target.closest('tr');
  const complete = pairComplete(state.judgments[key]);
  row.querySelector('.gm-cell').textContent = complete ? fmt(groupGM(state.judgments[key]),4) : '—';
  row.querySelector('.pair-status').innerHTML = `<span class="status-pill ${complete?'ok':'missing'}">${complete?'Complete':'Missing'}</span>`;
  updateCompletion();
}

function pairComplete(arr) {
  return Array.isArray(arr) && arr.length === state.respondents && arr.every(v => v !== '' && Number(v) > 0);
}

function groupGM(arr) {
  if (!pairComplete(arr)) return NaN;
  return Math.exp(arr.reduce((s,v) => s + Math.log(Number(v)), 0) / arr.length);
}

function completionInfo() {
  const pairs = state.n*(state.n-1)/2;
  let complete = 0;
  for (let i=0;i<state.n;i++) for (let j=i+1;j<state.n;j++) if (pairComplete(state.judgments[pairKey(i,j)])) complete++;
  return {pairs, complete, pct: pairs ? 100*complete/pairs : 0};
}

function updateCompletion() {
  const x = completionInfo();
  $('completionText').textContent = `${x.complete}/${x.pairs} pairs (${x.pct.toFixed(0)}%)`;
  $('completionBar').style.width = `${x.pct}%`;
}

function calculate() {
  syncSetupFromInputs();
  const comp = completionInfo();
  if (comp.complete !== comp.pairs) {
    toast(`Complete all pairwise judgments first (${comp.complete}/${comp.pairs} pairs complete).`);
    switchTab('judgments');
    return;
  }

  const A = Array.from({length:state.n}, () => Array(state.n).fill(1));
  for (let i=0;i<state.n;i++) {
    for (let j=i+1;j<state.n;j++) {
      const g = groupGM(state.judgments[pairKey(i,j)]);
      A[i][j] = g;
      A[j][i] = 1/g;
    }
  }

  const rowGM = A.map(row => Math.exp(row.reduce((s,v)=>s+Math.log(v),0)/state.n));
  const total = rowGM.reduce((a,b)=>a+b,0);
  const weights = rowGM.map(v=>v/total);
  const aw = A.map(row => row.reduce((s,aij,j)=>s+aij*weights[j],0));
  const lambdaI = aw.map((v,i)=>v/weights[i]);
  const lambdaMax = lambdaI.reduce((a,b)=>a+b,0)/state.n;
  const ci = state.n > 1 ? (lambdaMax-state.n)/(state.n-1) : 0;
  const ri = RI[state.n] ?? 0;
  const cr = ri ? ci/ri : 0;
  const ranking = weights.map((w,i)=>({i,w})).sort((a,b)=>b.w-a.w).map((x,rank)=>({...x,rank:rank+1}));
  const ranks = Array(state.n);
  ranking.forEach(x=>ranks[x.i]=x.rank);

  state.result = {A,rowGM,weights,lambdaI,lambdaMax,ci,ri,cr,ranks};
  renderResults();
  switchTab('results');
  toast('AHP weights calculated successfully.');
}

function renderResults() {
  const r = state.result;
  if (!r) return clearResults();
  $('resultEmpty').classList.add('hidden');
  $('resultContent').classList.remove('hidden');
  $('csvBtn').disabled = false;
  $('weightImgBtn').disabled = false;
  $('matrixImgBtn').disabled = false;
  $('resultSubtitle').textContent = `${state.hazard} • ${state.n} indicators • ${state.respondents} respondents`;
  $('lambdaMax').textContent = fmt(r.lambdaMax,4);
  $('ciValue').textContent = fmt(r.ci,4);
  $('riValue').textContent = fmt(r.ri,2);
  $('crValue').textContent = fmt(r.cr,4);
  const ok = r.cr <= 0.10;
  $('crStatus').textContent = ok ? 'ACCEPTABLE (CR ≤ 0.10)' : 'NOT ACCEPTABLE (CR > 0.10)';
  $('crExplain').textContent = ok ? 'The pairwise comparison matrix is consistent and acceptable for AHP analysis.' : 'The pairwise comparison matrix is inconsistent. Review and revise the judgments before final use.';
  const statusBox = $('crStatus').closest('.metric');
  statusBox.classList.remove('acceptable','unacceptable');
  statusBox.classList.add(ok?'acceptable':'unacceptable');

  let wt = '<thead><tr><th>Criterion</th><th>Row GM</th><th>Weight</th><th>Weight (%)</th><th>Rank</th><th>λi</th></tr></thead><tbody>';
  state.indicators.forEach((name,i) => {
    wt += `<tr><td style="text-align:left">${escapeHtml(name)}</td><td>${fmt(r.rowGM[i],4)}</td><td>${fmt(r.weights[i],4)}</td><td>${(r.weights[i]*100).toFixed(2)}%</td><td>${r.ranks[i]}</td><td>${fmt(r.lambdaI[i],4)}</td></tr>`;
  });
  wt += '</tbody>';
  $('weightsTable').innerHTML = wt;

  const maxWeight = Math.max(...r.weights);
  $('weightBars').innerHTML = state.indicators.map((name,i)=>{
    const colors = BAR_COLORS[i % BAR_COLORS.length];
    return `
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.weights[i]/maxWeight*100).toFixed(1)}%; background: linear-gradient(90deg, ${colors[0]}, ${colors[1]});"></div></div>
        <div class="bar-value">${(r.weights[i]*100).toFixed(2)}%</div>
        <div class="bar-rank">#${r.ranks[i]}</div>
      </div>`;
  }).join('');

  let mt = '<thead><tr><th>Criterion</th>' + state.indicators.map(x=>`<th>${escapeHtml(x)}</th>`).join('') + '</tr></thead><tbody>';
  r.A.forEach((row,i)=>{
    mt += `<tr><td>${escapeHtml(state.indicators[i])}</td>${row.map((v,j)=>{
      const style = matrixCellStyle(v, i === j);
      const cls = i === j ? 'data-cell diag-cell' : 'data-cell';
      return `<td class="${cls}" style="background:${style.bg}; color:${style.fg};">${fmt(v,4)}</td>`;
    }).join('')}</tr>`;
  });
  mt += '</tbody>';
  $('matrixTable').innerHTML = mt;
}

function clearResults() {
  state.result = null;
  $('resultEmpty').classList.remove('hidden');
  $('resultContent').classList.add('hidden');
  $('csvBtn').disabled = true;
  $('weightImgBtn').disabled = true;
  $('matrixImgBtn').disabled = true;
  $('resultSubtitle').textContent = 'Complete all active judgments and calculate the model.';
}

function switchTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
  window.scrollTo({top: document.querySelector('.tabs').offsetTop - 5, behavior:'smooth'});
}

function nearestSaaty(x) {
  let best = SAATY[0].v, dist = Infinity;
  SAATY.forEach(o => {
    const d = Math.abs(Math.log(o.v)-Math.log(x));
    if (d < dist) { dist=d; best=o.v; }
  });
  return best;
}

function gaussian() {
  let u=0,v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

function fillRandomCoherent() {
  syncSetupFromInputs();
  const base = Array.from({length:state.n},()=>0.6+Math.random()*1.8);
  for (let i=0;i<state.n;i++) {
    for (let j=i+1;j<state.n;j++) {
      const key = pairKey(i,j);
      state.judgments[key] = [];
      for (let r=0;r<state.respondents;r++) {
        const wi = base[i]*Math.exp(gaussian()*0.16);
        const wj = base[j]*Math.exp(gaussian()*0.16);
        state.judgments[key].push(String(nearestSaaty(wi/wj)));
      }
    }
  }
  renderJudgmentTable();
  calculate();
  toast('Random coherent demo values added. Replace them with real expert judgments for research use.');
}

function clearJudgments() {
  state.judgments = {};
  clearResults();
  renderJudgmentTable();
  toast('Judgments cleared.');
}

function loadFlashFlood() {
  state.hazard = 'Flash Flood Susceptibility';
  state.n = 8;
  state.respondents = 10;
  state.indicators = [
    'Rainfall',
    'Drainage Density',
    'Topographic Wetness Index (TWI)',
    'Elevation',
    'Slope',
    'Distance to River/Stream',
    'Land Use/Land Cover (LULC)',
    'Soil Type'
  ];
  state.descriptions = [
    'Extreme/event rainfall (mm)',
    'Drainage length per unit area',
    'Terrain wetness / flow accumulation index',
    'Ground elevation (m)',
    'Terrain slope (degree or %)',
    'Distance from drainage/river network (m)',
    'Land-cover / runoff response',
    'Soil texture / infiltration group'
  ];
  state.judgments = {};
  clearResults();
  $('hazardName').value = state.hazard;
  $('indicatorCount').value = state.n;
  $('respondentCount').value = state.respondents;
  renderIndicatorInputs();
  updateCounts();
  renderJudgmentTable();
  toast('Flash Flood example loaded.');
}

function resetAll() {
  state.hazard='Hazard Susceptibility'; state.n=8; state.respondents=6;
  state.indicators=defaultIndicators(8); state.descriptions=Array(8).fill('');
  state.judgments={}; state.result=null;
  $('hazardName').value=state.hazard; $('indicatorCount').value=8; $('respondentCount').value=6;
  renderIndicatorInputs(); updateCounts(); renderJudgmentTable(); clearResults();
  toast('Calculator reset.');
}

function saveLocal() {
  syncSetupFromInputs();
  const payload = {hazard:state.hazard,n:state.n,respondents:state.respondents,indicators:state.indicators,descriptions:state.descriptions,judgments:state.judgments};
  localStorage.setItem('ahp-calculator-refath-v2', JSON.stringify(payload));
  toast('Saved in this browser.');
}

function loadLocal() {
  const raw = localStorage.getItem('ahp-calculator-refath-v2') || localStorage.getItem('ahp-calculator-refath-v1');
  if (!raw) return toast('No saved calculator found in this browser.');
  try {
    const x = JSON.parse(raw);
    state.hazard=x.hazard||'Hazard Susceptibility'; state.n=clamp(x.n,5,15); state.respondents=clamp(x.respondents,6,20);
    state.indicators=Array.isArray(x.indicators)?x.indicators.slice(0,state.n):defaultIndicators(state.n);
    state.descriptions=Array.isArray(x.descriptions)?x.descriptions.slice(0,state.n):Array(state.n).fill('');
    state.judgments=x.judgments||{}; state.result=null;
    $('hazardName').value=state.hazard; $('indicatorCount').value=state.n; $('respondentCount').value=state.respondents;
    renderIndicatorInputs(); updateCounts(); renderJudgmentTable(); clearResults();
    toast('Saved calculator loaded.');
  } catch { toast('Saved data could not be loaded.'); }
}

function exportCSV() {
  if (!state.result) return;
  const r=state.result;
  const rows = [['Hazard/Objectve',state.hazard],[],['Criterion','Weight','Weight (%)','Rank','Row GM','Lambda_i']];
  state.indicators.forEach((name,i)=>rows.push([name,r.weights[i],r.weights[i]*100,r.ranks[i],r.rowGM[i],r.lambdaI[i]]));
  rows.push([],['Lambda Max',r.lambdaMax],['CI',r.ci],['RI',r.ri],['CR',r.cr],['Status',r.cr<=0.1?'ACCEPTABLE (CR ≤ 0.10)':'NOT ACCEPTABLE (CR > 0.10)']);
  const csv = rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`AHP_${state.hazard.replace(/[^a-z0-9]+/gi,'_')}_weights.csv`; a.click(); URL.revokeObjectURL(a.href);
}

function hexToRgb(hex) {
  const x = hex.replace('#','');
  const v = x.length === 3 ? x.split('').map(c => c + c).join('') : x;
  return {r: parseInt(v.slice(0,2),16), g: parseInt(v.slice(2,4),16), b: parseInt(v.slice(4,6),16)};
}

function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('');
}

function mixColors(a,b,t) {
  const c1 = hexToRgb(a), c2 = hexToRgb(b);
  return rgbToHex(c1.r + (c2.r-c1.r)*t, c1.g + (c2.g-c1.g)*t, c1.b + (c2.b-c1.b)*t);
}

function matrixCellStyle(v, isDiag=false) {
  if (isDiag) return {bg: '#FFE59A', fg: '#684000'};
  if (Math.abs(v - 1) < 1e-10) return {bg: '#FFF2C7', fg: '#6B4B00'};
  if (v > 1) {
    const t = Math.min(1, Math.log(v) / Math.log(9));
    return {bg: mixColors('#DDF7F5', '#35B8C8', t * .72 + .16), fg: t > .66 ? '#073B45' : '#0E4F59'};
  }
  const t = Math.min(1, Math.log(1/v) / Math.log(9));
  return {bg: mixColors('#FDE8F1', '#E56B8D', t * .72 + .16), fg: t > .66 ? '#5E132A' : '#7A2440'};
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 3 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

function drawRoundRect(ctx, x, y, w, h, r, fill, stroke='#dbe5f1') {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function createWeightCanvas(scale=2) {
  const r = state.result;
  if (!r) return null;
  const rowH = 58;
  const width = 1400;
  const height = 220 + state.n * rowH;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(1, '#eef8fb');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#102A43';
  ctx.font = '700 30px Inter, Arial, sans-serif';
  ctx.fillText(`${state.hazard} - AHP Weight Percentage`, 60, 55);
  ctx.font = '16px Inter, Arial, sans-serif';
  ctx.fillStyle = '#52667A';
  const status = r.cr <= 0.10 ? 'ACCEPTABLE (CR ≤ 0.10)' : 'NOT ACCEPTABLE (CR > 0.10)';
  ctx.fillText(`Indicators: ${state.n}    Respondents: ${state.respondents}    CR: ${fmt(r.cr,4)}    Status: ${status}`, 60, 85);

  drawRoundRect(ctx, 52, 108, width-104, height-144, 18, '#ffffff', '#C9D7E6');

  const labelX = 75;
  const barX = 450;
  const barW = 620;
  const valueX = 1100;
  const rankX = 1250;
  const topY = 150;
  const maxW = Math.max(...r.weights);

  ctx.font = '700 17px Inter, Arial, sans-serif';
  ctx.fillStyle = '#40556B';
  ctx.fillText('Criterion', labelX, 138);
  ctx.fillText('Weight (%)', valueX, 138);
  ctx.fillText('Rank', rankX, 138);

  state.indicators.forEach((name, i) => {
    const y = topY + i*rowH;
    const colors = BAR_COLORS[i % BAR_COLORS.length];
    ctx.font = '600 17px Inter, Arial, sans-serif';
    ctx.fillStyle = '#102A43';
    ctx.fillText(fitText(ctx, name, 340), labelX, y+26);
    ctx.fillStyle = '#eef3f8';
    drawRoundRect(ctx, barX, y+7, barW, 22, 11, '#eef3f8', null);
    const g = ctx.createLinearGradient(barX, y, barX + barW, y);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    drawRoundRect(ctx, barX, y+7, Math.max(10, barW*(r.weights[i]/maxW)), 22, 11, g, null);
    ctx.font = '700 17px Inter, Arial, sans-serif';
    ctx.fillStyle = '#0B4A6F';
    ctx.fillText(`${(r.weights[i]*100).toFixed(2)}%`, valueX, y+26);
    drawRoundRect(ctx, rankX-10, y-1, 56, 38, 19, '#FFF0B8', '#E2BE4D');
    ctx.fillStyle = '#684000';
    ctx.fillText(`#${r.ranks[i]}`, rankX+6, y+23);
  });

  ctx.font = '14px Inter, Arial, sans-serif';
  ctx.fillStyle = '#6A7B8E';
  ctx.fillText('Generated from the AHP Hazard Weight Calculator • Publication-ready summary image', 60, height-30);
  return canvas;
}

function createMatrixCanvas(scale=2) {
  const r = state.result;
  if (!r) return null;
  const n = state.n;
  const labelW = n >= 12 ? 190 : 230;
  const cellW = n >= 12 ? 84 : n >= 10 ? 92 : 102;
  const rowH = n >= 12 ? 42 : 48;
  const topH = 76;
  const width = labelW + n * cellW + 100;
  const height = 210 + n * rowH + 80;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(1, '#F1F8FA');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#102A43';
  ctx.font = '700 28px Inter, Arial, sans-serif';
  ctx.fillText(`${state.hazard} - Group Pairwise Comparison Matrix`, 32, 42);
  ctx.font = '16px Inter, Arial, sans-serif';
  ctx.fillStyle = '#52667A';
  const status = r.cr <= 0.10 ? 'ACCEPTABLE (CR ≤ 0.10)' : 'NOT ACCEPTABLE (CR > 0.10)';
  ctx.fillText(`Indicators: ${n}    Respondents: ${state.respondents}    CR: ${fmt(r.cr,4)}    Status: ${status}`, 32, 68);

  const legendY = 90;
  [['#F3A7BD', 'Lower than 1'], ['#FFE59A', 'Equal / diagonal'], ['#78D6DD', 'Higher than 1']].forEach((item, idx) => {
    drawRoundRect(ctx, 32 + idx*165, legendY, 24, 18, 4, item[0], '#d2d9e5');
    ctx.fillStyle = '#55657f';
    ctx.font = '14px Inter, Arial, sans-serif';
    ctx.fillText(item[1], 64 + idx*165, legendY + 14);
  });

  const startX = 32;
  const startY = 125;
  drawRoundRect(ctx, startX-10, startY-10, labelW + n*cellW + 20, topH + n*rowH + 20, 18, '#ffffff', '#dde7f2');

  ctx.font = '700 15px Inter, Arial, sans-serif';
  drawRoundRect(ctx, startX, startY, labelW, topH, 0, '#DCE8F7', '#C4D5E6');
  ctx.fillStyle = '#102A43';
  ctx.fillText('Criterion', startX + 14, startY + 44);

  for (let j=0; j<n; j++) {
    const x = startX + labelW + j*cellW;
    drawRoundRect(ctx, x, startY, cellW, topH, 0, '#DFF5F4', '#C4D5E6');
    ctx.save();
    ctx.translate(x + cellW/2, startY + topH/2 + 6);
    ctx.rotate(-Math.PI/4.7);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#164A59';
    ctx.fillText(fitText(ctx, state.indicators[j], cellW*1.2), 0, 0);
    ctx.restore();
  }

  for (let i=0; i<n; i++) {
    const y = startY + topH + i*rowH;
    drawRoundRect(ctx, startX, y, labelW, rowH, 0, i%2===0 ? '#f9fbff' : '#f5f8fe', '#e3ebf5');
    ctx.fillStyle = '#102A43';
    ctx.textAlign = 'left';
    ctx.font = '600 14px Inter, Arial, sans-serif';
    ctx.fillText(fitText(ctx, state.indicators[i], labelW-22), startX + 12, y + 27);

    for (let j=0; j<n; j++) {
      const x = startX + labelW + j*cellW;
      const style = matrixCellStyle(r.A[i][j], i===j);
      drawRoundRect(ctx, x, y, cellW, rowH, 0, style.bg, '#e1e8f1');
      ctx.fillStyle = style.fg;
      ctx.textAlign = 'center';
      ctx.font = i===j ? '700 14px Inter, Arial, sans-serif' : '600 13px Inter, Arial, sans-serif';
      ctx.fillText(fmt(r.A[i][j], 4), x + cellW/2, y + 27);
    }
  }

  ctx.textAlign = 'left';
  ctx.font = '14px Inter, Arial, sans-serif';
  ctx.fillStyle = '#6A7B8E';
  ctx.fillText('Generated from the AHP Hazard Weight Calculator • Publication-ready matrix image', 32, height-24);
  return canvas;
}

function downloadCanvas(canvas, filename) {
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

function downloadWeightImage() {
  if (!state.result) return;
  const canvas = createWeightCanvas(3);
  downloadCanvas(canvas, `AHP_${state.hazard.replace(/[^a-z0-9]+/gi,'_')}_weight_percentage.png`);
}

function downloadMatrixImage() {
  if (!state.result) return;
  const canvas = createMatrixCanvas(3);
  downloadCanvas(canvas, `AHP_${state.hazard.replace(/[^a-z0-9]+/gi,'_')}_comparison_matrix.png`);
}

// Events
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));
$('indicatorCount').addEventListener('change', rebuildIndicatorsIfCountChanged);
$('respondentCount').addEventListener('change', rebuildIndicatorsIfCountChanged);
$('hazardName').addEventListener('input', ()=>state.hazard=$('hazardName').value);
$('buildBtn').addEventListener('click', ()=>{ syncSetupFromInputs(); renderJudgmentTable(); switchTab('judgments'); toast('Pairwise calculator built.'); });
$('calculateBtn').addEventListener('click', calculate);
$('randomBtn').addEventListener('click', fillRandomCoherent);
$('clearJudgmentsBtn').addEventListener('click', clearJudgments);
$('flashFloodBtn').addEventListener('click', loadFlashFlood);
$('resetBtn').addEventListener('click', resetAll);
$('saveBtn').addEventListener('click', saveLocal);
$('loadBtn').addEventListener('click', loadLocal);
$('csvBtn').addEventListener('click', exportCSV);
$('weightImgBtn').addEventListener('click', downloadWeightImage);
$('matrixImgBtn').addEventListener('click', downloadMatrixImage);
$('printBtn').addEventListener('click', ()=>window.print());

// Initial render
state.indicators = defaultIndicators(state.n);
state.descriptions = Array(state.n).fill('');
renderIndicatorInputs();
updateCounts();
renderJudgmentTable();
