(function(){
  var _sk="student_training_log_v1";
  var _mk="adaptive_model_state_v1";
  var _ik="adaptive_current_student_id_v1";
  var _bkt0={p_init:0.25,p_learn:0.2,p_guess:0.2,p_slip:0.1};
  var _lr0={intercept:-0.4,feature_order:["difficulty_num","attempts_count","used_help","time_spent_sec","showed_solution","bkt_mastery"],coefficients:[0.75,-0.35,-0.45,-0.015,-0.5,2.0],threshold:0.6};
  var _dm={"سهل":1,"easy":1,"متوسط":2,"medium":2,"صعب":3,"hard":3};
  var _s={bktConfig:Object.assign({},_bkt0),lrConfig:Object.assign({},_lr0),skills:{},studentId:""};

  function _load(){
    try{var r=localStorage.getItem(_mk);if(r){var p=JSON.parse(r);if(p&&typeof p==="object")_s.skills=p.skills||{};}}catch(e){}
    _s.studentId=String(localStorage.getItem(_ik)||"").trim();
  }
  function _save(){ localStorage.setItem(_mk,JSON.stringify({skills:_s.skills})); }
  function _sig(x){ return 1/(1+Math.exp(-x)); }
  function _vid(v){ return /^[a-zA-Z0-9_\-]{4,20}$/.test(String(v||"").trim()); }
  function setStudentId(v){
    var id=String(v||"").trim();
    if(!_vid(id)) return false;
    _s.studentId=id;
    localStorage.setItem(_ik,id);
    return true;
  }
  function getStudentId(){ return _s.studentId; }
  function ensureStudentIdentity(){
    if(_vid(_s.studentId)) return _s.studentId;
    var e="";
    while(!_vid(e)){
      e=window.prompt("\u0627\u062f\u062e\u0644 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062c\u0627\u0645\u0639\u064a (4-20 \u0623\u062d\u0631\u0641/\u0623\u0631\u0642\u0627\u0645):","") || "";
      if(!e) break;
      e=e.trim();
      if(!_vid(e)) window.alert("\u0635\u064a\u063a\u0629 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062c\u0627\u0645\u0639\u064a \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629. \u0645\u062b\u0627\u0644: 443211234");
    }
    if(_vid(e)) setStudentId(e);
    else if(!_s.studentId) _s.studentId="unknown_student";
    return _s.studentId||"unknown_student";
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
    var sid=_vid(payload.student_id)?String(payload.student_id).trim():ensureStudentIdentity();
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
    var ex=JSON.parse(localStorage.getItem(_sk)||"[]");
    ex.push(ev);
    localStorage.setItem(_sk,JSON.stringify(ex));
    return ev;
  }

  function updateBKT(skillId,isCorrect){
    var sid=String(skillId||"unknown_skill");
    var pL=_gm(sid),pG=_s.bktConfig.p_guess,pS=_s.bktConfig.p_slip,pLn=_s.bktConfig.p_learn;
    var num,den,post;
    if(isCorrect){ num=pL*(1-pS); den=num+(1-pL)*pG; }
    else{ num=pL*pS; den=num+(1-pL)*(1-pG); }
    post=den===0?pL:(num/den);
    var upd=post+(1-post)*pLn;
    _s.skills[sid]=Math.max(0.001,Math.min(0.999,upd));
    _save();
    return {skill_id:sid,mastery:_s.skills[sid]};
  }

  function predictMastery(features){
    var f={
      difficulty_num:_ndiff(features.difficulty),
      attempts_count:Number(features.attempts_count||1),
      used_help:features.used_help?1:0,
      time_spent_sec:Number(features.time_spent_sec||0),
      showed_solution:features.showed_solution?1:0,
      bkt_mastery:Number(features.bkt_mastery||0)
    };
    var ord=_s.lrConfig.feature_order||_lr0.feature_order;
    var coef=_s.lrConfig.coefficients||_lr0.coefficients;
    var z=Number(_s.lrConfig.intercept||0);
    for(var i=0;i<ord.length;i++) z+=Number(coef[i]||0)*Number(f[ord[i]]||0);
    var prob=_sig(z);
    var thr=Number(_s.lrConfig.threshold||0.6);
    var ok=prob>=thr?1:0;
    return{probability_mastered:prob,mastered:ok,recommended_support:ok?"continue_practice":"needs_support"};
  }

  function exportTrainingData(filename){
    var raw=localStorage.getItem(_sk)||"[]";
    var name=String(filename||"training_batch_200.json");
    try{
      var blob=new Blob([raw],{type:"application/json;charset=utf-8"});
      var url=URL.createObjectURL(blob);
      var a=document.createElement("a");
      a.href=url; a.download=name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }catch(e){}
    return JSON.parse(raw);
  }

  function exportStudentTrainingData(studentId){
    var sid=String(studentId||ensureStudentIdentity()||"").trim();
    var all=JSON.parse(localStorage.getItem(_sk)||"[]");
    var fil=all.filter(function(e){ return String(e.student_id||"")===sid; });
    var name="student_log_"+sid+".json";
    try{
      var blob=new Blob([JSON.stringify(fil,null,2)],{type:"application/json;charset=utf-8"});
      var url=URL.createObjectURL(blob);
      var a=document.createElement("a");
      a.href=url; a.download=name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }catch(e){}
    return fil;
  }

  function _warmup(){
    var cur=JSON.parse(localStorage.getItem(_sk)||"[]");
    if(cur.length>=12) return;
    var syn=[];
    for(var i=0;i<18;i++){
      var at=1+(i%3),uh=i%4===0?1:0,ss=i%7===0?1:0,df=(i%3)+1,ic=(at===1&&!uh)?1:(i%2);
      syn.push({
        student_id:"s"+(i%5),question_id:"q"+(i%6),skill_id:"sk"+(i%3),topic_id:"sk"+(i%3),
        difficulty:df,is_correct:ic,attempts_count:at,used_help:uh,
        time_spent_sec:30+(i*11),showed_solution:ss,
        timestamp:new Date(Date.now()-(i*3600000)).toISOString(),synthetic:true
      });
    }
    localStorage.setItem(_sk,JSON.stringify(cur.concat(syn)));
  }

  async function _fetchJ(url){
    var res=await fetch(url);
    if(!res.ok){ var e=new Error("HTTP "+res.status); e.status=res.status; throw e; }
    return res.json();
  }

  async function loadModelWeights(opts){
    opts=opts||{};
    try{ if(opts.bktPath){ var bkt=await _fetchJ(opts.bktPath); if(bkt&&typeof bkt==="object") _s.bktConfig=Object.assign({},_s.bktConfig,bkt); } }catch(e){}
    try{ if(opts.lrPath){ var lr=await _fetchJ(opts.lrPath); if(lr&&typeof lr==="object") _s.lrConfig=Object.assign({},_s.lrConfig,lr); } }catch(e){}
    _warmup();
    return{bkt:_s.bktConfig,lr:_s.lrConfig};
  }

  _load();
  ensureStudentIdentity();
  window.AdaptiveLearning={
    setStudentId:setStudentId,
    getStudentId:getStudentId,
    ensureStudentIdentity:ensureStudentIdentity,
    collectStudentEvent:collectStudentEvent,
    updateBKT:updateBKT,
    predictMastery:predictMastery,
    exportTrainingData:exportTrainingData,
    exportStudentTrainingData:exportStudentTrainingData,
    loadModelWeights:loadModelWeights
  };
})();
