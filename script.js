const RI = {1:0,2:0,3:0.58,4:0.90,5:1.12,6:1.24,7:1.32,8:1.41,9:1.45,10:1.49,11:1.51,12:1.48,13:1.56,14:1.57,15:1.59,16:1.5978,17:1.6086,18:1.6181,19:1.6265,20:1.6341,21:1.6409,22:1.6470,23:1.6526,24:1.6577,25:1.6624};
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
  result: null,
  expertDiagnostics: null,
  sensitivity: null,
  validation: null
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
  state.n = clamp($('indicatorCount').value, 3, 25);
  state.respondents = clamp($('respondentCount').value, 2, 20);
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
  const newN = clamp($('indicatorCount').value, 3, 25);
  const newR = clamp($('respondentCount').value, 2, 20);
  const sizeChanged = newN !== state.n || newR !== state.respondents;

  // Always write the exact selected values back to state and controls.
  state.n = newN;
  state.respondents = newR;
  $('indicatorCount').value = String(newN);
  $('respondentCount').value = String(newR);

  if (sizeChanged) {
    initializeIndicators();
    // A matrix built for another n/N cannot safely be reused.
    state.judgments = {};
    state.result = null;
    renderIndicatorInputs();
    clearResults();
  }

  updateCounts();
  // Rebuild every time so the visible table can never retain old R columns/pairs.
  renderJudgmentTable();
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


function matrixMetrics(A) {
  const n = A.length;
  const rowGM = A.map(row => Math.exp(row.reduce((s,v)=>s+Math.log(v),0)/n));
  const total = rowGM.reduce((a,b)=>a+b,0);
  const weights = rowGM.map(v=>v/total);
  const aw = A.map(row => row.reduce((s,aij,j)=>s+aij*weights[j],0));
  const lambdaI = aw.map((v,i)=>v/weights[i]);
  const lambdaMax = lambdaI.reduce((a,b)=>a+b,0)/n;
  const ci = n > 1 ? (lambdaMax-n)/(n-1) : 0;
  const ri = RI[n] ?? 0;
  const cr = ri ? ci/ri : 0;
  const ranking = weights.map((w,i)=>({i,w})).sort((a,b)=>b.w-a.w);
  const ranks = Array(n);
  ranking.forEach((x,rank)=>ranks[x.i]=rank+1);
  return {rowGM,weights,lambdaI,lambdaMax,ci,ri,cr,ranks};
}

function buildExpertMatrix(respondentIndex) {
  const A = Array.from({length:state.n},()=>Array(state.n).fill(1));
  for (let i=0;i<state.n;i++) {
    for (let j=i+1;j<state.n;j++) {
      const arr = state.judgments[pairKey(i,j)] || [];
      const v = Number(arr[respondentIndex]);
      if (!(v > 0)) return null;
      A[i][j] = v;
      A[j][i] = 1/v;
    }
  }
  return A;
}

function calculateExpertDiagnostics() {
  if (!state.result) { state.expertDiagnostics = null; return; }
  const experts = [];
  for (let r=0;r<state.respondents;r++) {
    const A = buildExpertMatrix(r);
    if (!A) continue;
    const m = matrixMetrics(A);
    experts.push({respondent:r+1, ...m});
  }
  const pairs=[];
  for (let i=0;i<state.n;i++) {
    for (let j=i+1;j<state.n;j++) {
      const vals=(state.judgments[pairKey(i,j)]||[]).map(Number).filter(v=>v>0);
      const n=vals.length;
      const logVals=vals.map(Math.log);
      const meanLog=logVals.reduce((a,b)=>a+b,0)/n;
      const gm=Math.exp(meanLog);
      const logVar=n>1 ? logVals.reduce((s,v)=>s+(v-meanLog)**2,0)/(n-1) : 0;
      const logSD=Math.sqrt(logVar);
      const gsd=Math.exp(logSD);
      const mean=vals.reduce((a,b)=>a+b,0)/n;
      const sd=n>1 ? Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/(n-1)) : 0;
      const cv=mean ? sd/mean : 0;
      const level=gsd<=1.25?'Low':gsd<=1.50?'Moderate':'High';
      pairs.push({i,j,gm,gsd,cv,min:Math.min(...vals),max:Math.max(...vals),level});
    }
  }
  state.expertDiagnostics={experts,pairs};
}

