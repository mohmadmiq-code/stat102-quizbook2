

function xmur3(str){
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function(){
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
}
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
function seededRand(seedStr){
  const seed = xmur3(seedStr)();
  return mulberry32(seed);
}
function randInt(r, lo, hi){ return Math.floor(r()*(hi-lo+1))+lo; }

const STATE_KEY = "stat102_3_2_state_v2";
let state = loadState() || { currentIndex: 0, answers: {}, grading: {}, variants: {}, attempts: {}, saveAttempts: {}, locks: {}, outcomes: {} };
state.attempts = state.attempts || {};
state.saveAttempts = state.saveAttempts || {};
state.locks = state.locks || {};
state.outcomes = state.outcomes || {};
state.aiHelpUsage = state.aiHelpUsage || {};
state.aiStartedAt = state.aiStartedAt || {};
function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
function loadState(){ try{ return JSON.parse(localStorage.getItem(STATE_KEY)); }catch(e){ return null; } }
function resetAll(){
  state.currentIndex = 0;
  state.answers = {};
  state.grading = {};
  state.attempts = {};
  state.saveAttempts = {};
  state.locks = {};
  state.outcomes = {};
  state.aiHelpUsage = {};
  state.aiStartedAt = {};
  state.variants = state.variants || {};
  (TEMPLATES||[]).forEach(t=>{
    state.variants[t.id] = (state.variants[t.id]||0) + 1;
  });
  saveState();
  location.reload();
}
function _ensureAIHelpUsage(){ state.aiHelpUsage = state.aiHelpUsage || {}; }
function _setAIHelpUsage(qid, bi, val){
  _ensureAIHelpUsage();
  if(!state.aiHelpUsage[qid]) state.aiHelpUsage[qid] = {};
  state.aiHelpUsage[qid][bi] = !!val;
  saveState();
}
function _getAIHelpUsage(qid, bi){
  _ensureAIHelpUsage();
  return !!(state.aiHelpUsage[qid] && state.aiHelpUsage[qid][bi]);
}
function _touchAISessionStart(qid, bi){
  state.aiStartedAt = state.aiStartedAt || {};
  if(!state.aiStartedAt[qid]) state.aiStartedAt[qid] = {};
  if(!state.aiStartedAt[qid][bi]) state.aiStartedAt[qid][bi] = Date.now();
}
function _getAndResetAISessionTimeSec(qid, bi){
  state.aiStartedAt = state.aiStartedAt || {};
  const started = state.aiStartedAt[qid] && state.aiStartedAt[qid][bi] ? state.aiStartedAt[qid][bi] : Date.now();
  const spent = Math.max(1, Math.round((Date.now() - started) / 1000));
  if(!state.aiStartedAt[qid]) state.aiStartedAt[qid] = {};
  state.aiStartedAt[qid][bi] = Date.now();
  saveState();
  return spent;
}
function _questionSkillId(q){
  return q && q.id ? String(q.id) : "unknown_skill";
}
function _branchDifficulty(b){
  return String((b && (b.difficulty || b.level || b.name)) || "medium");
}
function _renderAIInference(branchCard, info){
  if(!branchCard || !info) return;
  let panel = branchCard.querySelector(".aiInferencePanel");
  if(!panel){
    panel = el("div",{
      class:"aiInferencePanel",
      style:"margin-top:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;color:#0f172a;font-weight:800"
    },[]);
    branchCard.appendChild(panel);
  }
  const masteryProbability = Math.round(Number(info.mastery_probability || 0) * 100);
  const skillMastery = Math.round(Number(info.skill_mastery || 0) * 100);
  panel.innerHTML = `
    <div style="font-weight:900;margin-bottom:4px">تحليل تعلّم داخلي</div>
    <div style="font-size:13px;color:#334155">mastery probability: ${masteryProbability}%</div>
    <div style="font-size:13px;color:#334155">current skill mastery: ${skillMastery}%</div>
    <div style="font-size:13px;color:#334155">recommended support: ${escapeHtml(info.recommended_support || "continue_practice")}</div>
  `;
}
function _runAdaptiveInference(payload, branchCard){
  if(!window.AdaptiveLearning) return;
  const event = window.AdaptiveLearning.collectStudentEvent(payload);
  const bkt = window.AdaptiveLearning.updateBKT(payload.skill_id, payload.is_correct);
  const prediction = window.AdaptiveLearning.predictMastery({
    difficulty: payload.difficulty,
    attempts_count: payload.attempts_count,
    used_help: payload.used_help,
    time_spent_sec: payload.time_spent_sec,
    showed_solution: payload.showed_solution,
    bkt_mastery: bkt.mastery
  });
  _renderAIInference(branchCard, {
    mastery_probability: prediction.probability_mastered,
    skill_mastery: bkt.mastery,
    recommended_support: prediction.recommended_support
  });
  return event;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function normalizeText(s){ if(s==null) return ""; return String(s).trim().replace(/\s+/g," ").replace(/[٪%]/g,"%"); }
function nearlyEqual(a,b,eps=1e-2){ if(a==null||b==null) return false; if(Number.isNaN(a)||Number.isNaN(b)) return false; return Math.abs(a-b)<=eps; }
function formatNumber(x){
  const n = Number(x);
  if(Number.isNaN(n)) return String(x);
  if(Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return (Math.round(n*100)/100).toFixed(2);
}

function fmt2(x){
  const n=Number(x);
  if(!isFinite(n)) return String(x??'');
  return n.toFixed(2);
}

function typesetMath(container){
  const run = ()=>{
    if(window.renderMathInElement){
      window.renderMathInElement(container, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "\\[", right: "\\]", display: true},
          {left: "\\(", right: "\\)", display: false}
        ],
        throwOnError: false
      });
      return true;
    }
    return false;
  };
  if(!run()){
    let tries=0;
    const t=setInterval(()=>{
      tries++;
      if(run() || tries>30) clearInterval(t);
    }, 120);
  }
}

function storeAnswer(qid, bIndex, key, value){
  if(!state.answers[qid]) state.answers[qid] = {};
  if(!state.answers[qid][bIndex]) state.answers[qid][bIndex] = {};
  state.answers[qid][bIndex][key] = value;
  saveState();
}

function _ensureAttempts(){
  state.attempts = state.attempts || {};
}
function _incAttempt(qid, bi, key){
  _ensureAttempts();
  if(!state.attempts[qid]) state.attempts[qid] = {};
  if(!state.attempts[qid][bi]) state.attempts[qid][bi] = {};
  state.attempts[qid][bi][key] = (state.attempts[qid][bi][key] || 0) + 1;
  saveState();
  return state.attempts[qid][bi][key];
}
function _clearAttempt(qid, bi, key){
  if(state.attempts && state.attempts[qid] && state.attempts[qid][bi] && state.attempts[qid][bi][key]!=null){
    delete state.attempts[qid][bi][key];
    saveState();
  }
}

function _ensureSaveAttempts(){
  state.saveAttempts = state.saveAttempts || {};
}
function _incSaveAttempt(qid, bi){
  _ensureSaveAttempts();
  if(!state.saveAttempts[qid]) state.saveAttempts[qid] = {};
  state.saveAttempts[qid][bi] = (state.saveAttempts[qid][bi] || 0) + 1;
  saveState();
  return state.saveAttempts[qid][bi];
}
function _getSaveAttempt(qid, bi){
  _ensureSaveAttempts();
  return (state.saveAttempts[qid] && state.saveAttempts[qid][bi]) ? state.saveAttempts[qid][bi] : 0;
}
function _clearSaveAttempt(qid, bi){
  if(state.saveAttempts && state.saveAttempts[qid] && state.saveAttempts[qid][bi]!=null){
    delete state.saveAttempts[qid][bi];
    saveState();
  }
}

function _ensureLocks(){
  state.locks = state.locks || {};
}
function _isBranchLocked(qid, bi){
  _ensureLocks();
  return !!(state.locks[qid] && state.locks[qid][bi]);
}
function _setBranchLocked(qid, bi, locked){
  _ensureLocks();
  if(!state.locks[qid]) state.locks[qid] = {};
  if(locked) state.locks[qid][bi] = true;
  else delete state.locks[qid][bi];
  saveState();
}

function _ensureOutcomes(){ state.outcomes = state.outcomes || {}; }
function _setOutcome(qid, bi, val){
  _ensureOutcomes();
  if(!state.outcomes[qid]) state.outcomes[qid] = {};
  if(val==null) delete state.outcomes[qid][bi];
  else state.outcomes[qid][bi] = val;
  saveState();
}
function _getOutcome(qid, bi){
  _ensureOutcomes();
  return (state.outcomes[qid] && state.outcomes[qid][bi]) ? state.outcomes[qid][bi] : null;
}

function _clearMarks(inp){
  if(!inp || !inp.classList) return;
  inp.classList.remove("is-wrong","is-wrong-strong","is-right");
}
function _mark(inp, kind){
  _clearMarks(inp);
  if(!inp || !inp.classList) return;
  if(kind==="wrong1") inp.classList.add("is-wrong");
  else if(kind==="wrong2") inp.classList.add("is-wrong-strong");
  else if(kind==="right") inp.classList.add("is-right");
}
function _getBranch(qid, bi){
  
  BANK = buildBank();
  const q = BANK.find(x=>x.id===qid);
  if(!q) return null;
  return q.branches && q.branches[bi]!=null ? q.branches[bi] : null;
}
function instantCheckInput(qid, bi, key, inp){
  if(!inp) return;
  const raw = (inp.value ?? "").toString().trim();
  if(raw===""){
    _clearMarks(inp);
    _clearAttempt(qid, bi, key);
    return;
  }
  const b = _getBranch(qid, bi);
  if(!b || !b.answers) return;
  const correct = b.answers[key];
  if(correct===undefined || correct===null) return;

  const part = (b.parts||[]).find(p=>p.key===key) || {};
  let ok = false;
  if(part.type==="mcq" || part.type==="text"){
    ok = normalizeText(raw) === normalizeText(correct);
  }else{
    ok = nearlyEqual(Number(raw), Number(correct), 1e-2);
  }

  if(ok){
    _mark(inp, "right");
    _clearAttempt(qid, bi, key);
  }else{
    const n = _incAttempt(qid, bi, key);
    _mark(inp, n>=2 ? "wrong2" : "wrong1");
    
  }
}

