(function(){
  "use strict";
  if(typeof window === "undefined" || typeof document === "undefined") return;
  if(window.__feedbackSystemReady) return;
  window.__feedbackSystemReady = true;

  const FEEDBACK_ENDPOINT = "https://script.google.com/macros/s/AKfycbypvAjqIdXTuc5Zzlkz6IvHGoWBvizIeD83apMCZvHUCbtWxZCRIwIxJ6QKGNrT9CsV/exec";
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
    modalMeta: null
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

  async function submitFeedback(payload){
    const endpoint = String(FEEDBACK_ENDPOINT || "").trim();
    if(!endpoint) return { success:false, skipped:true };
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
      return { success:false, reason:"network" };
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
    ensureSessionId();
    ensureModal();
    hookRendering();
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
})();