function renderExpertDiagnostics() {
  const d=state.expertDiagnostics;
  if (!d || !d.experts.length) {
    $('expertEmpty').classList.remove('hidden');
    $('expertContent').classList.add('hidden');
    $('expertImgBtn').disabled=true;
    $('disagreementImgBtn').disabled=true;
    return;
  }
  $('expertEmpty').classList.add('hidden');
  $('expertContent').classList.remove('hidden');
  $('expertImgBtn').disabled=false;
  $('disagreementImgBtn').disabled=false;
  const acceptable=d.experts.filter(x=>x.cr<=0.10).length;
  const meanCR=d.experts.reduce((s,x)=>s+x.cr,0)/d.experts.length;
  const highPairs=d.pairs.filter(x=>x.level==='High').length;
  const moderatePairs=d.pairs.filter(x=>x.level==='Moderate').length;
  $('expertSummary').innerHTML=`
    <div class="summary-card ${acceptable===d.experts.length?'success':'warn'}"><span>Experts acceptable</span><strong>${acceptable}/${d.experts.length}</strong></div>
    <div class="summary-card"><span>Mean individual CR</span><strong>${fmt(meanCR,4)}</strong></div>
    <div class="summary-card ${highPairs?'danger':'success'}"><span>High-disagreement pairs</span><strong>${highPairs}</strong></div>
    <div class="summary-card ${moderatePairs?'warn':''}"><span>Moderate-disagreement pairs</span><strong>${moderatePairs}</strong></div>`;
  let et='<thead><tr><th>Respondent</th><th>λmax</th><th>CI</th><th>RI</th><th>CR</th><th>Status</th></tr></thead><tbody>';
  d.experts.forEach(x=>{const ok=x.cr<=.10; et+=`<tr><td>R${x.respondent}</td><td>${fmt(x.lambdaMax,4)}</td><td>${fmt(x.ci,4)}</td><td>${fmt(x.ri,2)}</td><td><b>${fmt(x.cr,4)}</b></td><td><span class="status-pill ${ok?'ok':'missing'}">${ok?'Acceptable':'Revise'}</span></td></tr>`});
  et+='</tbody>'; $('expertTable').innerHTML=et;
  const maxCR=Math.max(.20,...d.experts.map(x=>x.cr));
  $('expertCrBars').innerHTML=d.experts.map(x=>{
    const ok=x.cr<=.10; const width=Math.min(100,x.cr/maxCR*100);
    return `<div class="mini-bar-row"><b>R${x.respondent}</b><div class="mini-bar-track"><div class="mini-bar-threshold"></div><div class="mini-bar-fill" style="width:${width}%;background:${ok?'linear-gradient(90deg,#008c95,#55d1b2)':'linear-gradient(90deg,#e84a5f,#f3a7bd)'}"></div></div><div class="mini-bar-value">${fmt(x.cr,3)}</div></div>`;
  }).join('');
  let dt='<thead><tr><th>Criterion A</th><th>Criterion B</th><th>Group GM</th><th>GSD</th><th>CV</th><th>Min</th><th>Max</th><th>Disagreement</th></tr></thead><tbody>';
  d.pairs.slice().sort((a,b)=>b.gsd-a.gsd).forEach(x=>{ const cls=x.level==='Low'?'disagreement-low':x.level==='Moderate'?'disagreement-moderate':'disagreement-high'; dt+=`<tr><td style="text-align:left">${escapeHtml(state.indicators[x.i])}</td><td style="text-align:left">${escapeHtml(state.indicators[x.j])}</td><td>${fmt(x.gm,4)}</td><td>${fmt(x.gsd,3)}</td><td>${(x.cv*100).toFixed(1)}%</td><td>${fmt(x.min,3)}</td><td>${fmt(x.max,3)}</td><td class="${cls}">${x.level}</td></tr>`; });
  dt+='</tbody>'; $('disagreementTable').innerHTML=dt;
}