function bindInlineInputs(root, qid, bi){
  if(!root) return;
  const nodes = root.querySelectorAll("input.inlineInput, textarea.inlineInput");
  nodes.forEach(inp=>{
    const key = inp.getAttribute("data-key");
    if(!key) return;
    const stored = (state.answers[qid] && state.answers[qid][bi]) ? state.answers[qid][bi][key] : "";
    if(inp.type==="number"){
      inp.value = (stored ?? "");
    }else{
      inp.value = (stored ?? "");
    }
    inp.dataset.qid = qid;
    inp.dataset.bi = String(bi);
    if(_isBranchLocked(qid, bi)){
      inp.disabled = true;
    }
    const handler = ()=>{  };
    inp.addEventListener("input", ()=>{ _clearMarks(inp); handler(); });
    inp.addEventListener("change", ()=>{ _clearMarks(inp); handler(); });
    inp.addEventListener("blur", ()=>{ handler(); });
  });
}
function clearAnswersForQuestion(qid){
  if(state.answers[qid]) delete state.answers[qid];
  if(state.grading[qid]) delete state.grading[qid];
  if(state.attempts && state.attempts[qid]) delete state.attempts[qid];
  if(state.saveAttempts && state.saveAttempts[qid]) delete state.saveAttempts[qid];
  if(state.locks && state.locks[qid]) delete state.locks[qid];
  if(state.outcomes && state.outcomes[qid]) delete state.outcomes[qid];
  if(state.aiHelpUsage && state.aiHelpUsage[qid]) delete state.aiHelpUsage[qid];
  if(state.aiStartedAt && state.aiStartedAt[qid]) delete state.aiStartedAt[qid];
  saveState();
}
function getVariant(qid){ if(state.variants[qid]==null) state.variants[qid]=0; return state.variants[qid]; }
function bumpVariant(qid){ if(state.variants[qid]==null) state.variants[qid]=0; state.variants[qid]++; saveState(); }

function collectPartKeys(q,b){
  const keys = [];
  (b.parts||[]).forEach(p=>keys.push(p.key));
  return keys;
}
function _branchHasParts(b){ return (b.parts||[]).length>0; }

function getQuestionStatus(q){
  const qid = q.id;
  let anyProgress = false;
  let allComplete = true;
  let allCorrect = true;
  let anyPart = false;

  q.branches.forEach((b,bi)=>{
    if(!_branchHasParts(b)) return;
    anyPart = true;

    const locked = _isBranchLocked(qid, bi);
    const out = _getOutcome(qid, bi);
    const saved = (_getSaveAttempt(qid, bi) > 0) || (state.answers[qid] && state.answers[qid][bi]);

    if(saved) anyProgress = true;

    if(!locked){
      allComplete = false;
      allCorrect = false;
      return;
    }
    if(out !== "correct") allCorrect = false;
  });

  if(!anyPart) return "completed_correct";
  if(allComplete) return allCorrect ? "completed_correct" : "completed_wrong";
  if(anyProgress) return "in_progress";
  return "not_started";
}

function isQuestionDone(q){
  const st = getQuestionStatus(q);
  return st === "completed_correct" || st === "completed_wrong";
}

function listIncomplete(){
  const arr=[];
  BANK.forEach((q,i)=>{
    if(!isQuestionDone(q)) arr.push({i:i+1, title:q.title});
  });
  return arr;
}

function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==="class") node.className=v;
    else if(k==="html") node.innerHTML=v;
    else if(k.startsWith("on") && typeof v==="function") node.addEventListener(k.slice(2), v);
    else if(k==="disabled") node.disabled=!!v;
    else node.setAttribute(k,v);
  });
  (Array.isArray(children)?children:[children]).forEach(ch=>{
    if(ch===null || ch===undefined) return;
    node.appendChild(typeof ch==="string" ? document.createTextNode(ch) : ch);
  });
  return node;
}
function openModal(title, html){
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modal").classList.add("show");
  typesetMath(document.getElementById("modalBody"));
}
function closeModal(){ document.getElementById("modal").classList.remove("show"); }
document.getElementById("closeModal").onclick = closeModal;
document.getElementById("modal").addEventListener("click", (e)=>{ if(e.target.id==="modal") closeModal(); });

const LAT = { mean:"\\bar{x}", median:"\\tilde{x}", mode:"\\hat{x}" };

function meanRawGen(v){
  const r = seededRand("mean_raw|"+v);
  const n = (randInt(r, 7, 11) | 1);
  const xs = Array.from({length:n}, ()=>randInt(r, 2, 10));
  const sum = xs.reduce((a,b)=>a+b,0);
  const mean = sum/n;
  const meanRounded = Math.round(mean*100)/100;

  const prompt = `البيانات: ${xs.join("، ")}<br>احسب \\( \\bar{x} \\) المتوسط الحسابي.`;
  return {
    branches:[
      {
        level:"سهل",
        explain:[
          "نستخدم قانون المتوسط الحسابي للبيانات غير المجمعة:",
          `\\( ${LAT.mean} = \\frac{\\sum_{i=1}^{n} x_i}{n} \\)`,
          "حيث \\(n\\) عدد القيم، و \\(\\sum x_i\\) مجموع القيم."
        ],
        promptHtml: `<div style="font-weight:900">${prompt}</div>`,
        parts:[{key:"mean", type:"number", label:`\\( ${LAT.mean} \\) المتوسط الحسابي`, step:"0.01"}],
        answers:{mean},
        method:[
          `عدد القيم: \\( n = ${n} \\).`,
          `مجموع القيم: \\( \\sum x_i = ${xs.join(" + ")} = ${sum} \\).`,
          `\\[ ${LAT.mean} = \\frac{${sum}}{${n}} = ${meanRounded} \\]`
        ]
      }
    ]
  };
}

function meanFromFreqTableGen(v){
  const r = seededRand("mean_freq|"+v);
  const x = [0,1,2,3,4];
  let f = x.map(()=>randInt(r, 2, 14));
  f[0]=randInt(r,2,6); f[4]=randInt(r,2,6);
  const n = f.reduce((a,b)=>a+b,0);
  const num = x.reduce((a,xi,i)=>a+xi*f[i],0);
  const mean = num/n;

  const rows = x.map((xi,i)=>`<tr><td>${xi}</td><td>${f[i]}</td></tr>`).join("");
  const promptHtml = `
    <div style="font-weight:900;margin-bottom:10px">الجدول الآتي يوضح القيمة \\(x\\) وتكرارها \\(f\\):</div>
    <table class="ftable" style="max-width:520px">
      <thead><tr><th>القيمة \\(x\\)</th><th>التكرار \\(f\\)</th></tr></thead>
      <tbody>${rows}<tr><td><b>\\(\\sum f\\)</b></td><td><b>${n}</b></td></tr></tbody>
    </table>
    <div style="margin-top:10px;font-weight:900">احسب \\( ${LAT.mean} \\) المتوسط.</div>
  `;
  return {
    branches:[
      {
        level:"سهل",
        explain:["استخدم العلاقة الخاصة بالمتوسط للجداول التكرارية."],
        promptHtml,
        parts:[{key:"mean", type:"number", label:`\\( ${LAT.mean} \\) المتوسط`, step:"0.01"}],
        answers:{mean},
        method:[
          `\\[ ${LAT.mean} = \\frac{\\sum_{i=1}^{n} x_i\\, f_i}{\\sum_{i=1}^{n} f_i} \\]`,
          `نحسب حاصل ضرب كل قيمة في تكرارها: ${x.map((xi,i)=> (xi+"×"+f[i]+"="+(xi*f[i]))).join("، ")}.`,
          `ثم نجمع نواتج الضرب: \\( \\sum x_i f_i = ${x.map((xi,i)=> (xi*f[i])).join(" + ")} = ${num} \\).`,
          `ونجمع التكرارات: \\( \\sum f_i = ${f.join(" + ")} = ${n} \\).`,
          `\\[ ${LAT.mean} = \\frac{${num}}{${n}} = ${Math.round(mean*100)/100} \\]`
]
      }
    ]
  };
}

function meanGroupedGen(v){
  const r = seededRand("mean_grouped|"+v);
  const classes = [[20,25],[25,30],[30,35],[35,40],[40,45]];
  let f = classes.map(()=>randInt(r, 8, 34));
  f = f.map(x=>Math.max(6, Math.round(x/2)));
  const mids = classes.map(c=>(c[0]+c[1])/2);
  const N = f.reduce((a,b)=>a+b,0);
  const products = mids.map((m,i)=>m*f[i]);
  const num = products.reduce((a,b)=>a+b,0);
  const mean = num/N;
  const meanRounded = Math.round(mean*100)/100;

  const rows = classes.map((c,i)=>`<tr><td>${c[0]}–${c[1]}</td><td>${f[i]}</td></tr>`).join("");
  const promptHtml = `
    <div style="font-weight:900;margin-bottom:10px">الجدول التالي يوضح فئات العمر وتكراراتها:</div>
    <table class="ftable" style="max-width:520px">
      <thead><tr><th>الفئة</th><th>التكرار \\(f\\)</th></tr></thead>
      <tbody>${rows}<tr><td><b>المجموع</b></td><td><b>${N}</b></td></tr></tbody>
    </table>
    <div style="margin-top:10px;font-weight:900">احسب \\( ${LAT.mean} \\) المتوسط التقريبي باستخدام مراكز الفئات.</div>
  `;

  const midsTxt = classes.map((c,i)=>`${c[0]}–${c[1]} ⇒ ${mids[i]}`).join("، ");
  const prodTxt = classes.map((c,i)=>`${mids[i]}×${f[i]}=${products[i]}`).join("، ");
  const sumFtxt = f.join(" + ");
  const sumProdTxt = products.join(" + ");

  return {
    branches:[
      {
        level:"متوسط",
        explain:[
          "للبيانات المجمعة نستخدم مراكز الفئات (منتصف كل فئة) بدل القيم الأصلية.",
          `\\( x_i = \\frac{حد\\,الفئة\\,الأدنى + حد\\,الفئة\\,الأعلى}{2} \\)`,
          `ثم: \\( ${LAT.mean} = \\frac{\\sum x_i f_i}{\\sum f_i} \\).`
        ],
        promptHtml,
        parts:[{key:"mean", type:"number", label:`\\( ${LAT.mean} \\) المتوسط التقريبي`, step:"0.01"}],
        answers:{mean},
        method:[
          `مراكز الفئات: ${midsTxt}.`,
          `نحسب \\(x_i f_i\\) لكل فئة: ${prodTxt}.`,
          `مجموع التكرارات: \\( \\sum f_i = ${sumFtxt} = ${N} \\).`,
          `مجموع \\(x_i f_i\\): \\( \\sum x_i f_i = ${sumProdTxt} = ${num} \\).`,
          `\\[ ${LAT.mean} = \\frac{${num}}{${N}} = ${meanRounded} \\]`
        ]
      }
    ]
  };
}

