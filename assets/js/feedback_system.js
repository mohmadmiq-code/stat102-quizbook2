(function(){
  "use strict";
  if(typeof window === "undefined" || typeof document === "undefined") return;
  if(window.__feedbackSystemReady) return;
  window.__feedbackSystemReady = true;
  const USE_CASIO_CALC = true;

  const FEEDBACK_ENDPOINT = "";
  const FEEDBACK_TYPES = ["خطأ في السؤال","خطأ في الحل","خطأ لغوي","اقتراح تحسين","صعوبة في الفهم","أخرى"];
  const LESSON_ID = (function(){
    const path = String(location.pathname || "");
    const m = path.match(/STAT102_\d+_\d+/i);
    return m ? m[0] : "STAT102";
  })();
  const STORAGE_KEY = "feedback_items_" + LESSON_ID;
  const PENDING_KEY = "feedback_pending_" + LESSON_ID;
  const SESSION_KEY = "feedback_session_" + LESSON_ID;

  const state = {
    modalMeta: null,
    lastLockedContext: null,
    calcTargetInput: null,
    calcBranch: null,
    calcAngleMode: "DEG",
    calcAns: 0
  };

  function readArray(key){
    try{
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(_e){
      return [];
    }
  }
  function writeArray(key, value){
    try{ localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])); }catch(_e){}
  }
  function ensureSessionId(){
    let sid = "";
    try{ sid = String(sessionStorage.getItem(SESSION_KEY) || ""); }catch(_e){}
    if(!sid){
      sid = "fb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      try{ sessionStorage.setItem(SESSION_KEY, sid); }catch(_e){}
    }
    return sid;
  }
  function nowIso(){ return new Date().toISOString(); }

  function injectCss(){
    if(document.getElementById("feedback-system-style")) return;
    const style = document.createElement("style");
    style.id = "feedback-system-style";
    style.textContent = [
      ".btn.feedback-btn{border-color:#c7d2fe;background:#eef2ff;color:#3730a3;font-weight:800;}",
      ".btn.feedback-btn:hover{border-color:#a5b4fc;background:#e0e7ff;}",
      ".feedback-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:3999;padding:16px;}",
      ".feedback-modal.show{display:flex;}",
      ".feedback-shell{width:min(560px,calc(100vw - 32px));background:#fff;border-radius:18px;border:1px solid #e2e8f0;box-shadow:0 24px 46px rgba(15,23,42,.22);overflow:hidden;}",
      ".feedback-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:linear-gradient(145deg,#eef2ff,#e0f2fe);}",
      ".feedback-head b{font-size:16px;color:#1f2937;}",
      ".feedback-body{padding:16px;display:grid;gap:12px;}",
      ".feedback-label{font-size:13px;font-weight:800;color:#334155;}",
      ".feedback-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start;}",
      ".feedback-note{font-size:12px;color:#64748b;font-weight:700;}"
    ].join("");
    document.head.appendChild(style);
  }

  function injectCalculatorCss(){
    if(document.getElementById("calculator-system-style")) return;
    const style = document.createElement("style");
    style.id = "calculator-system-style";
    style.textContent = [
      ".btn.calc-btn{border-color:#bae6fd;background:#ecfeff;color:#0e7490;font-weight:800;}",
      ".btn.calc-btn:hover{border-color:#67e8f9;background:#cffafe;}",
      ".calc-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:4005;padding:16px;}",
      ".calc-modal.show{display:flex;}",
      ".calc-shell{direction:ltr;width:min(430px,calc(100vw - 20px));background:#111827;border-radius:18px;border:1px solid #374151;box-shadow:0 24px 60px rgba(0,0,0,.45);overflow:hidden;}",
      ".calc-head{padding:10px 12px;background:linear-gradient(145deg,#111827,#1f2937);border-bottom:1px solid #374151;display:flex;justify-content:space-between;align-items:center;color:#f3f4f6;}",
      ".calc-screen-wrap{padding:10px 12px;background:#0b1220;border-bottom:1px solid #334155;display:grid;gap:8px;}",
      ".calc-screen{direction:ltr;unicode-bidi:plaintext;text-align:right;background:#020617;color:#e2e8f0;border-radius:10px;padding:10px 12px;font-weight:800;min-height:42px;letter-spacing:.3px;border:1px solid #1e293b;}",
      ".calc-frac{padding:10px 12px;background:#0f172a;border-top:1px solid #334155;border-bottom:1px solid #334155;display:grid;grid-template-columns:1fr 1fr auto;gap:8px;}",
      ".calc-frac input{direction:ltr;text-align:center;border:1px solid #334155;background:#020617;color:#e2e8f0;border-radius:8px;padding:8px 6px;font-weight:700;min-width:0;}",
      ".calc-frac .btn{white-space:nowrap;}",
      ".calc-grid{padding:12px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px;background:#111827;}",
      ".calc-grid button{direction:ltr;unicode-bidi:plaintext;border:1px solid #334155;background:#1f2937;color:#e5e7eb;border-radius:10px;padding:10px 0;font-weight:800;cursor:pointer;}",
      ".calc-grid button:hover{background:#334155;}",
      ".calc-op{background:#0f172a !important;color:#67e8f9 !important;border-color:#155e75 !important;}",
      ".calc-eq{background:#0ea5e9 !important;color:#fff !important;border-color:#0284c7 !important;}",
      ".calc-actions{padding:0 12px 12px;display:flex;gap:8px;}",
      ".calc-actions .btn{flex:1;justify-content:center}",
      ".calc-mini{font-size:11px;font-weight:700;opacity:.85;color:#94a3b8;}"
    ].join("");
    document.head.appendChild(style);
  }

  function ensureModal(){
    let root = document.getElementById("feedbackModalRootGlobal");
    if(root) return root;
    root = document.createElement("div");
    root.id = "feedbackModalRootGlobal";
    root.className = "feedback-modal";
    root.innerHTML = [
      '<div class="feedback-shell" role="dialog" aria-modal="true" aria-labelledby="feedbackModalTitleGlobal">',
      '  <div class="feedback-head">',
      '    <b id="feedbackModalTitleGlobal">إرسال ملاحظة</b>',
      '    <button type="button" class="btn small" id="feedbackCloseBtnGlobal">إغلاق</button>',
      "  </div>",
      '  <div class="feedback-body">',
      '    <div class="feedback-label">نوع الملاحظة</div>',
      '    <select id="feedbackTypeSelectGlobal"></select>',
      '    <div class="feedback-label">اكتب الملاحظة</div>',
      '    <textarea id="feedbackTextInputGlobal" rows="5" placeholder="اكتب ملاحظتك هنا..."></textarea>',
      '    <div class="feedback-note">لن تُفقد الملاحظة حتى لو فشل الإرسال؛ سيتم حفظها محلياً.</div>',
      '    <div class="feedback-actions">',
      '      <button type="button" class="btn primary" id="feedbackSubmitBtnGlobal">إرسال</button>',
      '      <button type="button" class="btn small" id="feedbackCancelBtnGlobal">إغلاق</button>',
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");
    document.body.appendChild(root);

    const typeSelect = root.querySelector("#feedbackTypeSelectGlobal");
    if(typeSelect){
      FEEDBACK_TYPES.forEach((label)=>{
        const op = document.createElement("option");
        op.value = label;
        op.textContent = label;
        typeSelect.appendChild(op);
      });
    }
    root.addEventListener("click", (e)=>{ if(e.target === root) closeFeedbackModal(); });
    const closeBtn = root.querySelector("#feedbackCloseBtnGlobal");
    const cancelBtn = root.querySelector("#feedbackCancelBtnGlobal");
    const submitBtn = root.querySelector("#feedbackSubmitBtnGlobal");
    if(closeBtn) closeBtn.onclick = closeFeedbackModal;
    if(cancelBtn) cancelBtn.onclick = closeFeedbackModal;
    if(submitBtn){
      submitBtn.onclick = async function(){
        const payload = collectFeedbackPayload();
        if(!payload){
          notify("تنبيه", "اكتب نص الملاحظة قبل الإرسال.");
          return;
        }
        const rec = saveFeedbackLocally(payload);
        const sent = await submitFeedback(payload);
        if(sent && sent.success){
          markSent(rec.local_id);
          closeFeedbackModal();
          notify("تم", "تم إرسال الملاحظة بنجاح.");
      }else if(sent && sent.skipped){
        markLocalOnly(rec.local_id);
        closeFeedbackModal();
        notify("تم الحفظ", "تم حفظ الملاحظة محليًا فقط لأن رابط الإرسال غير مضبوط.");
        }else{
          queuePending(rec.local_id);
          closeFeedbackModal();
          notify("تم الحفظ محليًا", "تعذر الإرسال الآن. تم حفظ الملاحظة محليًا وسيتم إعادة المحاولة لاحقًا.");
        }
      };
    }
    return root;
  }

  function ensureCalcModal(){
    let root = document.getElementById("calcModalRootGlobal");
    if(root) return root;
    root = document.createElement("div");
    root.id = "calcModalRootGlobal";
    root.className = "calc-modal";
    root.innerHTML = [
      '<div class="calc-shell" role="dialog" aria-modal="true">',
      '  <div class="calc-head"><div><b>Scientific Calculator</b></div><div style="display:flex;gap:6px"><button class="btn small" type="button" id="calcAngleBtn">DEG</button><button class="btn small" type="button" id="calcCloseBtn">Close</button></div></div>',
      '  <div class="calc-screen-wrap">',
      '    <div class="calc-screen" id="calcExpr">0</div>',
      '    <div class="calc-screen" id="calcResult">0</div>',
      "  </div>",
      '  <div class="calc-frac">',
      '    <input type="text" id="calcFracNum" placeholder="Numerator">',
      '    <input type="text" id="calcFracDen" placeholder="Denominator">',
      '    <button class="btn small" type="button" id="calcAddFracBtn">Add Fraction</button>',
      "  </div>",
      '  <div class="calc-grid" id="calcGrid"></div>',
      '  <div class="calc-actions">',
      '    <button class="btn small" id="calcClearBtn" type="button">AC</button>',
      '    <button class="btn primary small" id="calcUseBtn" type="button">Use Result</button>',
      "  </div>",
      "</div>"
    ].join("");
    document.body.appendChild(root);

    const keys = [
      {label:"sin", value:"sin(", op:true},
      {label:"cos", value:"cos(", op:true},
      {label:"tan", value:"tan(", op:true},
      {label:"sqrt", value:"sqrt(", op:true},
      {label:"log", value:"log(", op:true},
      {label:"ln", value:"ln(", op:true},
      {label:"x^y", value:"^", op:true},
      {label:"x²", value:"SQR", op:true},
      {label:"1/x", value:"INV", op:true},
      {label:"n/d", value:"FRAC", op:true},
      {label:"7", value:"7"},
      {label:"8", value:"8"},
      {label:"9", value:"9"},
      {label:"÷", value:"/", op:true},
      {label:"(", value:"(", op:true},
      {label:"4", value:"4"},
      {label:"5", value:"5"},
      {label:"6", value:"6"},
      {label:"×", value:"*", op:true},
      {label:")", value:")", op:true},
      {label:"1", value:"1"},
      {label:"2", value:"2"},
      {label:"3", value:"3"},
      {label:"−", value:"-", op:true},
      {label:"%", value:"%", op:true},
      {label:"0", value:"0"},
      {label:".", value:"."},
      {label:"π", value:"pi", op:true},
      {label:"e", value:"e", op:true},
      {label:"+", value:"+", op:true},
      {label:"+/-", value:"NEG", op:true},
      {label:"Ans", value:"ANS", op:true},
      {label:"⌫", value:"⌫", op:true},
      {label:"=", value:"=", eq:true}
    ];
    const grid = root.querySelector("#calcGrid");
    keys.forEach((k)=>{
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = k.label;
      if(k.op) b.className = "calc-op";
      if(k.eq) b.className = "calc-eq";
      b.onclick = ()=>onCalcKey(k.value);
      grid.appendChild(b);
    });

    const closeBtn = root.querySelector("#calcCloseBtn");
    const angleBtn = root.querySelector("#calcAngleBtn");
    const clearBtn = root.querySelector("#calcClearBtn");
    const useBtn = root.querySelector("#calcUseBtn");
    const addFracBtn = root.querySelector("#calcAddFracBtn");
    if(closeBtn) closeBtn.onclick = closeCalcModal;
    if(angleBtn){
      angleBtn.onclick = function(){
        state.calcAngleMode = (state.calcAngleMode === "DEG") ? "RAD" : "DEG";
        angleBtn.textContent = state.calcAngleMode;
        updateCalcResult();
      };
    }
    if(clearBtn) clearBtn.onclick = ()=>setCalcExpr("0");
    if(useBtn) useBtn.onclick = useCalcResult;
    if(addFracBtn) addFracBtn.onclick = addFractionFromFields;
    root.addEventListener("click",(e)=>{ if(e.target===root) closeCalcModal(); });
    return root;
  }

  function setCalcExpr(expr){
    const root = ensureCalcModal();
    const ex = root.querySelector("#calcExpr");
    if(ex) ex.textContent = expr && expr!==" " ? expr : "0";
    updateCalcResult();
  }
  function getCalcExpr(){
    const root = ensureCalcModal();
    const ex = root.querySelector("#calcExpr");
    return ex ? String(ex.textContent || "0") : "0";
  }
  function safeEval(expr){
    let clean = String(expr || "").replace(/\s+/g,"");
    if(!clean) return null;
    clean = clean.replace(/pi/g,"Math.PI").replace(/\be\b/g,"Math.E");
    clean = clean.replace(/sqrt\(/g,"Math.sqrt(").replace(/log\(/g,"Math.log10(").replace(/ln\(/g,"Math.log(");
    clean = clean.replace(/sin\(/g,"_sin(").replace(/cos\(/g,"_cos(").replace(/tan\(/g,"_tan(");
    clean = clean.replace(/\^/g,"**");
    clean = clean.replace(/(\d+(\.\d+)?)%/g,"($1/100)");
    if(!/^[0-9+\-*/().,A-Za-z_]+$/.test(clean)) return null;
    try{
      const mode = state.calcAngleMode || "DEG";
      const toRad = function(v){ return mode === "DEG" ? (v * Math.PI / 180) : v; };
      const _sin = function(v){ return Math.sin(toRad(v)); };
      const _cos = function(v){ return Math.cos(toRad(v)); };
      const _tan = function(v){ return Math.tan(toRad(v)); };
      const val = Function("_sin","_cos","_tan", '"use strict"; return (' + clean + ');')(_sin,_cos,_tan);
      if(typeof val !== "number" || !isFinite(val)) return null;
      return val;
    }catch(_e){
      return null;
    }
  }
  function updateCalcResult(){
    const root = ensureCalcModal();
    const out = root.querySelector("#calcResult");
    const val = safeEval(getCalcExpr());
    if(out) out.textContent = val==null ? "Error" : String(Math.round(val * 1000000) / 1000000);
    if(val!=null) state.calcAns = Number(val);
  }
  function onCalcKey(k){
    let ex = getCalcExpr();
    if(ex==="0" && ![".","⌫","=","C","+","-","*","/","(",")","^","%"].includes(k)) ex = "";
    if(k==="C"){ setCalcExpr("0"); return; }
    if(k==="⌫"){ setCalcExpr(ex.length>1 ? ex.slice(0,-1) : "0"); return; }
    if(k==="="){ updateCalcResult(); return; }
    if(k==="SQR"){ setCalcExpr("(" + (ex==="0" ? "0" : ex) + ")^2"); return; }
    if(k==="INV"){ setCalcExpr("1/(" + (ex==="0" ? "1" : ex) + ")"); return; }
    if(k==="ANS"){ setCalcExpr((ex==="0" ? "" : ex) + String(Math.round((state.calcAns||0)*1000000)/1000000)); return; }
    if(k==="FRAC"){
      setCalcExpr((ex==="0" ? "" : ex) + "(1/1)");
      return;
    }
    if(k==="NEG"){
      if(ex==="0"){ setCalcExpr("-"); return; }
      if(ex.startsWith("-")) setCalcExpr(ex.slice(1));
      else setCalcExpr("-" + ex);
      return;
    }
    if(k==="pi") k = "pi";
    if(k==="e") k = "e";
    setCalcExpr((ex==="0" ? "" : ex) + k);
  }
  function addFractionFromFields(){
    const root = ensureCalcModal();
    const n = root.querySelector("#calcFracNum");
    const d = root.querySelector("#calcFracDen");
    const num = String((n && n.value) || "").trim();
    const den = String((d && d.value) || "").trim();
    if(!num || !den){
      notify("Calculator","Enter numerator and denominator.");
      return;
    }
    if(Number(den)===0){
      notify("Calculator","Denominator cannot be zero.");
      return;
    }
    const ex = getCalcExpr();
    setCalcExpr((ex==="0" ? "" : ex) + "(" + num + "/" + den + ")");
    if(n) n.value = "";
    if(d) d.value = "";
  }
  function openCalcModal(branchEl){
    state.calcBranch = branchEl || null;
    const root = ensureCalcModal();
    setCalcExpr("0");
    root.classList.add("show");
  }
  function closeCalcModal(){
    const root = document.getElementById("calcModalRootGlobal");
    if(root) root.classList.remove("show");
  }
  function isNumericInput(el){
    if(!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if(tag !== "input") return false;
    const t = String(el.getAttribute("type") || "").toLowerCase();
    const im = String(el.getAttribute("inputmode") || "").toLowerCase();
    return t==="number" || im==="decimal" || im==="numeric";
  }
  function useCalcResult(){
    const root = ensureCalcModal();
    const out = root.querySelector("#calcResult");
    const txt = out ? String(out.textContent || "").trim() : "";
    if(!txt || txt==="خطأ") return;
    let target = state.calcTargetInput;
    if(!target || !isNumericInput(target) || target.disabled){
      const branch = state.calcBranch;
      target = branch ? branch.querySelector('input[type="number"],input[inputmode="decimal"],input[inputmode="numeric"]') : null;
    }
    if(target && !target.disabled){
      target.value = txt;
      target.dispatchEvent(new Event("input",{bubbles:true}));
      target.dispatchEvent(new Event("change",{bubbles:true}));
      closeCalcModal();
      return;
    }
    notify("تنبيه","حدد خانة رقمية أولاً داخل نفس السؤال.");
  }

  function notify(title, msg){
    if(typeof window.openModal === "function"){
      window.openModal(title, "<div style='font-weight:900'>" + escapeHtml(msg) + "</div>");
      return;
    }
    alert(msg);
  }

  function closeFeedbackModal(){
    const root = document.getElementById("feedbackModalRootGlobal");
    if(root) root.classList.remove("show");
  }

  function getCurrentQuestionMeta(){
    const idx = (typeof window.state === "object" && window.state && Number.isFinite(window.state.currentIndex))
      ? window.state.currentIndex : null;
    const q = (Array.isArray(window.BANK) && idx!=null && window.BANK[idx]) ? window.BANK[idx] : null;
    return {
      question_id: q && q.id ? String(q.id) : "",
      topic_id: q && (q.topic_id || q.topicId) ? String(q.topic_id || q.topicId) : (q && q.id ? String(q.id) : ""),
      lesson_id: LESSON_ID
    };
  }

  function snapshotAnswers(qid, bi){
    try{
      if(!window.state || !window.state.answers) return "";
      const qAns = window.state.answers[qid];
      if(!qAns) return "";
      const val = (bi!=null && qAns[bi]!=null) ? qAns[bi] : qAns;
      const str = JSON.stringify(val || {});
      return str.length > 1200 ? str.slice(0, 1200) + "...(truncated)" : str;
    }catch(_e){
      return "";
    }
  }

  function attemptsCount(qid, bi){
    try{
      if(typeof window._getSaveAttempt === "function"){
        return Number(window._getSaveAttempt(qid, bi) || 0);
      }
    }catch(_e){}
    return 0;
  }

  function openFeedbackModal(questionMeta){
    state.modalMeta = questionMeta || {};
    const root = ensureModal();
    const txt = root.querySelector("#feedbackTextInputGlobal");
    const typ = root.querySelector("#feedbackTypeSelectGlobal");
    if(typ) typ.value = FEEDBACK_TYPES[0];
    if(txt) txt.value = "";
    root.classList.add("show");
    setTimeout(()=>{ try{ txt && txt.focus(); }catch(_e){} }, 40);
  }

  function collectFeedbackPayload(){
    const root = document.getElementById("feedbackModalRootGlobal");
    if(!root) return null;
    const txt = root.querySelector("#feedbackTextInputGlobal");
    const typ = root.querySelector("#feedbackTypeSelectGlobal");
    const feedbackText = String((txt && txt.value) || "").trim();
    if(!feedbackText) return null;

    const meta = state.modalMeta || {};
    const current = getCurrentQuestionMeta();
    const qid = String(meta.question_id || current.question_id || "");
    const bi = (meta.branch_index!=null) ? Number(meta.branch_index) : null;
    const snapshot = meta.student_answer_snapshot != null ? String(meta.student_answer_snapshot) : snapshotAnswers(qid, bi);
    const count = meta.attempts_count != null ? Number(meta.attempts_count || 0) : attemptsCount(qid, bi);

    return {
      question_id: qid,
      lesson_id: String(meta.lesson_id || current.lesson_id || LESSON_ID),
      topic_id: String(meta.topic_id || current.topic_id || qid),
      timestamp: nowIso(),
      page_url: String(location.href || ""),
      feedback_type: String((typ && typ.value) || "أخرى"),
      feedback_text: feedbackText,
      attempts_count: Number.isFinite(count) ? count : 0,
      student_answer_snapshot: snapshot,
      user_agent: String(navigator.userAgent || ""),
      session_id: ensureSessionId()
    };
  }

  function saveFeedbackLocally(payload){
    const list = readArray(STORAGE_KEY);
    const localId = "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const rec = Object.assign({}, payload, {
      local_id: localId,
      sync_status: "pending",
      saved_at: nowIso()
    });
    list.push(rec);
    writeArray(STORAGE_KEY, list);
    return rec;
  }

  function queuePending(localId){
    if(!localId) return;
    const p = readArray(PENDING_KEY);
    if(!p.includes(localId)){
      p.push(localId);
      writeArray(PENDING_KEY, p);
    }
  }

  function markSent(localId){
    if(!localId) return;
    const list = readArray(STORAGE_KEY);
    const i = list.findIndex((x)=>x && x.local_id === localId);
    if(i >= 0){
      list[i].sync_status = "sent";
      list[i].sent_at = nowIso();
      writeArray(STORAGE_KEY, list);
    }
    const p = readArray(PENDING_KEY).filter((id)=>id !== localId);
    writeArray(PENDING_KEY, p);
  }

  function markLocalOnly(localId){
    if(!localId) return;
    const list = readArray(STORAGE_KEY);
    const i = list.findIndex((x)=>x && x.local_id === localId);
    if(i >= 0){
      list[i].sync_status = "local_only";
      writeArray(STORAGE_KEY, list);
    }
  }

  async function submitFeedback(payload){
    const endpoint = String(FEEDBACK_ENDPOINT || "").trim();
    if(!endpoint) return { success:false, skipped:true, reason:"endpoint_not_configured" };
    try{
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if(!res.ok) return { success:false, reason:"http_" + res.status };
      let data = null;
      try{ data = await res.json(); }catch(_e){ data = { success:true }; }
      if(data && data.success === false) return { success:false, reason:"rejected", data:data };
      return { success:true, data:data };
    }catch(_e){
      try{
        await fetch(endpoint, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });
        return { success:true, opaque:true };
      }catch(_e2){
        return { success:false, reason:"network" };
      }
    }
  }

  function exportFeedbackData(){
    const rows = readArray(STORAGE_KEY);
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "feedback_export_" + LESSON_ID + "_" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return rows;
  }

  async function retryPendingFeedback(){
    const endpoint = String(FEEDBACK_ENDPOINT || "").trim();
    if(!endpoint) return { retried:0, sent:0 };
    const pending = readArray(PENDING_KEY);
    if(!pending.length) return { retried:0, sent:0 };
    const list = readArray(STORAGE_KEY);
    let sent = 0;
    for(const id of pending){
      const item = list.find((x)=>x && x.local_id === id);
      if(!item) continue;
      const payload = {
        question_id: item.question_id || "",
        lesson_id: item.lesson_id || LESSON_ID,
        topic_id: item.topic_id || item.question_id || "",
        timestamp: item.timestamp || nowIso(),
        page_url: item.page_url || String(location.href || ""),
        feedback_type: item.feedback_type || "أخرى",
        feedback_text: item.feedback_text || "",
        attempts_count: Number(item.attempts_count || 0),
        student_answer_snapshot: item.student_answer_snapshot || "",
        user_agent: item.user_agent || String(navigator.userAgent || ""),
        session_id: item.session_id || ensureSessionId()
      };
      const res = await submitFeedback(payload);
      if(res && res.success){
        sent++;
        markSent(id);
      }
    }
    return { retried: pending.length, sent: sent };
  }

  function ensureExportButton(){
    const side = document.querySelector(".side");
    if(!side) return;
    if(document.getElementById("globalExportFeedbackBtn")) return;
    const btn = document.createElement("button");
    btn.id = "globalExportFeedbackBtn";
    btn.className = "btn small";
    btn.textContent = "تصدير الملاحظات";
    btn.style.marginTop = "10px";
    btn.onclick = function(){
      const rows = exportFeedbackData();
      notify("تصدير الملاحظات", "تم تصدير " + rows.length + " ملاحظة إلى ملف JSON.");
    };
    side.appendChild(btn);
  }

  function appendCalcButtonsInBranches(){
    if(USE_CASIO_CALC) return;
    const branches = document.querySelectorAll(".branch");
    branches.forEach((branch)=>{
      const hasNumeric = !!branch.querySelector('input[type="number"],input[inputmode="decimal"],input[inputmode="numeric"]');
      if(!hasNumeric) return;
      const btnWrap = branch.querySelector(".branchBtns");
      if(!btnWrap || btnWrap.querySelector(".calc-btn")) return;
      const btn = document.createElement("button");
      btn.className = "btn small calc-btn";
      btn.type = "button";
      btn.textContent = "Calculator";
      btn.onclick = ()=>openCalcModal(branch);
      btnWrap.appendChild(btn);
    });
  }

  function collectSolutionItems(branch){
    const parts = Array.isArray(branch && branch.parts) ? branch.parts : [];
    const answers = (branch && branch.answers) ? branch.answers : {};
    return parts.map((p)=>{
      return {
        key: p.key,
        label: p.label,
        labelHtml: p.labelHtml,
        correct: answers[p.key]
      };
    });
  }

  function renderInlineSolution(question, branch, branchCard, solutionItems){
    if(!branchCard) return;
    branchCard.classList.add("with-inline-solution");

    let layout = branchCard.querySelector(".branchContentLayout");
    let mainStack = branchCard.querySelector(".branchMainStack");
    if(!layout){
      layout = document.createElement("div");
      layout.className = "branchContentLayout";
      mainStack = document.createElement("div");
      mainStack.className = "branchMainStack";
      Array.from(branchCard.children).forEach((node)=>{
        if(node.classList && node.classList.contains("branchHead")) return;
        if(node.classList && node.classList.contains("inlineSolutionPanel")) return;
        mainStack.appendChild(node);
      });
      layout.appendChild(mainStack);
      branchCard.appendChild(layout);
    }else if(!mainStack){
      mainStack = document.createElement("div");
      mainStack.className = "branchMainStack";
      layout.prepend(mainStack);
    }

    let panel = branchCard.querySelector(".inlineSolutionPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.className = "inlineSolutionPanel";
      panel.style.cssText = "padding:12px";
      layout.appendChild(panel);
    }else if(panel.parentElement !== layout){
      layout.appendChild(panel);
    }

    const explain = Array.isArray(branch && branch.explain) ? branch.explain : [];
    const method = Array.isArray(branch && branch.method) ? branch.method : [];
    const title = esc(question && question.title ? question.title : "");
    const lvlRaw = (branch && (branch.level ?? branch.difficulty ?? branch.name)) || "";
    const lvl = esc(String(lvlRaw || "").trim());

    const explainHtml = explain.length
      ? "<ul style=\"margin:0;padding-right:18px;line-height:1.9\">" + explain.map((s)=>"<li>"+esc(s)+"</li>").join("") + "</ul>"
      : "<div style=\"color:#475569;font-weight:700\">لا يوجد شرح إضافي لهذا السؤال.</div>";
    const methodHtml = method.length
      ? "<ul style=\"margin:0;padding-right:18px;line-height:1.9\">" + method.map((s)=>"<li>"+esc(s)+"</li>").join("") + "</ul>"
      : "<div style=\"color:#475569;font-weight:700\">اتبع خطوات الحل المناسبة حسب نوع السؤال.</div>";
    const items = Array.isArray(solutionItems) ? solutionItems : [];
    const answerHtml = items.length
      ? "<ul style=\"margin:0;padding-right:18px;line-height:1.9\">" + items.map((it)=>{
          const lbl = it.labelHtml ? it.labelHtml : esc(it.label || it.key || "");
          const raw = it && it.correct != null ? it.correct : "—";
          const val = (typeof raw === "number" && typeof window.formatNumber === "function") ? window.formatNumber(raw) : esc(raw);
          return "<li><div style=\"font-weight:900\">" + lbl + "</div><div style=\"color:#0b2b4c;font-weight:900\">" + val + "</div></li>";
        }).join("") + "</ul>"
      : "<div style=\"color:#475569;font-weight:700\">لا توجد أجزاء ظاهرة لهذا السؤال.</div>";

    panel.innerHTML = [
      '<div style="font-weight:900;color:#4c1d95;margin-bottom:6px">الحل التفصيلي بجانب السؤال</div>',
      '<div style="font-size:13px;color:#475569;font-weight:800;margin-bottom:10px">' + title + (lvl ? (" — (" + lvl + ")") : "") + "</div>",
      '<div style="font-weight:900;margin:10px 0 6px">شرح السؤال</div>',
      explainHtml,
      '<div style="font-weight:900;margin:10px 0 6px">طريقة الحل</div>',
      methodHtml,
      '<div style="font-weight:900;margin:10px 0 6px">الإجابات الصحيحة</div>',
      answerHtml,
      '<div style="margin-top:10px;color:#7c2d12;font-weight:800">تم قفل هذا السؤال بعد إظهار الحل.</div>'
    ].join("");
    if(typeof window.typesetMath === "function") window.typesetMath(panel);
  }

  function renderInlineSolutionForContainer(question, branch, container, solutionItems){
    if(!container) return;
    container.classList.add("with-inline-solution");
    let layout = container.querySelector(".branchContentLayout");
    let mainStack = container.querySelector(".branchMainStack");
    if(!layout){
      layout = document.createElement("div");
      layout.className = "branchContentLayout";
      mainStack = document.createElement("div");
      mainStack.className = "branchMainStack";
      Array.from(container.children).forEach((node)=>{
        if(node.classList && node.classList.contains("inlineSolutionPanel")) return;
        mainStack.appendChild(node);
      });
      layout.appendChild(mainStack);
      container.appendChild(layout);
    }else if(!mainStack){
      mainStack = document.createElement("div");
      mainStack.className = "branchMainStack";
      layout.prepend(mainStack);
    }
    let panel = container.querySelector(".inlineSolutionPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.className = "inlineSolutionPanel";
      panel.style.cssText = "padding:12px";
      layout.appendChild(panel);
    }else if(panel.parentElement !== layout){
      layout.appendChild(panel);
    }

    const explain = Array.isArray(branch && branch.explain) ? branch.explain : [];
    const method = Array.isArray(branch && branch.method) ? branch.method : [];
    const title = esc(question && question.title ? question.title : "");
    const lvlRaw = (branch && (branch.level ?? branch.difficulty ?? branch.name)) || "";
    const lvl = esc(String(lvlRaw || "").trim());
    const explainHtml = explain.length
      ? "<ul style=\"margin:0;padding-right:18px;line-height:1.9\">" + explain.map((s)=>"<li>"+esc(s)+"</li>").join("") + "</ul>"
      : "<div style=\"color:#475569;font-weight:700\">لا يوجد شرح إضافي لهذا السؤال.</div>";
    const methodHtml = method.length
      ? "<ul style=\"margin:0;padding-right:18px;line-height:1.9\">" + method.map((s)=>"<li>"+esc(s)+"</li>").join("") + "</ul>"
      : "<div style=\"color:#475569;font-weight:700\">اتبع خطوات الحل المناسبة حسب نوع السؤال.</div>";
    const items = Array.isArray(solutionItems) ? solutionItems : [];
    const answerHtml = items.length
      ? "<ul style=\"margin:0;padding-right:18px;line-height:1.9\">" + items.map((it)=>{
          const lbl = it.labelHtml ? it.labelHtml : esc(it.label || it.key || "");
          const raw = it && it.correct != null ? it.correct : "—";
          const val = (typeof raw === "number" && typeof window.formatNumber === "function") ? window.formatNumber(raw) : esc(raw);
          return "<li><div style=\"font-weight:900\">" + lbl + "</div><div style=\"color:#0b2b4c;font-weight:900\">" + val + "</div></li>";
        }).join("") + "</ul>"
      : "<div style=\"color:#475569;font-weight:700\">لا توجد أجزاء ظاهرة لهذا السؤال.</div>";

    panel.innerHTML = [
      '<div style="font-weight:900;color:#4c1d95;margin-bottom:6px">الحل التفصيلي بجانب السؤال</div>',
      '<div style="font-size:13px;color:#475569;font-weight:800;margin-bottom:10px">' + title + (lvl ? (" — (" + lvl + ")") : "") + "</div>",
      '<div style="font-weight:900;margin:10px 0 6px">شرح السؤال</div>',
      explainHtml,
      '<div style="font-weight:900;margin:10px 0 6px">طريقة الحل</div>',
      methodHtml,
      '<div style="font-weight:900;margin:10px 0 6px">الإجابات الصحيحة</div>',
      answerHtml,
      '<div style="margin-top:10px;color:#7c2d12;font-weight:800">تم قفل هذا السؤال بعد إظهار الحل.</div>'
    ].join("");
    if(typeof window.typesetMath === "function") window.typesetMath(panel);
  }

  function injectInlineSolutionCss(){
    if(document.getElementById("inline-solution-style")) return;
    const style = document.createElement("style");
    style.id = "inline-solution-style";
    style.textContent = [
      ".branch.with-inline-solution .branchContentLayout{display:grid;grid-template-columns:minmax(0,1fr) minmax(290px,360px);gap:14px;align-items:start;padding:12px;}",
      ".branch.with-inline-solution .branchMainStack{min-width:0;}",
      ".branch.with-inline-solution .inlineSolutionPanel{margin:0;border:1px solid rgba(124,58,237,.26);background:linear-gradient(165deg,#f8f7ff 0%,#eef2ff 46%,#f5f3ff 100%);border-radius:16px;box-shadow:0 16px 30px rgba(76,29,149,.13);position:sticky;top:10px;overflow:hidden;}",
      ".branch.with-inline-solution .inlineSolutionPanel::before{content:'';display:block;height:5px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#0ea5e9);}",
      "[data-branch-container].with-inline-solution .branchContentLayout{display:grid;grid-template-columns:minmax(0,1fr) minmax(290px,360px);gap:14px;align-items:start;padding:12px;}",
      "[data-branch-container].with-inline-solution .branchMainStack{min-width:0;}",
      "[data-branch-container].with-inline-solution .inlineSolutionPanel{margin:0;border:1px solid rgba(124,58,237,.26);background:linear-gradient(165deg,#f8f7ff 0%,#eef2ff 46%,#f5f3ff 100%);border-radius:16px;box-shadow:0 16px 30px rgba(76,29,149,.13);position:sticky;top:10px;overflow:hidden;}",
      "[data-branch-container].with-inline-solution .inlineSolutionPanel::before{content:'';display:block;height:5px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#0ea5e9);}",
      "@media (max-width:980px){.branch.with-inline-solution .branchContentLayout{grid-template-columns:1fr}.branch.with-inline-solution .inlineSolutionPanel{position:relative;top:auto}}"
      ,"@media (max-width:980px){[data-branch-container].with-inline-solution .branchContentLayout{grid-template-columns:1fr}[data-branch-container].with-inline-solution .inlineSolutionPanel{position:relative;top:auto}}"
    ].join("");
    document.head.appendChild(style);
  }

  function suppressSolutionModals(){
    if(typeof window._promptShowCorrectModal === "function" && !window._promptShowCorrectModal.__inlineSuppressed){
      const original = window._promptShowCorrectModal;
      window._promptShowCorrectModal = function(q,b,wrongItems){
        if(typeof window.closeModal === "function") window.closeModal();
        return null;
      };
      window._promptShowCorrectModal.__inlineSuppressed = true;
      window._promptShowCorrectModal.__original = original;
    }
    if(typeof window._showCorrectModal === "function" && !window._showCorrectModal.__inlineSuppressed){
      const original = window._showCorrectModal;
      window._showCorrectModal = function(q,b,wrongItems){
        if(typeof window.closeModal === "function") window.closeModal();
        return null;
      };
      window._showCorrectModal.__inlineSuppressed = true;
      window._showCorrectModal.__original = original;
    }
    if(typeof window.promptOpenCorrectAnswer === "function" && !window.promptOpenCorrectAnswer.__inlineSuppressed){
      const original = window.promptOpenCorrectAnswer;
      window.promptOpenCorrectAnswer = function(q, branch, bi){
        if(typeof window.closeModal === "function") window.closeModal();
        const key = String((q && q.id) || "") + "::" + String(bi);
        const container = document.querySelector('[data-branch-container="' + key + '"]');
        if(container && q && branch){
          renderInlineSolutionForContainer(q, branch, container, collectSolutionItems(branch));
        }
        return null;
      };
      window.promptOpenCorrectAnswer.__inlineSuppressed = true;
      window.promptOpenCorrectAnswer.__original = original;
    }
    if(typeof window.openCorrectAnswer === "function" && !window.openCorrectAnswer.__inlineSuppressed){
      const original = window.openCorrectAnswer;
      window.openCorrectAnswer = function(q, branch, bi){
        if(typeof window.closeModal === "function") window.closeModal();
        const key = String((q && q.id) || "") + "::" + String(bi);
        const container = document.querySelector('[data-branch-container="' + key + '"]');
        if(container && q && branch){
          renderInlineSolutionForContainer(q, branch, container, collectSolutionItems(branch));
        }
        return null;
      };
      window.openCorrectAnswer.__inlineSuppressed = true;
      window.openCorrectAnswer.__original = original;
    }
  }

  function hydrateInlineSolutions(){
    if(!Array.isArray(window.BANK) || typeof window._getOutcome !== "function") return;
    const cards = document.querySelectorAll(".branch");
    cards.forEach((card)=>{
      const probe = card.querySelector("[data-qid][data-bi]");
      if(!probe) return;
      const qid = String(probe.getAttribute("data-qid") || "");
      const bi = Number(probe.getAttribute("data-bi"));
      if(!qid || !Number.isFinite(bi)) return;
      const out = window._getOutcome(qid, bi);
      if(out !== "wrong") return;
      const q = window.BANK.find((x)=>x && String(x.id) === qid);
      const b = q && Array.isArray(q.branches) ? q.branches[bi] : null;
      if(!q || !b) return;
      renderInlineSolution(q, b, card, collectSolutionItems(b));
    });
  }

  function hydrateInlineSolutionsForBranchContainers(){
    if(!Array.isArray(window.BANK) || typeof window.ensureBranchRec !== "function") return;
    const containers = document.querySelectorAll("[data-branch-container]");
    containers.forEach((container)=>{
      const key = String(container.getAttribute("data-branch-container") || "");
      if(!key || key.indexOf("::") < 0) return;
      const parts = key.split("::");
      const qid = String(parts[0] || "");
      const bi = Number(parts[1]);
      if(!qid || !Number.isFinite(bi)) return;
      let rec = null;
      try{ rec = window.ensureBranchRec(qid, bi); }catch(_e){ rec = null; }
      if(!rec || rec.status !== "locked") return;
      const q = window.BANK.find((x)=>x && String(x.id) === qid);
      const b = q && Array.isArray(q.branches) ? q.branches[bi] : null;
      if(!q || !b) return;
      renderInlineSolutionForContainer(q, b, container, collectSolutionItems(b));
    });
  }

  function wrapSaveForInlineSolution(){
    if(typeof window.saveBranchAnswer !== "function" || window.saveBranchAnswer.__inlineWrapped) return;
    const original = window.saveBranchAnswer;
    window.saveBranchAnswer = function(q,b,bi,branchCard,saveBtn){
      const result = original.apply(this, arguments);
      try{
        const wrong = (typeof window._getOutcome === "function") ? window._getOutcome(q && q.id, bi) === "wrong" : false;
        if(wrong && q && b && branchCard){
          renderInlineSolution(q, b, branchCard, collectSolutionItems(b));
        }
      }catch(_e){}
      return result;
    };
    window.saveBranchAnswer.__inlineWrapped = true;
  }

  function wrapHandleSaveForInlineSolution(){
    if(typeof window.handleSaveBranch !== "function" || window.handleSaveBranch.__inlineWrapped) return;
    const original = window.handleSaveBranch;
    window.handleSaveBranch = function(q, branch, bi){
      const result = original.apply(this, arguments);
      try{
        if(typeof window.ensureBranchRec === "function"){
          const rec = window.ensureBranchRec(q && q.id, bi);
          if(rec && rec.status === "locked"){
            state.lastLockedContext = { q:q, branch:branch, bi:bi };
            const key = String((q && q.id) || "") + "::" + String(bi);
            const container = document.querySelector('[data-branch-container="' + key + '"]');
            if(container && q && branch){
              renderInlineSolutionForContainer(q, branch, container, collectSolutionItems(branch));
            }
          }
        }
      }catch(_e){}
      return result;
    };
    window.handleSaveBranch.__inlineWrapped = true;
  }

  function wrapOpenModalForInlineSolution(){
    if(typeof window.openModal !== "function" || window.openModal.__inlineWrapped) return;
    const original = window.openModal;
    window.openModal = function(title, html){
      try{
        const t = String(title || "");
        const isAnswerModal = t.indexOf("الإجابة الصحيحة") >= 0 || t.indexOf("انتهت المحاولات") >= 0;
        if(isAnswerModal){
          const rendered = tryRenderInlineSolutionFromContext() || tryRenderInlineSolutionFromCurrentQuestion();
          if(rendered) return;
        }
      }catch(_e){}
      return original.apply(this, arguments);
    };
    window.openModal.__inlineWrapped = true;
  }

  function renderInlineSolutionForLegacy(q, branch, bi){
    try{
      if(!q || !branch) return false;
      const key = String(q.id || "") + "::" + String(bi);
      const container = document.querySelector('[data-branch-container="' + key + '"]');
      if(container){
        renderInlineSolutionForContainer(q, branch, container, collectSolutionItems(branch));
        return true;
      }
      const branchCardProbe = document.querySelector('.branch [data-qid="' + String(q.id || "") + '"][data-bi="' + String(bi) + '"]');
      if(branchCardProbe){
        const card = branchCardProbe.closest(".branch");
        if(card){
          renderInlineSolution(q, branch, card, collectSolutionItems(branch));
          return true;
        }
      }
      const firstBranchCard = document.querySelector(".branch");
      if(firstBranchCard){
        renderInlineSolution(q, branch, firstBranchCard, collectSolutionItems(branch));
        return true;
      }
    }catch(_e){}
    return false;
  }

  function tryRenderInlineSolutionFromContext(){
    const ctx = state.lastLockedContext;
    if(!ctx || !ctx.q || !ctx.branch) return false;
    const key = String(ctx.q.id || "") + "::" + String(ctx.bi);
    const container = document.querySelector('[data-branch-container="' + key + '"]');
    if(container){
      renderInlineSolutionForContainer(ctx.q, ctx.branch, container, collectSolutionItems(ctx.branch));
      return true;
    }
    const branchCard = document.querySelector(".branch");
    if(branchCard && typeof renderInlineSolution === "function"){
      renderInlineSolution(ctx.q, ctx.branch, branchCard, collectSolutionItems(ctx.branch));
      return true;
    }
    return false;
  }

  function tryRenderInlineSolutionFromCurrentQuestion(){
    if(!Array.isArray(window.BANK)) return false;
    const idx = (window.state && Number.isFinite(window.state.currentIndex)) ? window.state.currentIndex : 0;
    const q = window.BANK[idx];
    if(!q || !Array.isArray(q.branches)) return false;

    for(let bi=0; bi<q.branches.length; bi++){
      const b = q.branches[bi];
      const key = String(q.id || "") + "::" + String(bi);
      const container = document.querySelector('[data-branch-container="' + key + '"]');
      if(container && typeof window.ensureBranchRec === "function"){
        try{
          const rec = window.ensureBranchRec(q.id, bi);
          if(rec && rec.status === "locked"){
            renderInlineSolutionForContainer(q, b, container, collectSolutionItems(b));
            return true;
          }
        }catch(_e){}
      }
      const branchCardProbe = document.querySelector('.branch [data-qid="' + String(q.id) + '"][data-bi="' + String(bi) + '"]');
      if(branchCardProbe && typeof window._getOutcome === "function"){
        try{
          if(window._getOutcome(q.id, bi) === "wrong"){
            const card = branchCardProbe.closest(".branch");
            if(card && typeof renderInlineSolution === "function"){
              renderInlineSolution(q, b, card, collectSolutionItems(b));
              return true;
            }
          }
        }catch(_e){}
      }
    }
    return false;
  }

  function wrapRenderForInlineHydration(){
    if(typeof window.renderAll !== "function" || window.renderAll.__inlineWrapped) return;
    const original = window.renderAll;
    window.renderAll = function(){
      const result = original.apply(this, arguments);
      try{ hydrateInlineSolutions(); }catch(_e){}
      try{ hydrateInlineSolutionsForBranchContainers(); }catch(_e){}
      return result;
    };
    window.renderAll.__inlineWrapped = true;
  }

  function wrapResetAllForCleanRestart(){
    if(typeof window.resetAll !== "function" || window.resetAll.__cleanWrapped) return;
    const original = window.resetAll;
    function clearLessonStorage(){
      const lessonLc = String(LESSON_ID || "").toLowerCase();
      if(!lessonLc) return;
      const shouldRemove = function(key){
        const k = String(key || "").toLowerCase();
        if(!k) return false;
        if(k.indexOf(lessonLc) < 0) return false;
        if(k.startsWith("stat102_")) return true;
        if(k.startsWith("feedback_")) return true;
        return false;
      };
      try{
        const keys = [];
        for(let i=0;i<localStorage.length;i++){
          const k = localStorage.key(i);
          if(shouldRemove(k)) keys.push(k);
        }
        keys.forEach((k)=>{ try{ localStorage.removeItem(k); }catch(_e){} });
      }catch(_e){}
      try{
        const skeys = [];
        for(let i=0;i<sessionStorage.length;i++){
          const k = sessionStorage.key(i);
          if(shouldRemove(k)) skeys.push(k);
        }
        skeys.forEach((k)=>{ try{ sessionStorage.removeItem(k); }catch(_e){} });
      }catch(_e){}
    }
    window.resetAll = function(){
      try{
        if(typeof window.closeModal === "function") window.closeModal();
        document.querySelectorAll(".modal.show,.feedback-modal.show,.calc-modal.show").forEach((m)=>{
          m.classList.remove("show");
        });
        clearLessonStorage();
      }catch(_e){}
      return original.apply(this, arguments);
    };
    window.resetAll.__cleanWrapped = true;
  }

  function appendButtonsInBranches(){
    const wraps = document.querySelectorAll(".branchBtns");
    wraps.forEach((wrap)=>{
      if(!wrap || wrap.querySelector(".feedback-btn")) return;
      const btn = document.createElement("button");
      btn.className = "btn small feedback-btn";
      btn.type = "button";
      btn.textContent = "إرسال ملاحظة";
      btn.onclick = function(){
        const card = wrap.closest(".branch");
        const probe = card ? card.querySelector("[data-qid][data-bi]") : null;
        const qid = probe ? String(probe.getAttribute("data-qid") || "") : getCurrentQuestionMeta().question_id;
        const biRaw = probe ? probe.getAttribute("data-bi") : null;
        const bi = biRaw!=null ? Number(biRaw) : null;
        openFeedbackModal({
          question_id: qid,
          lesson_id: LESSON_ID,
          topic_id: qid,
          branch_index: bi,
          attempts_count: attemptsCount(qid, bi),
          student_answer_snapshot: snapshotAnswers(qid, bi)
        });
      };
      wrap.appendChild(btn);
    });
  }

  function hookRendering(){
    appendButtonsInBranches();
    appendCalcButtonsInBranches();
    ensureExportButton();
    document.addEventListener("focusin",(e)=>{
      const t = e.target;
      if(isNumericInput(t)) state.calcTargetInput = t;
    });
    if(typeof MutationObserver === "undefined") return;
    const root = document.body || document.documentElement;
    const observer = new MutationObserver(function(){
      appendButtonsInBranches();
      appendCalcButtonsInBranches();
      ensureExportButton();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function normalizeKsuLogoSource(){
    const logos = document.querySelectorAll('.logoWrap img, .cv-ksu img, .nav-ksu img, img[alt*="King Saud University Logo"]');
    if(!logos.length) return;
    const candidates = [
      "../assets/img/ksu_logo.png",
      "../../assets/img/ksu_logo.png",
      "assets/img/ksu_logo.png"
    ];
    logos.forEach((img)=>{
      if(!img || img.__ksuNormalized) return;
      img.__ksuNormalized = true;
      let i = 0;
      const useAt = function(idx){
        if(idx >= candidates.length) return;
        const next = candidates[idx];
        img.onerror = function(){ useAt(idx + 1); };
        img.src = next;
      };
      useAt(i);
    });
  }

  function initCasioCalculator(){
    if(window.__statCasioCalcReady) return;
    window.__statCasioCalcReady = true;

    const style = document.createElement("style");
    style.id = "stat-casio-calc-style";
    style.textContent = `
.statCalcFab{position:fixed;bottom:24px;left:24px;z-index:700;width:62px;height:62px;border-radius:50%;background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border:1px solid rgba(56,189,248,.35);box-shadow:0 12px 28px rgba(2,6,23,.45),0 0 0 4px rgba(56,189,248,.08),inset 0 1px 0 rgba(255,255,255,.06);display:none;align-items:center;justify-content:center;cursor:pointer;color:#e2e8f0;transition:all .25s;opacity:0;transform:translateY(12px) scale(.85)}
.statCalcFab.visible{display:flex;opacity:1;transform:translateY(0) scale(1)}
.statCalcFab svg{width:28px;height:28px;color:#22d3ee}
.statCalcPanel{position:fixed;bottom:24px;left:24px;z-index:701;width:360px;background:linear-gradient(180deg,#262a35 0%,#1a1d26 55%,#13161e 100%);border-radius:24px;padding:14px;box-shadow:0 40px 80px rgba(2,6,23,.55);direction:ltr;display:none}
.statCalcPanel.visible{display:block}
.calcHead{display:flex;align-items:center;justify-content:space-between;padding:4px 8px 10px}
.calcBrand .name{color:#e2e8f0;font-weight:900;font-size:13px}
.calcBrand .model{color:#64748b;font-weight:800;font-size:9.5px}
.calcCtrls{display:flex;gap:5px}
.calcCtrls button{width:22px;height:22px;border-radius:7px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#94a3b8;cursor:pointer}
.calcScreen{background:linear-gradient(180deg,#9fb38c 0%,#b4c4a4 50%,#a9ba99 100%);border-radius:14px;padding:10px 14px;border:1px solid #0a0c12;min-height:96px;display:flex;flex-direction:column;justify-content:space-between;font-family:"Share Tech Mono","Courier New",monospace}
.calcIndicators{display:flex;gap:10px;font-size:9px;font-weight:800;color:#2d3a22}
.calcIndicators span{opacity:.35}
.calcIndicators span.on{opacity:.9}
.calcHistory{font-size:11px;color:#2d3a22;opacity:.55;text-align:right;min-height:14px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.calcExpr{font-size:19px;color:#1a1d26;text-align:right;font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-height:24px}
.calcExpr .cursor{display:inline-block;width:2px;height:18px;background:#1a1d26;margin-left:1px;vertical-align:middle;animation:calcBlink 1s step-end infinite}
@keyframes calcBlink{50%{opacity:0}}
.calcResult{font-size:24px;color:#1a1d26;text-align:right;font-weight:900;min-height:28px}
.calcResult.err{color:#991b1b;font-size:18px}
.calcBody{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:10px}
.ck{padding:0;height:38px;border-radius:11px;border:1px solid rgba(255,255,255,.06);font-weight:800;font-size:13.5px;cursor:pointer;color:#e2e8f0;display:flex;align-items:center;justify-content:center}
.ck.num{background:linear-gradient(180deg,#3d4250 0%,#2e333f 100%);font-size:16px}
.ck.fn{background:linear-gradient(180deg,#2a2f3a 0%,#1f2430 100%);font-size:12.5px}
.ck.op{background:linear-gradient(180deg,#0891b2 0%,#075985 100%);font-size:16px}
.ck.mem{background:linear-gradient(180deg,#1e293b 0%,#0f172a 100%);color:#38bdf8;font-size:11.5px}
.ck.eq{background:linear-gradient(180deg,#f59e0b 0%,#b45309 100%);color:#fff;font-size:19px;font-weight:900}
.ck.ac{background:linear-gradient(180deg,#dc2626 0%,#991b1b 100%)}
.ck.del{background:linear-gradient(180deg,#475569 0%,#334155 100%)}
`;
    document.head.appendChild(style);

    const fab = document.createElement("button");
    fab.className = "statCalcFab";
    fab.id = "statCalcFab";
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2.5"/><rect x="6" y="5" width="12" height="4" rx="1" fill="currentColor" opacity=".3"/><circle cx="8" cy="12" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><circle cx="16" cy="12" r=".9" fill="currentColor"/></svg>';
    document.body.appendChild(fab);

    const panel = document.createElement("div");
    panel.className = "statCalcPanel";
    panel.id = "statCalcPanel";
    panel.innerHTML = `
<div class="calcHead">
  <div class="calcBrand"><div class="name">STAT fx-Pro</div><div class="model">102 · SOLVER</div></div>
  <div class="calcCtrls"><button id="calcModeBtn">DEG</button><button id="calcCloseCasio">×</button></div>
</div>
<div class="calcScreen">
  <div class="calcIndicators"><span id="indM">M</span><span id="indAns">Ans</span><span id="indShift">2nd</span></div>
  <div class="calcHistory" id="calcHistory">&nbsp;</div>
  <div class="calcExpr" id="calcExpr">0<span class="cursor"></span></div>
  <div class="calcResult" id="calcResult">&nbsp;</div>
</div>
<div class="calcBody" id="calcBody"></div>`;
    document.body.appendChild(panel);

    const S = { expr:"", ans:0, mem:0, shift:false, rad:false, open:false };
    const hist = panel.querySelector("#calcHistory");
    const exprEl = panel.querySelector("#calcExpr");
    const resEl = panel.querySelector("#calcResult");
    const indM = panel.querySelector("#indM");
    const indAns = panel.querySelector("#indAns");
    const indShift = panel.querySelector("#indShift");
    const modeBtn = panel.querySelector("#calcModeBtn");
    const closeBtn = panel.querySelector("#calcCloseCasio");
    const body = panel.querySelector("#calcBody");

    const keys = [
      ["2nd","SHIFT","fn"],["MODE","MODE","fn"],["⌫","DEL","del"],["AC","AC","ac"],["(","(","fn"],[")",")","fn"],
      ["sin","sin","fn"],["cos","cos","fn"],["tan","tan","fn"],["π","π","fn"],["e","e","fn"],["√","√","fn"],
      ["log","log","fn"],["ln","ln","fn"],["x²","x²","fn"],["xʸ","^","fn"],["1/x","1/x","fn"],["n!","!","fn"],
      ["7","7","num"],["8","8","num"],["9","9","num"],["÷","÷","op"],["Ans","Ans","mem"],["MR","MR","mem"],
      ["4","4","num"],["5","5","num"],["6","6","num"],["×","×","op"],["M+","M+","mem"],["MC","MC","mem"],
      ["1","1","num"],["2","2","num"],["3","3","num"],["−","−","op"],["M−","M-","mem"],["=","=","eq"],
      ["0","0","num"],["00","00","num"],[".",".","num"],["+","+","op"],["%","%","fn"],["=","=","eq"]
    ];
    keys.forEach(([label,key,cls])=>{
      const b = document.createElement("button");
      b.className = "ck " + cls;
      b.textContent = label;
      b.onclick = ()=>press(key);
      body.appendChild(b);
    });

    function render(){
      exprEl.innerHTML = (S.expr ? escapeHtml(S.expr) : "0") + '<span class="cursor"></span>';
      indM.classList.toggle("on", S.mem !== 0);
      indAns.classList.toggle("on", S.ans !== 0);
      indShift.classList.toggle("on", S.shift);
      modeBtn.textContent = S.rad ? "RAD" : "DEG";
    }
    function safeEval(raw){
      let s = String(raw || "").replace(/\s+/g,"");
      if(!s) return null;
      s = s.replace(/Ans/g,"("+S.ans+")").replace(/π/g,"("+Math.PI+")").replace(/(^|[^a-zA-Z_])e(?![a-zA-Z_])/g,"$1("+Math.E+")");
      s = s.replace(/sin/g,"__sin").replace(/cos/g,"__cos").replace(/tan/g,"__tan").replace(/log/g,"__log10").replace(/ln/g,"__ln").replace(/√/g,"__sqrt");
      s = s.replace(/²/g,"**2").replace(/\^/g,"**").replace(/×/g,"*").replace(/÷/g,"/").replace(/−/g,"-");
      s = s.replace(/(\d+(?:\.\d+)?)\s*%/g,"($1/100)");
      if(/[^0-9+\-*/().\s_a-zA-Z]/.test(s)) return null;
      const toRad = x => S.rad ? x : x*Math.PI/180;
      const fn = new Function("__sin","__cos","__tan","__log10","__ln","__sqrt","return ("+s+")");
      const v = fn(x=>Math.sin(toRad(x)),x=>Math.cos(toRad(x)),x=>Math.tan(toRad(x)),Math.log10,Math.log,Math.sqrt);
      if(typeof v!=="number" || !isFinite(v)) return null;
      return Math.round(v*1e12)/1e12;
    }
    function press(k){
      if(k==="SHIFT"){ S.shift = !S.shift; render(); return; }
      if(k==="MODE"){ S.rad = !S.rad; render(); return; }
      if(k==="AC"){ S.expr=""; hist.innerHTML="&nbsp;"; resEl.textContent=""; resEl.classList.remove("err"); render(); return; }
      if(k==="DEL"){ S.expr = S.expr.slice(0,-1); render(); return; }
      if(k==="="){
        const v = safeEval(S.expr);
        if(v==null){ resEl.classList.add("err"); resEl.textContent = "Error"; return; }
        resEl.classList.remove("err");
        hist.textContent = (S.expr || "0") + " =";
        resEl.textContent = "= " + (Number.isInteger(v) ? String(v) : parseFloat(v.toPrecision(12)).toString());
        S.ans = v; S.expr = String(v); S.shift=false; render(); return;
      }
      if(k==="MR"){ S.expr += String(S.mem); render(); return; }
      if(k==="MC"){ S.mem = 0; render(); return; }
      if(k==="M+" || k==="M-"){ const v = safeEval(S.expr); if(v!=null){ S.mem += (k==="M+"?v:-v); } render(); return; }
      if(k==="1/x"){ S.expr = "1/(" + (S.expr || "1") + ")"; render(); return; }
      if(k==="x²"){ S.expr += "²"; render(); return; }
      if(k==="sin" || k==="cos" || k==="tan"){ if(S.shift){ k = k + "⁻¹"; S.shift=false; } S.expr += k + "("; render(); return; }
      if(k==="log" || k==="ln" || k==="√"){ S.expr += k + "("; render(); return; }
      S.expr += k; S.shift=false; render();
    }
    function open(){ panel.classList.add("visible"); S.open=true; render(); }
    function close(){ panel.classList.remove("visible"); S.open=false; }
    fab.onclick = ()=>{ S.open ? close() : open(); };
    closeBtn.onclick = close;

    function needsCalc(){
      const card = document.querySelector(".branch, [data-branch-container], .card .content, #mainContent");
      if(!card) return false;
      if(card.querySelector('input[type="number"],input[inputmode="decimal"],input[inputmode="numeric"]')) return true;
      const txt = (card.textContent || "");
      return /[=√Σ]/.test(txt) || /log|ln|sin|cos|tan|%|\d+/.test(txt);
    }
    function updateFab(){
      if(needsCalc()) fab.classList.add("visible");
      else{ fab.classList.remove("visible"); close(); }
    }
    const obs = new MutationObserver(()=>updateFab());
    obs.observe(document.body,{childList:true,subtree:true});
    modeBtn.onclick = ()=>press("MODE");
    render(); setTimeout(updateFab,300); setTimeout(updateFab,1200);
  }

  function boot(){
    injectCss();
    injectInlineSolutionCss();
    injectCalculatorCss();
    ensureSessionId();
    ensureModal();
    if(USE_CASIO_CALC) initCasioCalculator();
    else ensureCalcModal();
    hookRendering();
    normalizeKsuLogoSource();
    suppressSolutionModals();
    wrapSaveForInlineSolution();
    wrapHandleSaveForInlineSolution();
    wrapRenderForInlineHydration();
    wrapOpenModalForInlineSolution();
    wrapResetAllForCleanRestart();
    setTimeout(function(){ hydrateInlineSolutions(); }, 60);
    setTimeout(function(){ hydrateInlineSolutionsForBranchContainers(); }, 90);
    setTimeout(function(){ retryPendingFeedback(); }, 900);
    setTimeout(function(){ normalizeKsuLogoSource(); }, 500);
  }

  window.FeedbackSystem = {
    openFeedbackModal: openFeedbackModal,
    collectFeedbackPayload: collectFeedbackPayload,
    saveFeedbackLocally: saveFeedbackLocally,
    submitFeedback: submitFeedback,
    exportFeedbackData: exportFeedbackData,
    retryPendingFeedback: retryPendingFeedback,
    renderInlineSolutionForLegacy: renderInlineSolutionForLegacy
  };
  if(typeof window.openFeedbackModal !== "function") window.openFeedbackModal = openFeedbackModal;
  if(typeof window.collectFeedbackPayload !== "function") window.collectFeedbackPayload = collectFeedbackPayload;
  if(typeof window.saveFeedbackLocally !== "function") window.saveFeedbackLocally = saveFeedbackLocally;
  if(typeof window.submitFeedback !== "function") window.submitFeedback = submitFeedback;
  if(typeof window.exportFeedbackData !== "function") window.exportFeedbackData = exportFeedbackData;
  if(typeof window.retryPendingFeedback !== "function") window.retryPendingFeedback = retryPendingFeedback;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  }else{
    boot();
  }

  function escapeHtml(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(m){
      return ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m];
    });
  }
  function esc(v){ return escapeHtml(v); }
})();