function adjustedWeights(base, index, factor) {
  const out=base.slice();
  const old=base[index];
  let target=Math.max(0.000001,Math.min(0.999999,old*factor));
  if (old>=0.999999) return out;
  const scale=(1-target)/(1-old);
  for (let i=0;i<out.length;i++) out[i]=i===index?target:out[i]*scale;
  const sum=out.reduce((a,b)=>a+b,0);
  return out.map(v=>v/sum);
}
function ranksFromWeights(weights) {
  const ranks=Array(weights.length);
  weights.map((w,i)=>({w,i})).sort((a,b)=>b.w-a.w).forEach((x,k)=>ranks[x.i]=k+1);
  return ranks;
}
function computeSensitivity() {
  if (!state.result) { state.sensitivity=null; return; }
  const pct=clamp($('sensitivityPct')?.value||10,1,90)/100;
  const rows=state.result.weights.map((w,i)=>{
    const low=adjustedWeights(state.result.weights,i,1-pct);
    const high=adjustedWeights(state.result.weights,i,1+pct);
    const lowRanks=ranksFromWeights(low), highRanks=ranksFromWeights(high);
    const baseRank=state.result.ranks[i];
    const maxShift=Math.max(Math.abs(lowRanks[i]-baseRank),Math.abs(highRanks[i]-baseRank));
    return {i,baseWeight:w,lowWeight:low[i],highWeight:high[i],baseRank,lowRank:lowRanks[i],highRank:highRanks[i],stable:maxShift===0,maxShift,lowAll:low,highAll:high};
  });
  state.sensitivity={pct,rows};
}
function renderSensitivity() {
  if (!state.result) {
    $('sensitivityEmpty').classList.remove('hidden'); $('sensitivityContent').classList.add('hidden'); $('sensitivityImgBtn').disabled=true; return;
  }
  $('sensitivityEmpty').classList.add('hidden'); $('sensitivityContent').classList.remove('hidden'); $('sensitivityImgBtn').disabled=false;
  const sel=$('sensitivityCriterion');
  const previous=Number(sel.value)||0;
  sel.innerHTML=state.indicators.map((x,i)=>`<option value="${i}" ${i===Math.min(previous,state.n-1)?'selected':''}>${escapeHtml(x)}</option>`).join('');
  computeSensitivity();
  const s=state.sensitivity; const stable=s.rows.filter(x=>x.stable).length; const pctStable=100*stable/state.n;
  $('sensitivityScore').innerHTML=`<b>${pctStable.toFixed(0)}% rank-stable</b><span>${stable} of ${state.n} criteria keep their own rank under ±${Math.round(s.pct*100)}% weight perturbation.</span>`;
  $('sensitivityTag').textContent=`±${Math.round(s.pct*100)}% perturbation`;
  let st='<thead><tr><th>Criterion</th><th>Original Weight</th><th>− Weight</th><th>+ Weight</th><th>Original Rank</th><th>Rank at −</th><th>Rank at +</th><th>Stability</th></tr></thead><tbody>';
  s.rows.forEach(x=>{st+=`<tr><td style="text-align:left">${escapeHtml(state.indicators[x.i])}</td><td>${(x.baseWeight*100).toFixed(2)}%</td><td>${(x.lowWeight*100).toFixed(2)}%</td><td>${(x.highWeight*100).toFixed(2)}%</td><td>${x.baseRank}</td><td>${x.lowRank}</td><td>${x.highRank}</td><td><span class="stability-pill ${x.stable?'stable':'shift'}">${x.stable?'Stable':`Shift ≤ ${x.maxShift}`}</span></td></tr>`});
  st+='</tbody>'; $('sensitivityTable').innerHTML=st;
  renderSensitivityChart();
}
function renderSensitivityChart() {
  if (!state.sensitivity) return;
  const idx=clamp($('sensitivityCriterion').value||0,0,state.n-1);
  const row=state.sensitivity.rows[idx];
  const max=Math.max(...row.lowAll,...state.result.weights,...row.highAll);
  let html=`<div class="scenario-legend"><span><i style="background:#e56b8d"></i>Criterion ${escapeHtml(state.indicators[idx])} decreased</span><span><i style="background:#0b63ce"></i>Original</span><span><i style="background:#008c95"></i>Criterion ${escapeHtml(state.indicators[idx])} increased</span></div>`;
  state.indicators.forEach((name,i)=>{html+=`<div class="scenario-row"><b>${escapeHtml(name)}</b><div class="scenario-bars"><div class="scenario-bar low" style="width:${100*row.lowAll[i]/max}%"></div><div class="scenario-bar base" style="width:${100*state.result.weights[i]/max}%"></div><div class="scenario-bar high" style="width:${100*row.highAll[i]/max}%"></div></div><span>${(state.result.weights[i]*100).toFixed(2)}%</span></div>`});
  $('sensitivityChart').innerHTML=html;
}