function medianRawGen(v){
  const r = seededRand("median_raw|"+v);
  const even = (v % 2 === 1);
  const base = even ? randInt(r, 6, 10) : (randInt(r, 7, 11) | 1);
  const n = even ? (base % 2 === 0 ? base : base+1) : base;
  const xs = Array.from({length:n}, ()=>randInt(r, 10, 99));
  const sorted = [...xs].sort((a,b)=>a-b);
  let med;
  if(n%2===1){
    med = sorted[(n-1)/2];
  }else{
    med = (sorted[n/2 - 1] + sorted[n/2]) / 2;
  }
  const promptHtml = `
    <div style="font-weight:900">البيانات: ${xs.join("، ")}<br>بعد ترتيبها تصاعدياً، احسب \\( ${LAT.median} \\) الوسيط.</div>
  `;
  return {
    branches:[
      {
        level:"سهل",
        explain:["رتّب القيم تصاعدياً ثم حدّد موقع/موقعين المنتصف."],
        promptHtml,
        parts:[{key:"med", type:"number", label:`\\( ${LAT.median} \\) الوسيط`, step:"0.5"}],
        answers:{med},
        method:[
          "رتّب البيانات تصاعدياً.",
          `البيانات المرتبة: ${sorted.join("، ")}.`,
          n%2===1
            ? `\\(n=${n}\\) فردي ⇒ \\(k=\\frac{n+1}{2}=${(n+1)/2}\\) ⇒ \\( ${LAT.median} = ${med} \\).`
            : `\\(n=${n}\\) زوجي ⇒ القيمتان في الموقعين \\(\\frac{n}{2}=${n/2}\\) و \\(\\frac{n}{2}+1=${n/2+1}\\) هما ${sorted[n/2-1]} و ${sorted[n/2]} ⇒ \\( ${LAT.median} = \\frac{${sorted[n/2-1]}+${sorted[n/2]}}{2} = ${med} \\).`
        ]
      }
    ]
  };
}

function medianFreqGen(v){
  const r = seededRand("median_freq|"+v);
  const x = [2,3,5,6,7];
  let f = [randInt(r,8,15), randInt(r,12,20), randInt(r,6,12), randInt(r,2,6), randInt(r,1,4)];
  const n = f.reduce((a,b)=>a+b,0);
  let cum = [];
  let s = 0;
  for(let i=0;i<f.length;i++){ s += f[i]; cum.push(s); }

  const k = (n%2===1) ? (n+1)/2 : (n/2);
  const idxK = cum.findIndex(c=>c>=k);
  const exactHalf = (n%2===0 && cum[idxK]===k);

  let med;
  if(n%2===1){
    med = x[idxK];
  }else{
    med = exactHalf ? (x[idxK] + x[idxK+1]) / 2 : x[idxK];
  }
  const rows = x.map((xi,i)=>`<tr><td>${xi}</td><td>${f[i]}</td><td>${cum[i]}</td></tr>`).join("");
  const promptHtml = `
    <div style="font-weight:900;margin-bottom:10px">جدول تكراري (مع التكرار المتجمع الصاعد):</div>
    <table class="ftable" style="max-width:640px">
      <thead><tr><th>القيمة</th><th>التكرار \\(f\\)</th><th>التكرار المتجمع الصاعد</th></tr></thead>
      <tbody>${rows}<tr><td><b>المجموع</b></td><td colspan="2"><b>${n}</b></td></tr></tbody>
    </table>
    <div style="margin-top:10px;font-weight:900">احسب \\( ${LAT.median} \\) الوسيط.</div>
  `;
  return {
    branches:[
      {
        level:"متوسط",
        explain:["حدّد قيمة k ثم استخدم عمود التكرار المتجمع لتحديد الوسيط."],
        promptHtml,
        parts:[{key:"med", type:"number", label:`\\( ${LAT.median} \\) الوسيط`, step:"0.5"}],
        answers:{med},
        method:[
          `مجموع التكرارات: \\( n = ${n} \\).`,
          `نحدد قيمة المركز: \\( k = ${k} \\).`,
          `التكرار المتجمع الصاعد: ${cum.join("، ")}.`,
          exactHalf
            ? `لأن التكرار المتجمع يساوي \\(k\\) تمامًا عند القيمة ${x[idxK]}، فإن الوسيط هو متوسط القيمتين ${x[idxK]} و ${x[idxK+1]}.`
            : `أول تكرار متجمع صاعد \\(\ge k\\) يقع عند القيمة ${x[idxK]}، لذا يكون الوسيط هذه القيمة.`,
          exactHalf
            ? `\\( ${LAT.median} = \\frac{${x[idxK]}+${x[idxK+1]}}{2} = ${med} \\).`
            : `\\( ${LAT.median} = ${med} \\).`
        ]
      }
    ]
  };
}

function modeRawGen(v){
  const r = seededRand("mode_raw|"+v);
  const n = randInt(r, 8, 12);
  let xs = Array.from({length:n}, ()=>randInt(r, 2, 11));
  
  const a = randInt(r, 3, 9);
  const b = randInt(r, 3, 9);
  xs[0]=a; xs[3]=a; xs[5]=a;
  if(v%3===2){
    xs[1]=b; xs[6]=b; xs[7]=b; 
  }
  const freq = {};
  xs.forEach(x=>freq[x]=(freq[x]||0)+1);
  const maxf = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter(k=>freq[k]===maxf).map(Number).sort((x,y)=>x-y);
  const correct = modes.length===1 ? String(modes[0]) : modes.join("، ");
  const promptHtml = `
    <div style="font-weight:900">البيانات: ${xs.join("، ")}<br>حدِّد \\( ${LAT.mode} \\) المنوال.</div>
  `;
  return {
    branches:[
      {
        level:"سهل",
        explain:["المنوال هو القيمة الأكثر تكراراً."],
        promptHtml,
        parts:[{key:"mode", type:"text", label:`\\( ${LAT.mode} \\) المنوال`, placeholder:"اكتب القيمة (أو قيمتين إذا كان منوالان)"}],
        answers:{mode: correct},
        method:[
          `\\( ${LAT.mode} \\) هو القيمة (أو القيم) الأكثر تكراراً.`,
          `التكرارات: ${Object.keys(freq).map(Number).sort((a,b)=>a-b).map(k=>`${k}→${freq[k]}`).join("، ")}.`,
          `أكبر تكرار = ${maxf}، إذن \\( ${LAT.mode} = ${correct} \\).`
        ]
      }
    ]
  };
}

