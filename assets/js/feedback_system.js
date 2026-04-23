(function(){
  "use strict";
  if(typeof window === "undefined" || typeof document === "undefined") return;
  if(window.__feedbackSystemReady) return;
  window.__feedbackSystemReady = true;

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
    lastLockedContext: null
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
        if(isAnswerModal && state.lastLockedContext && state.lastLockedContext.q && state.lastLockedContext.branch){
          const ctx = state.lastLockedContext;
          const key = String(ctx.q.id || "") + "::" + String(ctx.bi);
          const container = document.querySelector('[data-branch-container="' + key + '"]');
          if(container){
            renderInlineSolutionForContainer(ctx.q, ctx.branch, container, collectSolutionItems(ctx.branch));
            return;
          }
          const branchCard = document.querySelector(".branch");
          if(branchCard && typeof renderInlineSolution === "function"){
            renderInlineSolution(ctx.q, ctx.branch, branchCard, collectSolutionItems(ctx.branch));
            return;
          }
        }
      }catch(_e){}
      return original.apply(this, arguments);
    };
    window.openModal.__inlineWrapped = true;
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
    ensureExportButton();
    if(typeof MutationObserver === "undefined") return;
    const root = document.body || document.documentElement;
    const observer = new MutationObserver(function(){
      appendButtonsInBranches();
      ensureExportButton();
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function boot(){
    injectCss();
    injectInlineSolutionCss();
    ensureSessionId();
    ensureModal();
    hookRendering();
    suppressSolutionModals();
    wrapSaveForInlineSolution();
    wrapHandleSaveForInlineSolution();
    wrapRenderForInlineHydration();
    wrapOpenModalForInlineSolution();
    setTimeout(function(){ hydrateInlineSolutions(); }, 60);
    setTimeout(function(){ hydrateInlineSolutionsForBranchContainers(); }, 90);
    setTimeout(function(){ retryPendingFeedback(); }, 900);
  }

  window.FeedbackSystem = {
    openFeedbackModal: openFeedbackModal,
    collectFeedbackPayload: collectFeedbackPayload,
    saveFeedbackLocally: saveFeedbackLocally,
    submitFeedback: submitFeedback,
    exportFeedbackData: exportFeedbackData,
    retryPendingFeedback: retryPendingFeedback
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