function safeDiv(a,b) { return b ? a/b : 0; }
function calculateValidation() {
  const tp=Math.max(0,Number($('valTP').value)||0), fp=Math.max(0,Number($('valFP').value)||0), fn=Math.max(0,Number($('valFN').value)||0), tn=Math.max(0,Number($('valTN').value)||0);
  const total=tp+fp+fn+tn;
  if (!total) return toast('Enter at least one validation observation.');
  const accuracy=safeDiv(tp+tn,total), precision=safeDiv(tp,tp+fp), recall=safeDiv(tp,tp+fn), specificity=safeDiv(tn,tn+fp), f1=safeDiv(2*precision*recall,precision+recall);
  const po=accuracy;
  const pe=safeDiv((tp+fp)*(tp+fn)+(fn+tn)*(fp+tn),total*total);
  const kappa=(1-pe)?(po-pe)/(1-pe):0;
  const aucRaw=$('valAUC').value.trim(); const auc=aucRaw===''?null:Math.min(1,Math.max(0,Number(aucRaw)));
  state.validation={tp,fp,fn,tn,total,accuracy,precision,recall,specificity,f1,kappa,auc};
  renderValidation();
  toast('Validation metrics calculated.');
}
function validationQuality(v) {
  if (v.auc!==null) return v.auc>=.9?'Excellent':v.auc>=.8?'Very good':v.auc>=.7?'Acceptable':v.auc>=.6?'Weak':'Poor';
  return v.accuracy>=.9?'Excellent':v.accuracy>=.8?'Very good':v.accuracy>=.7?'Acceptable':v.accuracy>=.6?'Weak':'Poor';
}
function renderValidation() {
  const v=state.validation;
  if (!v) { $('validationResults').classList.add('hidden'); $('validationImgBtn').disabled=true; return; }
  $('validationResults').classList.remove('hidden'); $('validationImgBtn').disabled=false;
  const metrics=[['Accuracy',v.accuracy],['Precision',v.precision],['Recall / Sensitivity',v.recall],['Specificity',v.specificity],['F1-score',v.f1],['Cohen’s κ',v.kappa]];
  if (v.auc!==null) metrics.push(['ROC-AUC',v.auc]);
  $('validationMetrics').innerHTML=metrics.map(([k,x])=>`<div class="summary-card"><span>${k}</span><strong>${x.toFixed(3)}</strong></div>`).join('');
  $('confusionMatrix').innerHTML=`<div class="cm-cell cm-head">Observed ↓ / Predicted →</div><div class="cm-cell cm-head">Susceptible</div><div class="cm-cell cm-head">Non-susceptible</div><div class="cm-cell cm-side">Observed hazard</div><div class="cm-cell cm-tp"><small>True Positive</small><strong>${v.tp}</strong><span>TP</span></div><div class="cm-cell cm-fn"><small>False Negative</small><strong>${v.fn}</strong><span>FN</span></div><div class="cm-cell cm-side">No observed hazard</div><div class="cm-cell cm-fp"><small>False Positive</small><strong>${v.fp}</strong><span>FP</span></div><div class="cm-cell cm-tn"><small>True Negative</small><strong>${v.tn}</strong><span>TN</span></div>`;
  const quality=validationQuality(v);
  $('validationInterpretation').innerHTML=`<span class="quality-badge">${quality} validation performance</span><h4>Independent validation summary</h4><p>The validation set contains <b>${v.total}</b> observations. The model correctly classifies <b>${(v.accuracy*100).toFixed(1)}%</b> of them. It detects <b>${(v.recall*100).toFixed(1)}%</b> of observed hazard occurrences (recall) and correctly identifies <b>${(v.specificity*100).toFixed(1)}%</b> of non-hazard observations (specificity).</p><p>${v.auc!==null?`The supplied ROC-AUC is <b>${v.auc.toFixed(3)}</b>. `:''}Cohen’s κ is <b>${v.kappa.toFixed(3)}</b>, providing a chance-corrected agreement measure. Report the validation sampling design, threshold/classification rule, and whether the inventory was independent from model construction in any publication.</p>`;
}
function clearValidation() {
  ['valTP','valFP','valFN','valTN','valAUC'].forEach(id=>$(id).value=''); state.validation=null; renderValidation(); toast('Validation inputs cleared.');
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

  const metrics = matrixMetrics(A);
  state.result = {A,...metrics};
  calculateExpertDiagnostics();
  computeSensitivity();
  renderResults();
  renderExpertDiagnostics();
  renderSensitivity();
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
  state.expertDiagnostics=null; state.sensitivity=null;
  if ($('expertEmpty')) renderExpertDiagnostics();
  if ($('sensitivityEmpty')) renderSensitivity();
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
  state.judgments={}; state.result=null; state.expertDiagnostics=null; state.sensitivity=null; state.validation=null;
  ['valTP','valFP','valFN','valTN','valAUC'].forEach(id=>{ if($(id)) $(id).value=''; });
  $('hazardName').value=state.hazard; $('indicatorCount').value=8; $('respondentCount').value=6;
  renderIndicatorInputs(); updateCounts(); renderJudgmentTable(); clearResults();
  toast('Calculator reset.');
}