function modeGroupedGen(v){
  const r = seededRand("mode_grouped|"+v);

  
  const C = 6;
  const k = 6;
  const start = randInt(r, 4, 14);
  const classes = Array.from({length:k}, (_,i)=>{
    const a = start + i*C;
    const b = a + C;
    return {a,b,label:`${a}–${b}`};
  });

  
  const modalIndex = randInt(r, 1, k-2);
  let freqs;
  while(true){
    const peakF = randInt(r, 18, 28);
    freqs = Array.from({length:k}, ()=>0);
    freqs[modalIndex] = peakF;

    let cur = peakF;
    for(let i=modalIndex-1;i>=0;i--){
      cur -= randInt(r, 2, 6);
      freqs[i] = cur;
    }

    cur = peakF;
    for(let i=modalIndex+1;i<k;i++){
      cur -= randInt(r, 2, 6);
      freqs[i] = cur;
    }

    if(freqs.every(f=>f>=2)) break;
  }

  
  if(freqs[modalIndex] <= freqs[modalIndex-1]) freqs[modalIndex] = freqs[modalIndex-1] + 1;
  if(freqs[modalIndex] < freqs[modalIndex+1]) freqs[modalIndex+1] = freqs[modalIndex] - 1;

  const fPrev  = freqs[modalIndex-1];
  const fModal = freqs[modalIndex];
  const fNext  = freqs[modalIndex+1];

  const Lhat = classes[modalIndex].a;
  const d1 = fModal - fPrev;
  const d2 = fModal - fNext;
  const mode = Lhat + (d1 / (d1 + d2)) * C;
  const modeRounded = Math.round(mode*100)/100;

  const tableRows = classes.map((c,i)=>`
    <tr>
      <td class="r"><span class="ltr">${c.label}</span></td>
      <td class="c">${freqs[i]}</td>
    </tr>
  `).join("");

  const promptHtml = `
    <div class="subTitle">جدول توزيع تكراري</div>
    <div class="qText">
      من الجدول الآتي، حدد قيمة المنوال \\( ${LAT.mode} \\).
    </div>
    <div class="niceTableWrap">
      <table class="niceTable">
        <thead>
          <tr><th class="r">الفئة</th><th class="c">التكرار</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  const explain = [
    "نحدد الفئة المنوالية: تكرارها أكبر من تكرار الفئة السابقة، وأكبر أو يساوي تكرار الفئة اللاحقة.",
    `\\[ ${LAT.mode} = \\hat{L} + \\frac{d_1}{d_1 + d_2} \\, C \\]`,
    "حيث:",
    `\\(\\hat{L}\\) حدّ أدنى للفئة المنوالية.`,
    `\\(d_1\\) = (تكرار الفئة المنوالية − تكرار الفئة السابقة).`,
    `\\(d_2\\) = (تكرار الفئة المنوالية − تكرار الفئة اللاحقة).`,
    `\\(C\\) سعة الفئة.`
  ];

  const method = [
    `الفئة المنوالية: ${classes[modalIndex].label} (تكرارها ${fModal}).`,
    `لأن ${fModal} > ${fPrev} و ${fModal} >= ${fNext}.`,
    `\\(\\hat{L} = ${Lhat}\\)، \\(C = ${C}\\).`,
    `\\(d_1 = ${fModal} - ${fPrev} = ${d1}\\).`,
    `\\(d_2 = ${fModal} - ${fNext} = ${d2}\\).`,
    `\\[ ${LAT.mode} = ${Lhat} + \\frac{${d1}}{${d1}+${d2}} \\times ${C} = ${modeRounded} \\]`
  ];

  return {
    id:"mode_grouped",
    title:"المنوال",
    branches:[
      {
        name:"سهل",
        level:"سهل",
        difficulty:"سهل",
        explain,
        promptHtml,
        parts:[
          {key:"mode", type:"number", label:`قيمة المنوال \\( ${LAT.mode} \\)`, placeholder:"مثال: 31.5"}
        ],
        answers:{ mode: modeRounded },
        method
      }
    ]
  };
}

function chooseMeasureGen(v){
  const r = seededRand("choose|"+v);
  const xs = Array.from({length:7}, ()=>randInt(r, 6, 20));
  xs.push(randInt(r, 60, 90)); 
  const promptHtml = `
    <div style="font-weight:900">البيانات: ${xs.join("، ")}<br>اختر المقياس الأنسب لتمثيلها.</div>
  `;
  return {
    branches:[
      {
        level:"سهل",
        explain:["عند وجود قيمة متطرفة، نختار المقياس الأقل تأثراً."],
        promptHtml,
        parts:[{key:"best", type:"mcq", label:"المقياس الأنسب", options:[`المتوسط الحسابي`,`الوسيط`,`المنوال`]} ],
        answers:{best:`الوسيط`},
        method:[
          `عند وجود قيمة متطرفة فإن المتوسط \\( \\bar{x} \\) يتأثر بها أكثر.`,
          `الوسيط \\( \\tilde{x} \\) أقل تأثراً بالقيم المتطرفة.`,
          "لذلك يكون الاختيار الصحيح هو: الوسيط."
        ]
      }
    ]
  };
}

function histPolygonGen(v){
  const r = seededRand("histpoly|"+v);

  const w = 5;
  const k = 6;
  const start = randInt(r, 10, 14);
  const classes = Array.from({length:k}, (_,i)=>[start+i*w, start+(i+1)*w]);

  
  const peak = randInt(r, 1, k-2);
  let freqs = Array.from({length:k}, ()=>0);
  const peakF = randInt(r, 18, 26);
  freqs[peak] = peakF;

  
  for(let i=peak-1;i>=0;i--){
    const dec = randInt(r, 2, 6);
    freqs[i] = Math.max(2, freqs[i+1] - dec);
  }
  
  for(let i=peak+1;i<k;i++){
    const dec = randInt(r, 2, 6);
    freqs[i] = Math.max(2, freqs[i-1] - dec);
  }

  
  freqs[peak] = Math.max(freqs[peak], freqs[peak-1]+1, freqs[peak+1]+1);

  const maxF = freqs[peak];
  const n = freqs.reduce((a,b)=>a+b,0);

  const cum = [];
  freqs.reduce((acc, f, i)=>{ cum[i]=acc+f; return cum[i]; }, 0);

  const target = (n%2===0) ? (n/2) : ((n+1)/2);
  const medianIdx = cum.findIndex(c=>c>target);
  const medianClass = `${classes[medianIdx][0]}–${classes[medianIdx][1]}`;

  const modalIdx = peak;
  const modalClass = `${classes[modalIdx][0]}–${classes[modalIdx][1]}`;

  const W = 860, H = 290, pad = 70;
  const plotW = W - pad*2;
  const plotH = H - pad*2;
  const bw = plotW / k;
  const xStart = pad - bw/2;
  const xEnd = W - pad + bw/2;

  function yOf(val){ return pad + (plotH - (val/maxF)*plotH); }
  function xOf(i){ return pad + i*bw; }
  function midOf(i){ return pad + i*bw + bw/2; }

  const xLabels = classes.map(c=>`${c[0]}–${c[1]}`);

  
  let rects = "";
  for(let i=0;i<k;i++){
    const x = xOf(i);
    const y = yOf(freqs[i]);
    const h = (pad+plotH) - y;
    rects += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="0" ry="0" fill="rgba(0,140,255,0.18)" stroke="rgba(0,100,180,0.55)" stroke-width="2"></rect>`;
  }

  let xText = "";
  for(let i=0;i<k;i++){
    xText += `<text x="${midOf(i)}" y="${H-pad+22}" text-anchor="middle" font-size="14" direction="ltr">${xLabels[i]}</text>`;
  }

  
  let yGrid = "";
  const ticks = 5;
  for(let t=0;t<=ticks;t++){
    const vTick = Math.round((maxF/ticks)*t);
    const y = yOf(vTick);
    yGrid += `<line x1="${xStart}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="rgba(0,0,0,0.07)" stroke-width="1"></line>`;
    yGrid += `<text x="${pad-10}" y="${y+5}" text-anchor="end" font-size="12" fill="rgba(0,0,0,0.55)" direction="ltr">${vTick}</text>`;
  }

  const histSvg = `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="260" aria-label="Histogram">
    ${yGrid}
    <line x1="${xStart}" y1="${pad+plotH}" x2="${xEnd}" y2="${pad+plotH}" stroke="rgba(0,0,0,0.25)" stroke-width="1"></line>
    <line x1="${xStart}" y1="${pad}" x2="${xStart}" y2="${pad+plotH}" stroke="rgba(0,0,0,0.25)" stroke-width="1"></line>
    ${rects}
    ${xText}
  </svg>`;

  
  let pts = classes.map((_,i)=>`${midOf(i)},${yOf(freqs[i])}`).join(" ");
  const axisY = (pad+plotH);
  const leftMid = xStart;
  const rightMid = xEnd;
  const ptsClosed = `${leftMid},${axisY} ` + pts + ` ${rightMid},${axisY}`;
  let dots = "";
  for(let i=0;i<k;i++){
    dots += `<circle cx="${midOf(i)}" cy="${yOf(freqs[i])}" r="5.5" fill="rgba(0,90,160,0.85)"></circle>`;
  }
  const polySvg = `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="260" aria-label="Frequency Polygon">
    ${yGrid}
    <line x1="${xStart}" y1="${pad+plotH}" x2="${xEnd}" y2="${pad+plotH}" stroke="rgba(0,0,0,0.25)" stroke-width="1"></line>
    <line x1="${xStart}" y1="${pad}" x2="${xStart}" y2="${pad+plotH}" stroke="rgba(0,0,0,0.25)" stroke-width="1"></line>
    <polyline points="${ptsClosed}" fill="none" stroke="rgba(0,90,160,0.85)" stroke-width="3" stroke-linejoin="round"></polyline>
    ${dots}
    ${xText}
  </svg>`;

  
  const cumInput = (i)=>`<input class="inlineInput" data-key="cum${i}" inputmode="numeric" autocomplete="off" placeholder="—" style="width:92px;border:2px solid #000;border-radius:14px;padding:10px 12px;font-weight:900;background:#fff;text-align:center" />`;
  const tableRows = classes.map((c,i)=>`
    <tr>
      <td><span class="ltr">${c[0]}–${c[1]}</span></td>
      <td>${freqs[i]}</td>
      <td>${cumInput(i)}</td>
    </tr>
  `).join("");

  const tableHtml = `
  <div class="card" style="margin-top:12px;padding:14px 14px 8px">
    <div style="font-weight:900;margin:2px 0 10px">أكمل عمود التكرار المتجمع الصاعد:</div>
    <table class="niceTable">
      <thead>
        <tr>
          <th>الفئة</th>
          <th>التكرار</th>
          <th>التكرار المتجمع الصاعد</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;

  return {
    branches:[
      {
        level:"متوسط",
        explain:["اقرأ المدرج التكراري ثم أكمل التكرار المتجمع الصاعد وحدد الفئة الوسيطية."],
        promptHtml: `
          <div class="card" style="padding:16px">
            <div style="font-weight:900;margin-bottom:8px">الرسم المدرج التكراري</div>
            ${histSvg}
          </div>
          ${tableHtml}
        `,
        parts:[
          {key:"cum0", type:"number", inline:true, label:"", step:"1"},
          {key:"cum1", type:"number", inline:true, label:"", step:"1"},
          {key:"cum2", type:"number", inline:true, label:"", step:"1"},
          {key:"cum3", type:"number", inline:true, label:"", step:"1"},
          {key:"cum4", type:"number", inline:true, label:"", step:"1"},
          {key:"cum5", type:"number", inline:true, label:"", step:"1"},
          {key:"medianClass", type:"mcq", label:"الفئة الوسيطية", options:xLabels}
        ],
        answers:{
          cum0:cum[0], cum1:cum[1], cum2:cum[2], cum3:cum[3], cum4:cum[4], cum5:cum[5],
          medianClass: medianClass
        },
        method:[
          "نحسب التكرار المتجمع الصاعد بجمع التكرارات تدريجياً.",
          `مجموع التكرارات: \\( n = ${n} \\).`,
          `نصف المجموع (قيمة المركز): \\( ${target} \\).`,
          `التكرار المتجمع الصاعد: ${cum.join("، ")}.`,
          `أول تكرار متجمع صاعد أكبر من \\( ${target} \\) هو \\( ${cum[medianIdx]} \\) عند الفئة: ${medianClass}.`
        ]
      },
      {
        level:"متوسط",
        explain:["اقرأ المضلع التكراري ثم حدد الفئة المنوالية والتكرار الأكبر."],
        promptHtml: `
          <div class="card" style="padding:16px">
            <div style="font-weight:900;margin-bottom:8px">المضلع التكراري</div>
            ${polySvg}
          </div>
        `,
        parts:[
          {key:"modalClass", type:"mcq", label:"الفئة المنوالية", options:xLabels},
          {key:"maxF", type:"number", label:"التكرار الأكبر", step:"1"}
        ],
        answers:{ modalClass, maxF },
        method:[
          "من الرسم: حدِّد أعلى نقطة في المضلع التكراري.",
          `أكبر تكرار هو \\( ${maxF} \\) عند الفئة: ${modalClass}.`,
          `إذن الفئة المنوالية: ${modalClass}، والتكرار الأكبر = ${maxF}.`
        ]
      }
    ]
  };
}

function miscMcqGen(v){
  const r = seededRand("misc_mcq|"+v);
  const sh = (arr)=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; };
  const clamp = (x,a,b)=>Math.max(a, Math.min(b,x));

  const wTheory = randInt(r, 1, 3);
  const wPrac = randInt(r, 2, 6);
  const pTheory = randInt(r, 70, 95);
  const pPrac = randInt(r, 70, 95);
  const overall = Math.round((wTheory*pTheory + wPrac*pPrac)/(wTheory+wPrac));

  const opt1 = overall;
  const opt2 = clamp(overall + randInt(r, 3, 8), 0, 100);
  const opt3 = clamp(overall - randInt(r, 3, 8), 0, 100);
  const opt4 = clamp(overall + randInt(r, 10, 18), 0, 100);
  const optsA = sh([opt1,opt2,opt3,opt4]).map(x=>`${x}%`);

  const optionsB = sh(["0","9","3","10"]);

  const promptA = `
    <div class="card" style="padding:14px">
      <div style="font-weight:900;margin-bottom:8px">إذا كان الاختبار مكوّنًا من قسمين: نظري وعملي، وكان وزن النظري = ${wTheory} ووزن العملي = ${wPrac}،</div>
      <div style="font-weight:900;margin-bottom:8px">وحصل طالب على ${pTheory}% في النظري و ${pPrac}% في العملي؛ احسب النسبة المئوية الكلية.</div>
    </div>
  `;

  const promptB = `
    <div class="card" style="padding:14px">
      <div style="font-weight:900;margin-bottom:8px">لمجموعة مشاهدات عددها 10، إذا علمت أن \\\(\\sum_{i=1}^{10} (x_i-\\bar{x})^2 = 9\\\) فإن:</div>
      <div style="font-weight:900">\\\(\\sum_{i=1}^{10} (x_i-\\bar{x})\\\) يساوي:</div>
    </div>
  `;

  return {
    branches:[
      {
        level:"متوسط",
        explain:["احسب المتوسط المرجّح باستخدام الأوزان ثم اختر الإجابة الصحيحة."],
        promptHtml: promptA,
        parts:[{key:"wavg", type:"mcq", label:"الإجابة", options:optsA}],
        answers:{wavg:`${overall}%`},
        method:[
          "النسبة الكلية = المتوسط المرجّح للأوزان.",
          `المعطيات: \\(w_T=${wTheory},\; P_T=${pTheory},\; w_P=${wPrac},\; P_P=${pPrac}\\).`,
          `\\[ \\text{Overall} = \\frac{${wTheory}\\times${pTheory} + ${wPrac}\\times${pPrac}}{${wTheory}+${wPrac}} = ${overall} \\]`
        ]
      },
      {
        level:"سهل",
        explain:["خاصية مهمة: مجموع الانحرافات عن المتوسط يساوي صفرًا."],
        promptHtml: promptB,
        parts:[{key:"devsum", type:"mcq", label:"الإجابة", options:optionsB}],
        answers:{devsum:"0"},
        method:[
          "لأي بيانات: مجموع الانحرافات عن المتوسط يساوي صفرًا.",
          `\\[ \\sum (x_i-\\bar{x}) = 0 \\]`
        ]
      }
    ]
  };
}

function _sortedSample(r, n, lo, hi){
  const xs = [];
  while(xs.length<n){
    const v = randInt(r, lo, hi);
    xs.push(v);
  }
  
  
  xs.sort((a,b)=>a-b);
  return xs;
}
function _makeDistinctSample(r, n, lo, hi){
  const set = new Set();
  while(set.size<n){
    set.add(randInt(r, lo, hi));
  }
  return Array.from(set).sort((a,b)=>a-b);
}
function _fmtList(arr){ return arr.join("، "); }
function _round2(x){ return Math.round(x*100)/100; }
function shuffleInPlace(r, arr){
  for(let i=arr.length-1;i>0;i--){
    const j = randInt(r, 0, i);
    const t = arr[i]; arr[i]=arr[j]; arr[j]=t;
  }
  return arr;
}

function tfStatementsGen(v){
  return {
    branches:[
      {
        level:"سهل",
        explain:[
          "تذكّر: Q1 = P25 ، و Q2 = P50 (الوسيط) ، و Q3 = P75.",
          "المئين P_r يعني أن r% من البيانات أقل من أو تساوي هذه القيمة."
        ],
        promptHtml:`<div style="font-weight:900">ضع دائرة حول الإجابة الصحيحة (صحيحة/خاطئة) لكل عبارة:</div>`,
        parts:[
          {key:"a", type:"mcq", options:["صحيحة","خاطئة"], label:"(أ) P25 يساوي Q3."},
          {key:"b", type:"mcq", options:["صحيحة","خاطئة"], label:"(ب) P50 يساوي Q2."},
          {key:"c", type:"mcq", options:["صحيحة","خاطئة"], label:"(ج) P80 يعني أن 80% من البيانات أكبر منه."},
          {key:"d", type:"mcq", options:["صحيحة","خاطئة"], label:"(د) دائمًا Q3 أكبر من أو يساوي Q1."}
        ],
        answers:{a:"خاطئة", b:"صحيحة", c:"خاطئة", d:"صحيحة"},
        method:[
          "من العلاقات الصحيحة دائمًا: Q1 = P25 ، Q2 = P50 ، Q3 = P75.",
          "(أ) خاطئة لأن P25 يساوي Q1 وليس Q3.",
          "(ب) صحيحة لأن Q2 يساوي P50 (وهو الوسيط).",
          "(ج) خاطئة؛ الصحيح: 80% من البيانات أقل من أو تساوي P80.",
          "(د) صحيحة لأن ترتيب المقاييس يكون Q1 ≤ Q2 ≤ Q3."
        ]
      }
    ]
  };
}

function _quartileRank(n, rQ){ return (rQ*(n+1))/4; }
function _percentileRank(n, rP){ return (rP*(n+1))/100; }
function _interpAt(sorted, pos){
  
  const k = Math.floor(pos);
  const a = pos - k;
  const xk = sorted[k-1];
  const xk1 = sorted[k]; 
  const val = (a===0 || xk1===undefined) ? xk : (xk + a*(xk1 - xk));
  return {k, a, xk, xk1, val};
}

function quartileEvenGen(v){
  const r = seededRand("q1_even|"+v);
  const n = 12;
  const sorted = _makeDistinctSample(r, n, 8, 45);
  const shown = sorted.slice();
  shuffleInPlace(seededRand("q1_even_show|"+v), shown); 
  const q1 = _quartileRank(n,1);
  const it = _interpAt(sorted, q1);
  const q1r = _round2(q1);
  const Q1 = _round2(it.val);

  const basePrompt = `البيانات: ${_fmtList(shown)}`;
  return {
    branches:[
      {
        level:"سهل",
        explain:[
          "رتبة الربيع \\(Q_r\\) للبيانات غير المجمعة: \\( q_r = \\frac{r(n+1)}{4} \\).",
          "حيث \\(n\\) عدد القيم، و \\(r=1,2,3\\)."
        ],
        promptHtml:`<div style="font-weight:900">${basePrompt}<br>احسب رتبة الربيع الأول \\(q_1\\).</div>`,
        parts:[{key:"q1rank", type:"number", label:"رتبة الربيع الأول \\(q_1\\)", step:"0.01"}],
        answers:{q1rank: q1r},
        method:[
          `عدد القيم: \\( n = ${n} \\).`,
          `\\[ q_1 = \\frac{1(${n}+1)}{4} = \\frac{${n+1}}{4} = ${q1r} \\]`
        ]
      },
      {
        level:"سهل",
        explain:[
          "بعد ترتيب البيانات تصاعديًا، إذا كانت الرتبة \\(q\\) غير صحيحة العدد:",
          "نأخذ \\(k\\) الجزء الصحيح و \\(\\alpha\\) الجزء الكسري من الرتبة.",
          "ثم \\( Q_r = x_k + \\alpha (x_{k+1}-x_k) \\)."
        ],
        promptHtml:`<div style="font-weight:900">${basePrompt}<br>احسب قيمة الربيع الأول \\(Q_1\\).</div>`,
        parts:[{key:"Q1", type:"number", label:"قيمة الربيع الأول \\(Q_1\\)", step:"0.01"}],
        answers:{Q1: Q1},
        method:[
          `بعد الترتيب تصاعديًا: \\(x_1\\le \\dots \\le x_{${n}}\\).`,
          `الرتبة: \\( q_1 = ${q1r} \\Rightarrow k=${it.k},\\ \\alpha=${_round2(it.a)} \\).`,
          `القيم: \\(x_${it.k}=${it.xk}\\), \\(x_${it.k+1}=${it.xk1}\\).`,
          `\\[ Q_1 = x_${it.k} + \\alpha(x_${it.k+1}-x_${it.k}) = ${it.xk} + ${_round2(it.a)}(${it.xk1}-${it.xk}) = ${Q1} \\]`
        ]
      }
    ]
  };
}

function quartileOddGen(v){
  const r = seededRand("q3_odd|"+v);
  const n = 11; 
  const sorted = _makeDistinctSample(r, n, 10, 60);
  const shown = sorted.slice();
  shuffleInPlace(seededRand("q3_odd_show|"+v), shown); 

  const q3 = _quartileRank(n,3);
  const it = _interpAt(sorted, q3);

  const q3r = _round2(q3);
  const k = it.k;
  const a = _round2(it.a);
  const xk = it.xk;
  const xk1 = it.xk1;
  const Q3 = _round2(it.val);

  const listHtml = `<div class="chipRow">${shown.map(x=>`<span class="chip">${x}</span>`).join("")}</div>`;

  const valueLine = (a===0)
    ? `بما أن \(\alpha=0\) فإن \(Q_3 = x_{${k}} = ${xk}\).`
    : `\(Q_3 = x_{${k}} + ${a}(x_{${k+1}} - x_{${k}}) = ${xk} + ${a}(${xk1} - ${xk}) = ${Q3}\).`;

  return {
    branches:[
      {
        level:"سهل",
        explain:[
          "رتبة الربيع الثالث: \( q_3 = \dfrac{3(n+1)}{4} \).",
          "استخرج \(k\) (الجزء الصحيح) و \(\alpha\) (الجزء الكسري)."
        ],
        promptHtml:`<div class="qText">القيم التالية مرتبة عشوائياً (أعد ترتيبها تصاعدياً عند الحاجة):</div>${listHtml}
                   <div class="qText">أوجد <b>رتبة</b> الربيع الثالث \(q_3\).</div>`,
        parts:[{key:"q3", type:"num", label:"رتبة الربيع الثالث \(q_3\)"}],
        answers:{q3:q3r},
        method:[
          `عدد القيم \(n=${n}\).`,
          `نحسب رتبة الربيع الثالث: \( q_3 = \dfrac{3(n+1)}{4} = \dfrac{3(${n}+1)}{4} = ${q3r} \).`,
          `إذن \(k=${k}\) و \(\alpha=${a}\).`
        ]
      },
      {
        level:"متوسط",
        explain:[
          "بعد إيجاد \(q_3\)، نحسب \(Q_3\) وفق: \( Q_3 = x_k + \alpha(x_{k+1}-x_k) \).",
          "إذا كانت الرتبة عددًا صحيحًا فإن \(\alpha=0\) وبالتالي \(Q_3 = x_k\)."
        ],
        promptHtml:`<div class="qText">باستخدام نفس البيانات السابقة:</div>${listHtml}
                   <div class="qText">أوجد <b>قيمة</b> الربيع الثالث \(Q_3\).</div>`,
        parts:[{key:"Q3", type:"num", label:"قيمة الربيع الثالث \(Q_3\)"}],
        answers:{Q3:Q3},
        method:[
          `بعد ترتيب القيم تصاعدياً نحسب أولاً: \( q_3 = \dfrac{3(n+1)}{4} = ${q3r} \).`,
          `نحدد \(k=${k}\) و \(\alpha=${a}\).`,
          `من البيانات المرتبة: \(x_{${k}}=${xk}\)${(a===0)?"":` و \(x_{${k+1}}=${xk1}\)`}.`,
          valueLine
        ]
      }
    ]
  };
}

function percentileGen(v){
  const r = seededRand("percentile|"+v);
  const n = 15;
  const sorted = _makeDistinctSample(r, n, 20, 95);
  const shown = sorted.slice();
  shuffleInPlace(seededRand("percentile_show|"+v), shown);
  const rp = [20,35,60,67,80][randInt(r,0,4)];
  const pr = _percentileRank(n, rp);
  const it = _interpAt(sorted, pr);
  const prr = _round2(pr);
  const P = _round2(it.val);

  const basePrompt = `البيانات: ${_fmtList(shown)}`;
  return {
    branches:[
      {
        level:"متوسط",
        explain:[
          "رتبة المئين \\(P_r\\): \\( p_r = \\frac{r(n+1)}{100} \\).",
          "ثم نحدد \\(k\\) و \\(\\alpha\\) من الرتبة بعد ترتيب البيانات."
        ],
        promptHtml:`<div style="font-weight:900">${basePrompt}<br>احسب رتبة \\(P_{${rp}}\\) أي \\(p_{${rp}}\\).</div>`,
        parts:[{key:"prank", type:"number", label:`رتبة \\(P_{${rp}}\\)`, step:"0.01"}],
        answers:{prank: prr},
        method:[
          `عدد القيم: \\( n = ${n} \\).`,
          `\\[ p_{${rp}} = \\frac{${rp}(${n}+1)}{100} = \\frac{${rp}\\times${n+1}}{100} = ${prr} \\]`
        ]
      },
      {
        level:"متوسط",
        explain:[
          "بعد ترتيب البيانات: \\( P_r = x_k + \\alpha (x_{k+1}-x_k) \\).",
          "حيث \\(k\\) الجزء الصحيح من الرتبة و \\(\\alpha\\) الجزء الكسري."
        ],
        promptHtml:`<div style="font-weight:900">${basePrompt}<br>احسب قيمة \\(P_{${rp}}\\).</div>`,
        parts:[{key:"P", type:"number", label:`قيمة \\(P_{${rp}}\\)`, step:"0.01"}],
        answers:{P: P},
        method:[
          `بعد الترتيب تصاعديًا: \\(x_1\\le \\dots \\le x_{${n}}\\).`,
          `الرتبة: \\( p_{${rp}} = ${prr} \\Rightarrow k=${it.k},\\ \\alpha=${_round2(it.a)} \\).`,
          `القيم: \\(x_${it.k}=${it.xk}\\), \\(x_${it.k+1}=${it.xk1}\\).`,
          `\\[ P_{${rp}} = x_${it.k} + \\alpha(x_${it.k+1}-x_${it.k}) = ${it.xk} + ${_round2(it.a)}(${it.xk1}-${it.xk}) = ${P} \\]`
        ]
      }
    ]
  };
}

function interpretPercentileGen(v){
  const r = seededRand("interpret|"+v);
  const rp = [80,90,25,75][randInt(r,0,3)];
  const val = randInt(r, 40, 98);
  const correct = `يعني أن ${rp}% من البيانات أقل من أو تساوي ${val}.`;
  const opts = [
    correct,
    `يعني أن ${rp}% من البيانات أكبر من أو تساوي ${val}.`,
    `يعني أن ${100-rp}% من البيانات أقل من أو تساوي ${val}.`,
    `يعني أن ${val} هو أكبر قيمة في البيانات.`
  ];
  shuffleInPlace(seededRand("interpret_opts|"+v), opts);
  return {
    branches:[
      {
        level:"سهل",
        explain:[
          "تفسير \\(P_r\\): القيمة التي يقع عندها تقريبًا \\(r\\%\\) من البيانات تحتها (أو تساويها)."
        ],
        promptHtml:`<div style="font-weight:900">إذا كانت قيمة \\(P_{${rp}}\\) تساوي ${val}، فأي العبارات التالية تمثل تفسيرًا صحيحًا؟</div>`,
        parts:[{key:"ans", type:"mcq", options:opts, label:"ضع دائرة حول الإجابة الصحيحة."}],
        answers:{ans: correct},
        method:[
          `\\(P_{${rp}}=${val}\\) يعني أن ${rp}% من البيانات أقل من أو تساوي ${val}.`
        ]
      }
    ]
  };
}

function smartNfromQ1Gen(v){
  return {
    branches:[
      {
        level:"متوسط",
        explain:[
          "إذا كانت البيانات مرتبة تصاعديًا وكانت \\(x_k = Q_1\\) فهذا يعني أن رتبة \\(Q_1\\) تساوي \\(k\\).",
          "رتبة الربيع الأول: \\( q_1 = \\frac{n+1}{4} \\)."
        ],
        promptHtml:`<div style="font-weight:900">لمجموعة من القيم المختلفة والمرتبة تصاعديًا، إذا كان \\(x_7 = Q_1\\) فإن عدد القيم \\(n\\) يساوي:</div>`,
        parts:[{key:"n", type:"mcq", options:["29","7","8","27"], label:"ضع دائرة حول الإجابة الصحيحة."}],
        answers:{n:"27"},
        method:[
          "بما أن \\(x_7 = Q_1\\) فهذا يعني أن رتبة الربيع الأول \\(q_1 = 7\\).",
          `\\[ q_1 = \\frac{n+1}{4} = 7 \\Rightarrow n+1 = 28 \\Rightarrow n = 27 \\]`
        ]
      }
    ]
  };
}

function selfTestComboGen(v){
  
  return {
    branches:[
      {
        level:"سهل",
        explain:[
          "رتبة الربيع الأول: q1 = (n+1)/4.",
          "إذا كانت q1 = 7 فهذا يعني أن (n+1)/4 = 7."
        ],
        promptHtml:`<div class="qText"><b>فقرة (أ)</b>: لمجموعة من القيم المختلفة والمرتبة تصاعدياً، إذا كان \\(Q_1 = x_7\\) فإن <b>عدد القيم</b> يساوي:</div>`,
        parts:[{key:"ans", type:"mcq", options:["29","7","8","27"], label:"اختر الإجابة الصحيحة"}],
        answers:{ans:"27"},
        method:[
          "إذا كان Q1 = x7 فهذا يعني أن رتبة الربيع الأول عدد صحيح ويساوي 7.",
          "نستخدم: q1 = (n+1)/4.",
          "إذن: (n+1)/4 = 7 ⇒ n+1 = 28 ⇒ n = 27."
        ]
      },
      {
        level:"سهل",
        explain:[
          "P_r تعني أن r% من البيانات أقل من أو تساوي هذه القيمة.",
          "إذا كانت 90% أكبر من 27 فهذا يعني أن 10% أقل من أو تساوي 27."
        ],
        promptHtml:`<div class="qText"><b>فقرة (ب)</b>: في عينة إحصائية، إذا كانت أعمار \\(90\\%\\) من الأشخاص <b>تزيد</b> عن 27 سنة، فإن هذا العمر يمثل:</div>`,
        parts:[{key:"ans", type:"mcq", options:["P90","P10","P27","P73"], label:"اختر الإجابة الصحيحة"}],
        answers:{ans:"P10"},
        method:[
          "قولنا: 90% من الأعمار > 27 يعني أن 10% من الأعمار ≤ 27.",
          "وبالتالي فإن 27 هو المئين العاشر P10."
        ]
      }
    ]
  };
}

function smartBetweenP30P70Gen(v){
  
  const data = [100,110,115,118,120,123,129,135,141,145,150,200,213,240]; 
  const n = data.length;
  
  const p30 = 30*(n+1)/100; 
  const p70 = 70*(n+1)/100; 
  const it30 = _interpAt(data, p30);
  const it70 = _interpAt(data, p70);
  const P30 = _round2(it30.val);
  const P70 = _round2(it70.val);

  return {
    branches:[
      {
        level:"متوسط",
        explain:[
          "أوجد P30 و P70 ثم حدد أي قيمة تقع بينهما.",
          "الرتبة: p_r = r(n+1)/100 ، ثم P_r = x_k + α(x_{k+1}-x_k)."
        ],
        promptHtml:`<div class="qText">عدد المشتركين (بالألف) لـ 14 قناة هو:</div>
          <div class="chipRow">${data.map(x=>`<span class="chip">${x}</span>`).join("")}</div>
          <div class="qText">أي القيم التالية يقع <b>أعلى من %30</b> وأقل من <b>%70</b> من بقية القنوات؟</div>`,
        parts:[{key:"ans", type:"mcq", options:["118 ألف","120 ألف","119 ألف","100 ألف"], label:"اختر الإجابة الصحيحة"}],
        answers:{ans:"120 ألف"},
        method:[
          `نحسب رتبة P30: \\(p_{30}=\\dfrac{30(n+1)}{100}=\\dfrac{30(${n}+1)}{100}=${_round2(p30)}\\) ⇒ k=${it30.k} و α=${_round2(it30.a)}.`,
          `\\(P_{30}=x_{${it30.k}}+α(x_{${it30.k+1}}-x_{${it30.k}})=${it30.xk}+${_round2(it30.a)}(${it30.xk1}-${it30.xk})=${P30}\\).`,
          `نحسب رتبة P70: \\(p_{70}=\\dfrac{70(n+1)}{100}=\\dfrac{70(${n}+1)}{100}=${_round2(p70)}\\) ⇒ k=${it70.k} و α=${_round2(it70.a)}.`,
          `\\(P_{70}=x_{${it70.k}}+α(x_{${it70.k+1}}-x_{${it70.k}})=${it70.xk}+${_round2(it70.a)}(${it70.xk1}-${it70.xk})=${P70}\\).`,
          `إذن القيم الواقعة بين \\(P_{30}=${P30}\\) و \\(P_{70}=${P70}\\) تكون أكبر من ${P30} وأقل من ${P70}؛ ومن الخيارات المتاحة القيمة الوحيدة المناسبة هي 120 ألف.`
        ]
      }
    ]
  };
}

const TEMPLATES = [
  {id:"q1_q1_even",      title:`الربيع الأول (n زوجي)`,        icon:"1", gen: quartileEvenGen},
  {id:"q2_q3_odd",       title:`الربيع الثالث (n فردي)`,       icon:"2", gen: quartileOddGen},
  {id:"q3_percentile",   title:`المئين (Percentile)`,         icon:"3", gen: percentileGen},
  {id:"q4_relations",    title:`علاقات وتفسير`,                icon:"4", gen: tfStatementsGen},
  {id:"q5_selftest",     title:`اختيار من متعدد`,              icon:"5", gen: selfTestComboGen},
  {id:"q6_smart",        title:`سؤال ذكي`,                      icon:"6", gen: smartBetweenP30P70Gen}
];

function buildBank(){
  return TEMPLATES.map(t=>{
    const v = getVariant(t.id);
    const g = t.gen(v);
    return { id:t.id, title:t.title, icon:t.icon, branches:g.branches };
  });
}
let BANK = buildBank();
if(BANK.length===0){ console.error('BANK is empty'); }

function renderSidebar(){
  const list=document.getElementById("qList");
  list.innerHTML="";
  BANK.forEach((q,i)=>{
    const st = getQuestionStatus(q);

    let dotClass = "";
    if(st==="completed_correct") dotClass = "done";
    else if(st==="completed_wrong") dotClass = "bad";
    else if(st==="in_progress") dotClass = "progress";

    let badge;
    if(st==="completed_correct"){
      badge = el("span",{class:"badge good"},["مكتمل"]);
    }else if(st==="completed_wrong"){
      badge = el("span",{class:"badge bad"},["مكتمل"]);
    }else{
      badge = el("span",{class:"badge warn"},["غير مكتمل"]);
    }

    const item=el("div",{class:"qItem"+(state.currentIndex===i?" active":""), onclick:()=>{state.currentIndex=i;saveState();renderAll();}},[
      el("div",{class:"left"},[
        el("div",{class:"dot "+dotClass}),
        el("div",{},[
          el("div",{class:"name"},[`سؤال ${i+1}: ${q.title}`]),
          el("div",{style:"margin-top:6px"},[badge])
        ])
      ]),
      el("div",{class:"icon"},[q.icon])
    ]);
    list.appendChild(item);
  });
  typesetMath(list);
}

function setProgress(){
  let completed=0;
  BANK.forEach(q=>{ if(isQuestionDone(q)) completed++; });

  document.getElementById("qCount").textContent = BANK.length;
  document.getElementById("qNo").textContent = (state.currentIndex+1);
  document.getElementById("progressText").textContent = `${completed} / ${BANK.length}`;
  document.getElementById("progressBar").style.width = `${(completed/BANK.length)*100}%`;

  const pill = document.getElementById("statusPill");
  const doneAll = (completed===BANK.length);
  pill.textContent = doneAll ? "مكتمل" : "غير مكتمل";
  pill.className = "pill" + (doneAll ? "" : " warn");

  const showBtn = document.getElementById("showResultsBtn");
  showBtn.disabled = !doneAll;
  return {completed, doneAll};
}

function renderMain(){
  BANK = buildBank();
  const i=state.currentIndex;
  const q=BANK[i];
  const wrap=document.getElementById("mainContent");
  wrap.innerHTML="";

  const p = setProgress();

  const titleRow=el("div",{class:"qtitleRow"},[
    el("div",{class:"qtitle"},[
      el("div",{class:"qnum"},[String(i+1)]),
      el("div",{},[q.title])
    ]),
    el("div",{class:"qmeta"},[
      el("button",{class:"btn small", onclick:()=>swapQuestion(q.id)},["تبديل السؤال"]),
      el("button",{class:"btn small", disabled: !p.doneAll, onclick:()=>tryShowResults()},["إظهار النتيجة"]),
      el("button",{class:"btn small", onclick:()=>prev()},["السابق"]),
      el("button",{class:"btn primary small", onclick:()=>next()},["التالي"])
    ])
  ]);

  const branches=el("div",{class:"branches"},[]);
  q.branches.forEach((b,bi)=>{
    _touchAISessionStart(q.id, bi);
    const rawLvl = (b.level ?? b.difficulty ?? b.name ?? "");
    let lvl = (rawLvl===undefined||rawLvl===null) ? "" : String(rawLvl);
    if(lvl.trim().toLowerCase()==="undefined") lvl="";
    const tagClass=(lvl==="سهل")?"easy":(lvl==="متوسط"?"med":(lvl==="صعب"?"hard":""));
    const branchCard=el("div",{class:"branch"},[]);
    const head=el("div",{class:"branchHead"},[
      ...(lvl ? [el("span",{class:`btag ${tagClass||"easy"}`},[lvl])] : [])
    ]);
    const body=el("div",{class:"branchBody"},[]);
    if(b.promptHtml){
      body.innerHTML = b.promptHtml;
    }else{
      body.innerHTML = escapeHtml(b.prompt).replace(/\n/g,"<br/>");
    }

    const parts=el("div",{class:"parts"},[]);
    (b.parts||[]).forEach(pp=>{
      if(pp.inline) return;
      const row=el("div",{class:"part"},[]);
      const label=pp.labelHtml ? el("div",{class:"label", html: pp.labelHtml},[]) : el("div",{class:"label"},[pp.label]);
      const inputWrap=el("div",{class:"inputWrap"},[]);
      const stored = (state.answers[q.id] && state.answers[q.id][bi]) ? state.answers[q.id][bi][pp.key] : "";

      let input;
      if(pp.type==="mcq"){
        
        input=el("div",{class:"radioGroup"},[]);
        input.setAttribute("data-qid", q.id);
        input.setAttribute("data-bi", String(bi));
        input.setAttribute("data-key", pp.key);

        const name = `mcq_${q.id}_${bi}_${pp.key}`;
        const opts = (pp.options||[]);
        const letters = ["أ","ب","ج","د","هـ","و","ز"];
        opts.forEach((op, oi)=>{
          const id = `${name}_${oi}`;
          const radio = el("input",{type:"radio", name, id, value:op},[]);
          if((stored ?? "") === op) radio.checked = true;
          radio.onchange=()=>{  };
          radio.addEventListener("change", ()=>_clearMarks(input));
          const prefix = opts.length<=4 ? (letters[oi]||String(oi+1)) + ") " : (String(oi+1)+") ");
          const txt = prefix + op;
          const label = el("label",{class:"radioOpt", for:id},[
            radio,
            el("span",{class:"radioText"},[txt])
          ]);
          input.appendChild(label);
        });
      }else if(pp.type==="text"){
        input=el("textarea",{placeholder:pp.placeholder||""},[]);
        input.setAttribute("data-qid", q.id);
        input.setAttribute("data-bi", String(bi));
        input.setAttribute("data-key", pp.key);
        input.value = stored ?? "";
        input.oninput=()=>{  };
      }else{
        input=el("input",{type:"number", step:pp.step||"1", placeholder:pp.placeholder||""},[]);
        input.setAttribute("data-qid", q.id);
        input.setAttribute("data-bi", String(bi));
        input.setAttribute("data-key", pp.key);
        input.value = stored ?? "";
        input.oninput=()=>{  };
      }

      inputWrap.appendChild(input);
      
      if(pp.type==="mcq"){
        
      }else{
        input.addEventListener("input", ()=>_clearMarks(input));
        input.addEventListener("change", ()=>_clearMarks(input));
      }

      
      if(_isBranchLocked(q.id, bi)){
        if(pp.type==="mcq"){
          input.querySelectorAll('input[type="radio"]').forEach(r=>r.disabled=true);
        }else{
          input.disabled = true;
        }
      }

      
      const lbl = (pp.label||"");
      if(lbl.includes("نسبي") || lbl.includes("مئوية")){
        const txt = lbl.includes("مئوية") ? "قرّب إلى منزلتين عشريتين (بدون علامة %)." : "قرّب إلى منزلتين عشريتين.";
        inputWrap.appendChild(el("div",{class:"hint"},[txt]));
      }
      row.appendChild(label);
      row.appendChild(inputWrap);
      parts.appendChild(row);
    });

    const locked = _isBranchLocked(q.id, bi);
    const saveBtn = el("button",{class:"btn primary small"},[locked?"محفوظ":"حفظ الإجابة"]);
    saveBtn.disabled = locked;
    saveBtn.onclick = ()=>saveBranchAnswer(q, b, bi, branchCard, saveBtn);

    const btns=el("div",{class:"branchBtns"},[
      saveBtn,
      el("button",{class:"btn small", onclick:()=>showHelp(q, b)},["مساعدة"])
    ]);

    branchCard.appendChild(head);
    branchCard.appendChild(body);
    if((b.parts||[]).length>0) branchCard.appendChild(parts);
    branchCard.appendChild(btns);
    bindInlineInputs(branchCard, q.id, bi);
    branches.appendChild(branchCard);
  });

  wrap.appendChild(titleRow);
  wrap.appendChild(branches);
  typesetMath(wrap);

}

function showExplain(q, b){
  const lvl = (b.level || b.difficulty || b.name || "").toString();
  const list = (Array.isArray(b.explain) ? b.explain : []).map(s=>`<li>${escapeHtml(s)}</li>`).join("");
  const html = `
    <div style="font-weight:900;margin-bottom:8px">${escapeHtml(q.title)} — (${escapeHtml(lvl)})</div>
    ${list ? `<ul style="margin:0;padding-right:18px">${list}</ul>` : ``}
  `;
  openModal("شرح السؤال", html);
}

function showMethod(q, b){
  const items = (b.method||["اتبع الخطوات المناسبة للحل."]).map(s=>`<li><div class="methodLine">${s}</div></li>`).join("");
  const rawLvl = (b.level ?? b.difficulty ?? b.name ?? "");
  let lvl = (rawLvl===undefined||rawLvl===null) ? "" : String(rawLvl);
  if(lvl.trim().toLowerCase()==="undefined") lvl="";
  const head = lvl ? `${escapeHtml(q.title)} — <span class="badge small">${escapeHtml(lvl)}</span>` : `${escapeHtml(q.title)}`;
  const html = `
    <div class="methodHead">${head}</div>
    <ul class="methodList">${items}</ul>
  `;
  openModal("طريقة الحل", html);
}

function showHelp(q, b){
  const qid = q && q.id ? q.id : "";
  const bi = (q && q.branches) ? q.branches.indexOf(b) : -1;
  if(qid && bi>=0) _setAIHelpUsage(qid, bi, true);
  const title = escapeHtml(q.title||"");
  const levelRaw = (b.level ?? b.difficulty ?? b.name ?? "");
  let level = (levelRaw===undefined||levelRaw===null) ? "" : String(levelRaw);
  if(level.trim().toLowerCase()==="undefined") level="";
  const explainHtml = (b.explain && b.explain.length)
    ? `<div style="font-weight:900;margin:10px 0 6px">شرح السؤال</div>
       <ul style="margin:0;padding-right:18px">${b.explain.map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";
  openModal("مساعدة", `<div style="font-weight:900;margin-bottom:6px">${title}${level?` — (${escapeHtml(level)})`:""}</div>${explainHtml}`);
}

