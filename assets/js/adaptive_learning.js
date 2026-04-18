(function(){
  "use strict";
  var _sk="student_training_log_v1";
  var _mk="adaptive_model_state_v1";
  var _ik="adaptive_current_student_id_v1";
  var _bkt0={p_init:0.25,p_learn:0.2,p_guess:0.2,p_slip:0.1};
  var _lr0={intercept:-0.4,feature_order:["difficulty_num","attempts_count","used_help","time_spent_sec","showed_solution","bkt_mastery"],coefficients:[0.75,-0.35,-0.45,-0.015,-0.5,2.0],threshold:0.6};
  var _dm={"\u0633\u0647\u0644":1,"easy":1,"\u0645\u062a\u0648\u0633\u0637":2,"medium":2,"\u0635\u0639\u0628":3,"hard":3};
  var _s={bktConfig:Object.assign({},_bkt0),lrConfig:Object.assign({},_lr0),skills:{},studentId:""};
  var _promptPending=false;
  var _declined=false;

  function _lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function _lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }

  function _load(){
    var r=_lsGet(_mk);
    if(r){ try{ var p=JSON.parse(r); if(p && typeof p==="object") _s.skills=p.skills||{}; }catch(e){} }
    _s.studentId=String(_lsGet(_ik)||"").trim();
  }
  function _save(){ _lsSet(_mk, JSON.stringify({skills:_s.skills})); }
  function _sig(x){ return 1/(1+Math.exp(-x)); }

  function _vid(v){ return /^[0-9]{8,10}$/.test(String(v||"").trim()); }

  function setStudentId(v){
    var id=String(v||"").trim();
    if(!_vid(id)) return false;
    _s.studentId=id;
    _lsSet(_ik,id);
    _declined=false;
    return true;
  }
  function getStudentId(){ return _s.studentId; }

  function _buildModal(){
    if(document.getElementById("al-id-modal-root")) return;
    var root=document.createElement("div");
    root.id="al-id-modal-root";
    root.innerHTML = ''
      + '<div id="al-id-overlay" role="dialog" aria-modal="true" style="position:fixed;inset:0;background:rgba(7,16,31,.78);backdrop-filter:blur(4px);z-index:99998;display:flex;align-items:center;justify-content:center;font-family:Cairo,Tahoma,Arial,sans-serif;direction:rtl;padding:16px">'
      + '  <div style="background:#fff;color:#0f172a;max-width:420px;width:100%;border-radius:18px;padding:22px 22px 18px;box-shadow:0 30px 80px rgba(0,0,0,.5);border:1px solid rgba(14,165,233,.18)">'
      + '    <div style="font-size:18px;font-weight:900;margin-bottom:6px;color:#0369a1">\u0623\u062f\u062e\u0644 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062c\u0627\u0645\u0639\u064a</div>'
      + '    <div style="font-size:13px;color:#64748b;margin-bottom:14px;line-height:1.7">\u0644\u0631\u0628\u0637 \u0625\u062c\u0627\u0628\u0627\u062a\u0643 \u0628\u0633\u062c\u0644\u0643 \u0627\u0644\u062a\u062f\u0631\u064a\u0628\u064a. \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0645\u0646 8 \u0625\u0644\u0649 10 \u0623\u0631\u0642\u0627\u0645 \u0641\u0642\u0637.</div>'
      + '    <input id="al-id-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="\u0645\u062b\u0627\u0644: 443211234" style="width:100%;padding:12px 14px;font-size:17px;font-weight:700;border:1.5px solid #cbd5e1;border-radius:10px;outline:none;text-align:center;letter-spacing:2px;font-family:inherit;box-sizing:border-box" />'
      + '    <div id="al-id-err" style="color:#dc2626;font-size:12px;font-weight:700;margin-top:8px;min-height:16px"></div>'
      + '    <div style="display:flex;gap:8px;margin-top:14px">'
      + '      <button id="al-id-cancel" type="button" style="flex:1;padding:10px 12px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit">\u0644\u0627\u062d\u0642\u064b\u0627</button>'
      + '      <button id="al-id-ok" type="button" style="flex:2;padding:10px 12px;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#fff;border:0;border-radius:10px;font-weight:800;cursor:pointer;font-family:inherit">\u062a\u0623\u0643\u064a\u062f</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(root);
  }
  function _closeModal(){
    var r=document.getElementById("al-id-modal-root");
    if(r && r.parentNode) r.parentNode.removeChild(r);
  }
  function _promptModal(){
    return new Promise(function(resolve){
      try{
        _buildModal();
        var inp=document.getElementById("al-id-input");
        var err=document.getElementById("al-id-err");
        var ok =document.getElementById("al-id-ok");
        var ca =document.getElementById("al-id-cancel");
        if(!inp || !ok || !ca){ _closeModal(); resolve(null); return; }
        inp.value=""; err.textContent="";
        setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 60);
        function done(v){ _closeModal(); resolve(v); }
        function submit(){
          var v=String(inp.value||"").trim();
          if(_vid(v)){ done(v); }
          else { err.textContent="\u0635\u064a\u063a\u0629 \u0627\u0644\u0631\u0642\u0645 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629. \u0627\u0644\u0645\u0637\u0644\u0648\u0628: 8 \u0625\u0644\u0649 10 \u0623\u0631\u0642\u0627\u0645 \u0641\u0642\u0637."; try{ inp.focus(); }catch(e){} }
        }
        ok.onclick = submit;
        ca.onclick = function(){ done(null); };
        inp.onkeydown = function(e){
          if(e.key==="Enter"){ e.preventDefault(); submit(); }
          else if(e.key==="Escape"){ e.preventDefault(); done(null); }
        };
      }catch(e){ resolve(null); }
    });
  }

  function ensureStudentIdentity(){
    if(_vid(_s.studentId)) return Promise.resolve(_s.studentId);
    if(_promptPending) return Promise.resolve(null);
    _promptPending = true;
    return _promptModal().then(function(v){
      _promptPending = false;
      if(v && _vid(v)){ setStudentId(v); return v; }
      _declined = true;
      return null;
    });
  }

  function _ndiff(v){
    if(typeof v==="number") return v;
    return _dm[String(v||"").trim().toLowerCase()]||2;
  }
  function _gm(sid){
    sid=String(sid||"unknown_skill");
    if(_s.skills[sid]==null){ _s.skills[sid]=_s.bktConfig.p_init; _save(); }
    return _s.skills[sid];
  }

  function collectStudentEvent(payload){
    payload = payload || {};
    var sid = null;
    if(_vid(payload.student_id))      sid = String(payload.student_id).trim();
    else if(_vid(_s.studentId))       sid = _s.studentId;
    if(!sid){
      if(!_declined && !_promptPending) ensureStudentIdentity();
      return null;
    }
    var ev={
      student_id:sid,
      question_id:String(payload.question_id||""),
      skill_id:String(payload.skill_id||"unknown_skill"),
      topic_id:String(payload.topic_id||payload.skill_id||"unknown_topic"),
      difficulty:payload.difficulty||"medium",
      is_correct:payload.is_correct?1:0,
      attempts_count:Number(payload.attempts_count||1),
      used_help:payload.used_help?1:0,
      time_spent_sec:Number(payload.time_spent_sec||0),
      showed_solution:payload.showed_solution?1:0,
      timestamp:payload.timestamp||new Date().toISOString()
    };
    var raw=_lsGet(_sk), ex=[];
    if(raw){ try{ ex=JSON.parse(raw); if(!Array.isArray(ex)) ex=[]; }catch(e){ ex=[]; } }
    ex.push(ev);
    _lsSet(_sk, JSON.stringify(ex));
    return ev;
  }

  function updateBKT(skillId,isCorrect){
    var sid=String(skillId||"unknown_skill");
    var pL=_gm(sid), pG=_s.bktConfig.p_guess, pS=_s.bktConfig.p_slip, pLn=_s.bktConfig.p_learn;
    var num,den,post;
    if(isCorrect){ num=pL*(1-pS); den=num+(1-pL)*pG; }
    else         { num=pL*pS;     den=num+(1-pL)*(1-pG); }
    post = den===0 ? pL : (num/den);
    var upd = post + (1-post)*pLn;
    _s.skills[sid] = Math.max(0.001, Math.min(0.999, upd));
    _save();
    return {skill_id:sid, mastery:_s.skills[sid]};
  }

  function _normTime(sec){
    var s = Math.max(0, Number(sec||0));
    return Math.log(1 + s);
  }

  function predictMastery(features){
    features = features || {};
    var f={
      difficulty_num  : _ndiff(features.difficulty),
      attempts_count  : Math.min(10, Number(features.attempts_count||1)),
      used_help       : features.used_help?1:0,
      time_spent_sec  : _normTime(features.time_spent_sec),
      showed_solution : features.showed_solution?1:0,
      bkt_mastery     : Number(features.bkt_mastery||0)
    };
    var ord  = _s.lrConfig.feature_order || _lr0.feature_order;
    var coef = _s.lrConfig.coefficients  || _lr0.coefficients;
    var z = Number(_s.lrConfig.intercept || 0);
    for(var i=0; i<ord.length; i++) z += Number(coef[i]||0) * Number(f[ord[i]]||0);
    var prob = _sig(z);
    var thr  = Number(_s.lrConfig.threshold || 0.6);
    var ok   = prob >= thr ? 1 : 0;
    return { probability_mastered: prob, mastered: ok, recommended_support: ok ? "continue_practice" : "needs_support" };
  }

  function _pad(n){ return (n<10?"0":"")+n; }
  function _stamp(){
    var d=new Date();
    return d.getFullYear()+_pad(d.getMonth()+1)+_pad(d.getDate())+"_"+_pad(d.getHours())+_pad(d.getMinutes());
  }

  function exportTrainingData(filename){
    var raw = _lsGet(_sk) || "[]";
    var sid = _vid(_s.studentId) ? _s.studentId : "anon";
    var name = String(filename || ("training_batch_" + sid + "_" + _stamp() + ".json"));
    try{
      var blob = new Blob([raw], {type:"application/json;charset=utf-8"});
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }catch(e){}
    try{ return JSON.parse(raw); }catch(e){ return []; }
  }

  function exportStudentTrainingData(studentId){
    var sid = _vid(studentId) ? String(studentId).trim() : (_vid(_s.studentId) ? _s.studentId : "");
    if(!sid) return [];
    var raw = _lsGet(_sk) || "[]";
    var all = [];
    try{ all = JSON.parse(raw); if(!Array.isArray(all)) all=[]; }catch(e){ all=[]; }
    var fil = all.filter(function(e){ return String(e && e.student_id || "") === sid; });
    var name = "student_log_" + sid + "_" + _stamp() + ".json";
    try{
      var blob = new Blob([JSON.stringify(fil,null,2)], {type:"application/json;charset=utf-8"});
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }catch(e){}
    return fil;
  }

  async function _fetchJ(url){
    var res = await fetch(url);
    if(!res.ok){ var e = new Error("HTTP "+res.status); e.status = res.status; throw e; }
    return res.json();
  }
  async function loadModelWeights(opts){
    opts = opts || {};
    try{
      if(opts.bktPath){
        var bkt = await _fetchJ(opts.bktPath);
        if(bkt && typeof bkt === "object") _s.bktConfig = Object.assign({}, _s.bktConfig, bkt);
      }
    }catch(e){}
    try{
      if(opts.lrPath){
        var lr = await _fetchJ(opts.lrPath);
        if(lr && typeof lr === "object") _s.lrConfig = Object.assign({}, _s.lrConfig, lr);
      }
    }catch(e){}
    return { bkt: _s.bktConfig, lr: _s.lrConfig };
  }

  _load();

  window.AdaptiveLearning = {
    setStudentId           : setStudentId,
    getStudentId           : getStudentId,
    ensureStudentIdentity  : ensureStudentIdentity,
    collectStudentEvent    : collectStudentEvent,
    updateBKT              : updateBKT,
    predictMastery         : predictMastery,
    exportTrainingData     : exportTrainingData,
    exportStudentTrainingData : exportStudentTrainingData,
    loadModelWeights       : loadModelWeights
  };
})();