function saveLocal() {
  syncSetupFromInputs();
  const payload = {hazard:state.hazard,n:state.n,respondents:state.respondents,indicators:state.indicators,descriptions:state.descriptions,judgments:state.judgments,validation:state.validation};
  localStorage.setItem('ahp-calculator-refath-v2', JSON.stringify(payload));
  toast('Saved in this browser.');
}

function loadLocal() {
  const raw = localStorage.getItem('ahp-calculator-refath-v2') || localStorage.getItem('ahp-calculator-refath-v1');
  if (!raw) return toast('No saved calculator found in this browser.');
  try {
    const x = JSON.parse(raw);
    state.hazard=x.hazard||'Hazard Susceptibility'; state.n=clamp(x.n,3,25); state.respondents=clamp(x.respondents,2,20);
    state.indicators=Array.isArray(x.indicators)?x.indicators.slice(0,state.n):defaultIndicators(state.n);
    state.descriptions=Array.isArray(x.descriptions)?x.descriptions.slice(0,state.n):Array(state.n).fill('');
    state.judgments=x.judgments||{}; state.result=null; state.validation=x.validation||null;
    $('hazardName').value=state.hazard; $('indicatorCount').value=state.n; $('respondentCount').value=state.respondents;
    renderIndicatorInputs(); updateCounts(); renderJudgmentTable(); clearResults(); renderValidation();
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


function createExpertCRCanvas(scale=3) {
  const d=state.expertDiagnostics; if(!d) return null;
  const width=1300, rowH=48, height=190+d.experts.length*rowH+60;
  const c=document.createElement('canvas'); c.width=width*scale; c.height=height*scale; const ctx=c.getContext('2d'); ctx.scale(scale,scale);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#102A43';ctx.font='700 28px Arial';ctx.fillText(`${state.hazard} - Individual Expert Consistency`,45,45);ctx.font='15px Arial';ctx.fillStyle='#617789';ctx.fillText(`AHP respondent-level CR diagnostic • acceptable when CR ≤ 0.10`,45,73);
  const x0=220, bw=800, max=Math.max(.20,...d.experts.map(x=>x.cr));
  ctx.strokeStyle='#e1e8ef';ctx.beginPath();ctx.moveTo(x0+bw*(.10/max),105);ctx.lineTo(x0+bw*(.10/max),height-45);ctx.stroke();ctx.fillStyle='#b21f49';ctx.font='13px Arial';ctx.fillText('CR = 0.10 threshold',x0+bw*(.10/max)+6,103);
  d.experts.forEach((x,k)=>{const y=125+k*rowH;ctx.fillStyle='#173b5d';ctx.font='700 15px Arial';ctx.fillText(`Respondent R${x.respondent}`,45,y+18);drawRoundRect(ctx,x0,y,bw,20,10,'#edf1f5',null);const w=Math.max(3,bw*x.cr/max);const g=ctx.createLinearGradient(x0,y,x0+w,y);if(x.cr<=.10){g.addColorStop(0,'#008c95');g.addColorStop(1,'#55d1b2')}else{g.addColorStop(0,'#e84a5f');g.addColorStop(1,'#f3a7bd')}drawRoundRect(ctx,x0,y,w,20,10,g,null);ctx.fillStyle=x.cr<=.10?'#087a58':'#b21f49';ctx.font='700 15px Arial';ctx.fillText(`${x.cr.toFixed(4)}  ${x.cr<=.10?'Acceptable':'Revise'}`,1040,y+17)});
  ctx.fillStyle='#6A7B8E';ctx.font='13px Arial';ctx.fillText('Generated from the AHP Hazard Weight Calculator',45,height-22);return c;
}
function createDisagreementCanvas(scale=3) {
  const d=state.expertDiagnostics; if(!d)return null; const top=d.pairs.slice().sort((a,b)=>b.gsd-a.gsd).slice(0,Math.min(20,d.pairs.length));
  const width=1500,rowH=48,height=185+top.length*rowH+60,c=document.createElement('canvas');c.width=width*scale;c.height=height*scale;const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#102A43';ctx.font='700 28px Arial';ctx.fillText(`${state.hazard} - Expert Disagreement Screening`,45,43);ctx.font='15px Arial';ctx.fillStyle='#617789';ctx.fillText('Top criterion pairs ranked by geometric standard deviation (GSD)',45,70);
  const cols=[45,370,695,850,990,1130,1270];['Criterion A','Criterion B','Group GM','GSD','CV','Range','Level'].forEach((h,i)=>{ctx.fillStyle='#15455c';ctx.font='700 14px Arial';ctx.fillText(h,cols[i],115)});
  top.forEach((x,k)=>{const y=135+k*rowH;ctx.fillStyle=k%2?'#f7fafc':'#fff';ctx.fillRect(35,y-10,width-70,rowH);ctx.fillStyle='#173b5d';ctx.font='14px Arial';ctx.fillText(fitText(ctx,state.indicators[x.i],290),cols[0],y+15);ctx.fillText(fitText(ctx,state.indicators[x.j],290),cols[1],y+15);ctx.fillText(x.gm.toFixed(3),cols[2],y+15);ctx.fillText(x.gsd.toFixed(3),cols[3],y+15);ctx.fillText(`${(x.cv*100).toFixed(1)}%`,cols[4],y+15);ctx.fillText(`${x.min.toFixed(2)}–${x.max.toFixed(2)}`,cols[5],y+15);const color=x.level==='Low'?'#087a58':x.level==='Moderate'?'#7a5200':'#b21f49';ctx.fillStyle=color;ctx.font='700 14px Arial';ctx.fillText(x.level,cols[6],y+15)});ctx.fillStyle='#6A7B8E';ctx.font='13px Arial';ctx.fillText('GSD bands are practical diagnostics, not universal inferential cutoffs.',45,height-22);return c;
}
function createSensitivityCanvas(scale=3) {
  if(!state.sensitivity)return null; const s=state.sensitivity,width=1500,rowH=50,height=190+state.n*rowH+60,c=document.createElement('canvas');c.width=width*scale;c.height=height*scale;const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#102A43';ctx.font='700 28px Arial';ctx.fillText(`${state.hazard} - AHP Weight Sensitivity`,45,43);ctx.font='15px Arial';ctx.fillStyle='#617789';ctx.fillText(`Rank response when each criterion weight is perturbed by ±${Math.round(s.pct*100)}%`,45,70);const cols=[45,450,650,820,990,1140,1280];['Criterion','Base weight','Rank','Rank at −','Rank at +','Max shift','Status'].forEach((h,i)=>{ctx.fillStyle='#15455c';ctx.font='700 14px Arial';ctx.fillText(h,cols[i],115)});s.rows.forEach((x,k)=>{const y=135+k*rowH;ctx.fillStyle=k%2?'#f7fafc':'#fff';ctx.fillRect(35,y-10,width-70,rowH);ctx.fillStyle='#173b5d';ctx.font='14px Arial';ctx.fillText(fitText(ctx,state.indicators[x.i],365),cols[0],y+16);ctx.fillText(`${(x.baseWeight*100).toFixed(2)}%`,cols[1],y+16);ctx.fillText(String(x.baseRank),cols[2],y+16);ctx.fillText(String(x.lowRank),cols[3],y+16);ctx.fillText(String(x.highRank),cols[4],y+16);ctx.fillText(String(x.maxShift),cols[5],y+16);ctx.fillStyle=x.stable?'#087a58':'#b21f49';ctx.font='700 14px Arial';ctx.fillText(x.stable?'Stable':'Rank shift',cols[6],y+16)});ctx.fillStyle='#6A7B8E';ctx.font='13px Arial';ctx.fillText('All non-perturbed weights are proportionally rescaled so total weight remains 1.',45,height-22);return c;
}
function createValidationCanvas(scale=3) {
  const v=state.validation;if(!v)return null;const width=1400,height=820,c=document.createElement('canvas');c.width=width*scale;c.height=height*scale;const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#102A43';ctx.font='700 29px Arial';ctx.fillText(`${state.hazard} - Hazard Validation Summary`,50,48);ctx.font='15px Arial';ctx.fillStyle='#617789';ctx.fillText(`Independent observed outcomes • N = ${v.total}${v.auc!==null?` • ROC-AUC = ${v.auc.toFixed(3)}`:''}`,50,77);
  const x=55,y=145,labelW=210,cw=300,ch=190;const drawCell=(xx,yy,w,h,bg,title,value)=>{ctx.fillStyle=bg;ctx.fillRect(xx,yy,w,h);ctx.fillStyle='#173b5d';ctx.font='700 15px Arial';ctx.fillText(title,xx+18,yy+32);ctx.font='700 38px Arial';ctx.fillText(String(value),xx+18,yy+88)};drawCell(x+labelW,y,cw,70,'#dff3f4','Predicted: Susceptible','');drawCell(x+labelW+cw,y,cw,70,'#dff3f4','Predicted: Non-susceptible','');drawCell(x,y+70,labelW,ch,'#edf3f8','Observed hazard','');drawCell(x,y+70+ch,labelW,ch,'#edf3f8','No observed hazard','');drawCell(x+labelW,y+70,cw,ch,'#9be1be','True Positive (TP)',v.tp);drawCell(x+labelW+cw,y+70,cw,ch,'#f3a7bd','False Negative (FN)',v.fn);drawCell(x+labelW,y+70+ch,cw,ch,'#ffd166','False Positive (FP)',v.fp);drawCell(x+labelW+cw,y+70+ch,cw,ch,'#9bcff1','True Negative (TN)',v.tn);
  const mx=960,my=150;ctx.fillStyle='#173b5d';ctx.font='700 19px Arial';ctx.fillText('Validation Metrics',mx,my);const metrics=[['Accuracy',v.accuracy],['Precision',v.precision],['Recall',v.recall],['Specificity',v.specificity],['F1-score',v.f1],['Cohen κ',v.kappa]];if(v.auc!==null)metrics.push(['ROC-AUC',v.auc]);metrics.forEach((m,k)=>{ctx.fillStyle='#617789';ctx.font='14px Arial';ctx.fillText(m[0],mx,my+45+k*62);ctx.fillStyle='#0a5d72';ctx.font='700 25px Arial';ctx.fillText(m[1].toFixed(3),mx+180,my+45+k*62)});ctx.fillStyle='#6A7B8E';ctx.font='13px Arial';ctx.fillText('Generated from the AHP Hazard Weight Calculator • Report validation sampling and thresholding in publications.',50,height-28);return c;
}
function downloadExpertImage(){downloadCanvas(createExpertCRCanvas(3),`AHP_${state.hazard.replace(/[^a-z0-9]+/gi,'_')}_expert_CR.png`)}
function downloadDisagreementImage(){downloadCanvas(createDisagreementCanvas(3),`AHP_${state.hazard.replace(/[^a-z0-9]+/gi,'_')}_expert_disagreement.png`)}
function downloadSensitivityImage(){computeSensitivity();renderSensitivity();downloadCanvas(createSensitivityCanvas(3),`AHP_${state.hazard.replace(/[^a-z0-9]+/gi,'_')}_sensitivity.png`)}
function downloadValidationImage(){downloadCanvas(createValidationCanvas(3),`AHP_${state.hazard.replace(/[^a-z0-9]+/gi,'_')}_validation.png`)}

// Events
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  // Before opening Judgments, force the table to match the current selectors exactly.
  if (t.dataset.tab === 'judgments') rebuildIndicatorsIfCountChanged();
  switchTab(t.dataset.tab);
}));
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
$('expertImgBtn').addEventListener('click', downloadExpertImage);
$('disagreementImgBtn').addEventListener('click', downloadDisagreementImage);
$('sensitivityImgBtn').addEventListener('click', downloadSensitivityImage);
$('sensitivityPct').addEventListener('change', ()=>{computeSensitivity();renderSensitivity();});
$('sensitivityCriterion').addEventListener('change', renderSensitivityChart);
$('calculateValidationBtn').addEventListener('click', calculateValidation);
$('clearValidationBtn').addEventListener('click', clearValidation);
$('validationImgBtn').addEventListener('click', downloadValidationImage);
$('printBtn').addEventListener('click', ()=>window.print());

// Initial render
state.indicators = defaultIndicators(state.n);
state.descriptions = Array(state.n).fill('');
renderIndicatorInputs();
updateCounts();
renderJudgmentTable();
renderExpertDiagnostics();
renderSensitivity();
renderValidation();