function _checkPart(part, studentRaw, correct){
  const raw = (studentRaw ?? "").toString().trim();
  if(raw==="") return {ok:false, empty:true};
  if(part.type==="mcq" || part.type==="text"){
    return {ok: normalizeText(raw) === normalizeText(correct), empty:false};
  }
  return {ok: nearlyEqual(Number(raw), Number(correct), 1e-2), empty:false};
}

function _getInputValue(part, node){
  if(!node) return "";
  if(part && part.type==="mcq"){
    if(node.tagName && node.tagName.toLowerCase()==="select"){
      return (node.value ?? "").toString().trim();
    }
    const checked = node.querySelector ? node.querySelector('input[type="radio"]:checked') : null;
    return checked ? (checked.value ?? "").toString().trim() : "";
  }
  return (node.value ?? "").toString().trim();
}

function _lockBranchInputs(branchCard, qid, bi){
  const nodes = branchCard.querySelectorAll(`[data-qid="${qid}"][data-bi="${bi}"][data-key]`);
  nodes.forEach(n=>{
    
    if("disabled" in n) n.disabled = true;
    
    if(n.querySelectorAll){
      n.querySelectorAll("input,select,textarea,button").forEach(ch=>{
        if("disabled" in ch) ch.disabled = true;
      });
    }
  });
}

function _showCorrectModal(q, b, wrongItems){
  const title = escapeHtml(q.title||"");
  const rawLvl = (b.level ?? b.difficulty ?? b.name ?? "");
  let lvl = (rawLvl===undefined||rawLvl===null) ? "" : String(rawLvl);
  if(lvl.trim().toLowerCase()==="undefined") lvl="";

  const methodItems = (b.method && b.method.length)
    ? `<div style="margin:10px 0 6px;font-weight:900">طريقة الحل</div>
       <ul style="margin:0;padding-right:18px">${b.method.map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";

  const list = wrongItems.map(it=>{
    const label = it.labelHtml ? it.labelHtml : escapeHtml(it.label||it.key);
    const val = (typeof it.correct === "number") ? formatNumber(it.correct) : escapeHtml(it.correct);
    return `<li style="margin:8px 0"><div style="font-weight:900">${label}</div><div style="margin-top:4px;color:#0b2b4c;font-weight:900">${val}</div></li>`;
  }).join("");

  const html = `
    <div style="font-weight:900;margin-bottom:6px">${title}${lvl?` — (${escapeHtml(lvl)})`:""}</div>
    ${methodItems}
    <div style="margin:10px 0 6px;font-weight:900">الإجابة الصحيحة</div>
    <ul style="margin:0;padding-right:18px">${list}</ul>
    <div style="margin-top:10px;color:#5b6b7a;font-weight:800">تم إظهار الإجابة الصحيحة، ولا يمكن تعديل الإجابة بعد ذلك.</div>
  `;
  openModal("الإجابة الصحيحة", html);
}

function saveBranchAnswer(q, b, bi, branchCard, saveBtn){
  const qid = q.id;
  if(_isBranchLocked(qid, bi)) return;

  const parts = (b.parts||[]);
  const results = [];
  let hasEmpty = false;

  parts.forEach(p=>{
    const key = p.key;
    const inp = branchCard.querySelector(`[data-qid="${qid}"][data-bi="${bi}"][data-key="${key}"]`);
    if(!inp) return;
    const student = _getInputValue(p, inp);
    const correct = b.answers ? b.answers[key] : undefined;
    const chk = _checkPart(p, student, correct);
    if(chk.empty) hasEmpty = true;
    results.push({key, part:p, inp, correct, ...chk});
  });

  if(hasEmpty){
    openModal("تنبيه", `<div style="font-weight:900">أكمل إدخال الإجابة ثم اضغط زر حفظ الإجابة.</div>`);
    return;
  }

  
  if(!state.answers[qid]) state.answers[qid] = {};
  if(!state.answers[qid][bi]) state.answers[qid][bi] = {};
  results.forEach(r=>{
    state.answers[qid][bi][r.key] = _getInputValue(r.part, r.inp);
  });
  saveState();

  const wrong = results.filter(r=>!r.ok);
  const right = results.filter(r=>r.ok);

  right.forEach(r=>_mark(r.inp, "right"));

  if(wrong.length===0){
    const payload = {
      question_id: qid,
      skill_id: _questionSkillId(q),
      topic_id: _questionSkillId(q),
      difficulty: _branchDifficulty(b),
      is_correct: true,
      attempts_count: _getSaveAttempt(qid, bi) + 1,
      used_help: _getAIHelpUsage(qid, bi),
      time_spent_sec: _getAndResetAISessionTimeSec(qid, bi),
      showed_solution: false
    };
    _runAdaptiveInference(payload, branchCard);
    _clearSaveAttempt(qid, bi);
    _setOutcome(qid, bi, "correct");
    _setBranchLocked(qid, bi, true);
    _lockBranchInputs(branchCard, qid, String(bi));
    if(saveBtn) saveBtn.disabled = true;
    setProgress();
    renderSidebar();
    return;
  }

  const n = _incSaveAttempt(qid, bi);
  if(n<=1){
    wrong.forEach(r=>_mark(r.inp, "wrong1"));
    _setOutcome(qid, bi, null);
    showHelp(q, b);
    const payload = {
      question_id: qid,
      skill_id: _questionSkillId(q),
      topic_id: _questionSkillId(q),
      difficulty: _branchDifficulty(b),
      is_correct: false,
      attempts_count: n,
      used_help: true,
      time_spent_sec: _getAndResetAISessionTimeSec(qid, bi),
      showed_solution: false
    };
    _runAdaptiveInference(payload, branchCard);
  }else{
    wrong.forEach(r=>_mark(r.inp, "wrong2"));
    const wrongItems = wrong.map(r=>({
      key:r.key,
      label: r.part.label,
      labelHtml: r.part.labelHtml,
      correct: r.correct
    }));
    _setOutcome(qid, bi, "wrong");
    const payload = {
      question_id: qid,
      skill_id: _questionSkillId(q),
      topic_id: _questionSkillId(q),
      difficulty: _branchDifficulty(b),
      is_correct: false,
      attempts_count: n,
      used_help: true,
      time_spent_sec: _getAndResetAISessionTimeSec(qid, bi),
      showed_solution: true
    };
    _runAdaptiveInference(payload, branchCard);
    _setBranchLocked(qid, bi, true);
    _lockBranchInputs(branchCard, qid, String(bi));
    if(saveBtn) saveBtn.disabled = true;
    _showCorrectModal(q, b, wrongItems);
  }

  setProgress();
  renderSidebar();
}

function swapQuestion(qid){
  bumpVariant(qid);
  clearAnswersForQuestion(qid);
  BANK = buildBank();
  renderAll();
}
function next(){ if(state.currentIndex < BANK.length-1){state.currentIndex++;saveState();renderAll();} else tryShowResults(); }
function prev(){ if(state.currentIndex>0){state.currentIndex--;saveState();renderAll();} }

function gradeAll(){
  state.grading = {};
  BANK.forEach((q)=>{
    const qid=q.id;
    state.grading[qid] = {};
    q.branches.forEach((b,bi)=>{
      state.grading[qid][bi] = {};
      (b.parts||[]).forEach(p=>{
        const student = (state.answers[qid] && state.answers[qid][bi]) ? state.answers[qid][bi][p.key] : "";
        const correct = b.answers[p.key];
        let ok=false;
        if(p.type==="mcq"){
          ok = normalizeText(student) === normalizeText(correct);
        }else if(p.type==="text"){
          ok = normalizeText(student) === normalizeText(correct);
        }else{
          ok = nearlyEqual(Number(student), Number(correct), 1e-2);
        }
        state.grading[qid][bi][p.key] = ok;
      });
    });
  });
  saveState();
}
function computeScore(){
  let correct=0,total=0;
  BANK.forEach(q=>{
    const qid=q.id;
    q.branches.forEach((b,bi)=>{
      const keys = collectPartKeys(q,b);
      keys.forEach(k=>{
        total++;
        const ok = state.grading[qid] && state.grading[qid][bi] ? state.grading[qid][bi][k] : false;
        if(ok) correct++;
      });
    });
  });
  return {correct,total};
}

function tryShowResults(){
  syncAllInputs();
  const p = setProgress();
  if(!p.doneAll){
    const inc = listIncomplete();
    const html = `
      <div style="font-weight:900;margin-bottom:8px">لا يمكن إظهار النتيجة قبل إكمال جميع الأسئلة.</div>
      <div style="color:#5b6b7a;font-weight:800;margin-bottom:10px">الأسئلة غير المكتملة:</div>
      <ul style="margin:0;padding-right:18px">
        ${inc.map(x=>`<li><b>سؤال ${x.i}</b>: ${escapeHtml(x.title)}</li>`).join("")}
      </ul>
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        ${inc.slice(0,4).map(x=>`<button class="btn small" onclick="window.__goToQ(${x.i-1})">اذهب لسؤال ${x.i}</button>`).join("")}
      </div>`;
    openModal("تنبيه", html);
    return;
  }
  showResults();
}
window.__goToQ = function(idx){
  closeModal();
  state.currentIndex = idx;
  saveState();
  renderAll();
}

function syncAllInlineInputs(){  }

function syncAllInputs(){  }

function showResults(){
  syncAllInlineInputs();
  BANK = buildBank();
  gradeAll();
  const s = computeScore();
  const pct = Math.round((s.correct/s.total)*1000)/10;

  const header = `
    <div class="scoreCard">
      <div>
        <div class="scoreBig">النتيجة: ${s.correct} من ${s.total} — ${pct}%</div>
        <div class="scoreSub">توضيح: تم تصحيح كل جزء بشكل مستقل.</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn small" onclick="resetAll(); closeModal();">إعادة تعيين</button>
      </div>
    </div>
  `;

  const qCards = BANK.map((q,i)=>{
    const qid = q.id;
    const st = getQuestionStatus(q);
    const isCorrect = (st === "completed_correct");
    let card = `
      <div class="resultCard">
        <div class="rt">
          <div style="font-weight:900">سؤال ${i+1}: ${escapeHtml(q.title||"")}</div>
          <span class="tag ${isCorrect?"good":"bad"}">${isCorrect?"صحيح":"غير صحيح"}</span>
        </div>
    `;

    q.branches.forEach((b,bi)=>{
      const rawLvl = (b.level ?? b.difficulty ?? b.name ?? "");
      let lvl = (rawLvl===undefined||rawLvl===null) ? "" : String(rawLvl);
      if(lvl.trim().toLowerCase()==="undefined") lvl="";
      if(lvl.trim()!==""){
        card += `<div style="margin-top:10px;font-weight:900;color:#0f2a3b">(${escapeHtml(lvl)})</div>`;
      }

      (b.parts||[]).forEach(p=>{
        const student = (state.answers[qid] && state.answers[qid][bi]) ? state.answers[qid][bi][p.key] : "";
        const correctVal = b.answers[p.key];
        const need2 = (p.label||"").includes("نسبي") || (p.label||"").includes("مئوية");

        let studentText = "—";
        if((student??"").toString().trim()!==""){
          if(p.type==="mcq" || p.type==="text"){
            studentText = escapeHtml(String(student));
          }else{
            studentText = need2 ? fmt2(student) : formatNumber(student);
          }
        }

        const correctText = (p.type==="mcq" || p.type==="text")
          ? escapeHtml(String(correctVal))
          : (need2 ? fmt2(correctVal) : formatNumber(correctVal));

        const ok = state.grading[qid] && state.grading[qid][bi] ? state.grading[qid][bi][p.key] : false;

        card += `
          <div class="partRow">
            <div><b>الجزء:</b> ${escapeHtml(p.label||p.key||"")}</div>
            <div><b>إجابتك:</b> ${studentText}</div>
            <div><b>الصحيح:</b> ${correctText} <span class="tag ${ok?"good":"bad"}" style="margin-right:8px">${ok?"✓":"×"}</span></div>
          </div>
        `;
      });
    });

    card += `</div>`;
    return card;
  }).join("");

  const footer = `
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-start">
      <button class="btn primary" onclick="closeModal()">إغلاق</button>
    </div>
  `;

  openModal("النتيجة", `<div class="resultWrap">${header}${qCards}${footer}</div>`);
}

document.getElementById("nextBtnSide").onclick = next;
document.getElementById("showResultsBtn").onclick = tryShowResults;
document.getElementById("resetBtn").onclick = resetAll;

function renderAll(){ renderMain(); renderSidebar(); setProgress(); }
window.addEventListener("load", ()=>{ renderAll(); });
window.addEventListener("load", ()=>{
  if(!window.AdaptiveLearning){
    const script = document.createElement("script");
    script.src = "assets/js/adaptive_learning.js";
    script.onload = ()=>{
      if(window.AdaptiveLearning && typeof window.AdaptiveLearning.loadModelWeights==="function"){
        Promise.resolve(window.AdaptiveLearning.loadModelWeights({
          bktPath: "models/bkt_model.json",
          lrPath: "models/lr_model.json"
        })).catch(()=>{});
      }
    };
    document.head.appendChild(script);
    return;
  }
  if(window.AdaptiveLearning && typeof window.AdaptiveLearning.loadModelWeights==="function"){
    Promise.resolve(window.AdaptiveLearning.loadModelWeights({
      bktPath: "models/bkt_model.json",
      lrPath: "models/lr_model.json"
    })).catch(()=>{});
  }
});

window.exportTrainingData = function(){
  if(window.AdaptiveLearning && typeof window.AdaptiveLearning.exportTrainingData==="function"){
    return window.AdaptiveLearning.exportTrainingData();
  }
  return null;
};

