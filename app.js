/* Money Core — complete app V1 (client-side, data-on-device) */
'use strict';

/* ---------- storage ---------- */
var KEY = 'moneycore.v1';
var SEEDED = 'moneycore.seeded.v1';
var DEFAULT_CONFIG = {
  businessName: 'My Business', rate: 100,
  ohMonth: 3000, billHrs: 160, margin: 15, tax: 0, followUpDays: 3,
  crewRoles: [{name:'Helper', rate:30},{name:'Installer', rate:45}]
};
var STATUSES = ['lead','bid_sent','won','in_progress','done','paid'];
var STATUS_LABEL = {lead:'Lead',bid_sent:'Bid Sent',won:'Won',in_progress:'In Progress',done:'Done',paid:'Paid'};

function load(){
  try{ var r = localStorage.getItem(KEY); if(r) return JSON.parse(r); }catch(e){}
  try{
    if(!localStorage.getItem(SEEDED)){
      localStorage.setItem(SEEDED, '1');
      var d = demoState();
      try{ localStorage.setItem(KEY, JSON.stringify(d)); }catch(e){}
      return d;
    }
  }catch(e){}
  return { config: Object.assign({}, DEFAULT_CONFIG), clients: [], jobs: [] };
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch(e){ alert('Could not save — this device is out of storage. Try removing some photos.'); return false; }
}
function normalizeState(st){
  st.config = Object.assign({}, DEFAULT_CONFIG, st.config || {});
  st.config.crewRoles = Array.isArray(st.config.crewRoles) && st.config.crewRoles.length
    ? st.config.crewRoles.map(function(r){return {name:r.name, rate:r.rate};})
    : [{name:'Helper', rate:30},{name:'Installer', rate:45}];
  delete st.config.helperRate;
  st.meta = st.meta || {};
  st.materials = st.materials || [];
  (st.jobs||[]).forEach(function(j){
    if(!j.bid) return;
    if(!Array.isArray(j.bid.crew)){
      j.bid.crew=[];
      if(j.bid.helperOn && (parseFloat(j.bid.helperHours)||0)>0){
        j.bid.crew.push({name:'Helper', rate:(parseFloat(j.bid.helperRate)||30), hours:(parseFloat(j.bid.helperHours)||0)});
      }
    }
    delete j.bid.helperOn; delete j.bid.helperHours; delete j.bid.helperRate;
  });
  return st;
}
var state = normalizeState(load());

/* ---------- helpers ---------- */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function money(n){ if(isNaN(n)) n=0; return '$'+Math.round(n).toLocaleString('en-US'); }
function n(v){ var x=parseFloat(v); return isNaN(x)||x<0?0:x; }
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function jobById(id){ return state.jobs.filter(function(j){return j.id===id;})[0]; }
function clientById(id){ var c=state.clients.filter(function(x){return x.id===id;})[0]; return c||{name:'(no client)'}; }
function daysAgo(ts){ return Math.floor((Date.now()-ts)/86400000); }

/* ---------- the estimating engine (reused core) ---------- */
function bidCalc(bid){
  var c = state.config;
  bid = bid || {};
  var hours = n(bid.hours), rate = n(bid.rate!=null?bid.rate:c.rate);
  var labor = hours*rate;
  var crew = (bid.crew||[]).reduce(function(t,x){return t+n(x.hours)*n(x.rate);},0);
  var mat = (bid.materials||[]).reduce(function(t,m){return t+n(m.qty)*n(m.price);},0);
  var other = n(bid.equip)+n(bid.permits)+n(bid.subs)+n(bid.dump);
  var ohHr = n(c.billHrs)>0 ? n(c.ohMonth)/n(c.billHrs) : 0;
  var overhead = ohHr*hours;
  var direct = labor+crew+mat+other;
  var totalCost = direct+overhead;
  var profit = totalCost*(n(c.margin)/100);
  var tax = mat*(n(c.tax)/100);
  var price = totalCost+profit+tax;
  return { labor:labor, crew:crew, helper:crew, mat:mat, other:other, direct:direct,
    overhead:overhead, totalCost:totalCost, profit:profit, tax:tax,
    price:price, oldWay:direct, found:(price-direct) };
}
/* invoice total = bid price + change orders */
function jobInvoiceTotal(job){
  var base = bidCalc(job.bid).price;
  var co = (job.changeOrders||[]).reduce(function(t,x){return t+n(x.amount);},0);
  return base+co;
}
function jobPaid(job){ return (job.payments||[]).reduce(function(t,p){return t+n(p.amount);},0); }
function jobBalance(job){ return jobInvoiceTotal(job)-jobPaid(job); }

/* ---------- demo data (seeds once on first open; clearable in Settings) ---------- */
function demoState(){
  state = { config: Object.assign({}, DEFAULT_CONFIG, {businessName:'My Business'}), clients: [], jobs: [] };
  var DAY=86400000, now=Date.now();
  var c1=uid(), c2=uid();
  state.clients.push({id:c1, name:'John Smith', phone:'(555) 010-2233', email:'john@example.com'});
  state.clients.push({id:c2, name:'Mike Davis', phone:'(555) 044-9876', email:'mike@example.com'});

  // 1) Finished job — shows the whole process end to end
  var j1={ id:uid(), clientId:c1, name:'Demo — Deck Rebuild', status:'paid', createdAt:now-16*DAY,
    bid:{ hours:32, rate:100, crew:[],
      materials:[{desc:'Pressure-treated lumber',qty:40,price:5.5},{desc:'Deck screws (box)',qty:5,price:12},{desc:'Concrete bags',qty:6,price:8}],
      equip:0, permits:150, subs:0, dump:75 },
    changeOrders:[{id:uid(),desc:'Added railing section',amount:400,ts:now-12*DAY}],
    costs:[], invoice:{issued:true, issuedAt:now-8*DAY}, payments:[],
    proposal:{signedName:'John Smith', ts:now-14*DAY}, photos:[], activity:[] };
  var t1=jobInvoiceTotal(j1);
  j1.payments.push({id:uid(), amount:1500, method:'Check', ts:now-13*DAY});
  j1.payments.push({id:uid(), amount:Math.round((t1-1500)*100)/100, method:'Card', ts:now-3*DAY});
  j1.activity=[{ts:now-16*DAY,text:'Bid created'},{ts:now-14*DAY,text:'Proposal accepted by John Smith'},
    {ts:now-14*DAY,text:'Status → Won'},{ts:now-13*DAY,text:'Payment $1,500 (deposit)'},
    {ts:now-12*DAY,text:'Change order: Added railing section ($400)'},{ts:now-10*DAY,text:'Status → In Progress'},
    {ts:now-8*DAY,text:'Invoice issued'},{ts:now-5*DAY,text:'Status → Done'},{ts:now-3*DAY,text:'Paid in full ✓'}];
  state.jobs.push(j1);

  // 2) Ongoing job — shows the in-progress flow (deposit paid, balance due)
  var j2={ id:uid(), clientId:c2, name:'Demo — Kitchen Remodel', status:'in_progress', createdAt:now-6*DAY,
    bid:{ hours:60, rate:100, crew:[{name:'Installer',rate:45,hours:30},{name:'Helper',rate:30,hours:40}],
      materials:[{desc:'Cabinets',qty:1,price:3200},{desc:'Countertop',qty:1,price:1800},{desc:'Tile (sq ft)',qty:120,price:6.5},{desc:'Fixtures',qty:1,price:650}],
      equip:200, permits:300, subs:1200, dump:150 },
    changeOrders:[], costs:[], invoice:{issued:true, issuedAt:now-2*DAY},
    payments:[{id:uid(), amount:5000, method:'Check', ts:now-5*DAY}],
    proposal:{signedName:'Mike Davis', ts:now-5*DAY}, photos:[],
    activity:[{ts:now-6*DAY,text:'Bid created'},{ts:now-5*DAY,text:'Proposal accepted by Mike Davis'},
      {ts:now-5*DAY,text:'Payment $5,000 (deposit)'},{ts:now-5*DAY,text:'Status → Won'},
      {ts:now-4*DAY,text:'Status → In Progress'},{ts:now-2*DAY,text:'Invoice issued'}] };
  state.jobs.push(j2);
  return state;
}
function loadDemo(){ if(!confirm('Load the demo jobs? This replaces the data on this device.')) return; state=demoState(); save(); jobTab='overview'; go('dashboard'); }

/* ---------- backup / restore (data safety) ---------- */
function exportBackup(){
  try{
    var blob=new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    var url=URL.createObjectURL(blob), a=document.createElement('a');
    var d=new Date(), p=function(x){return (x<10?'0':'')+x;};
    a.href=url; a.download='moneycore-backup-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
    state.meta.lastBackup=Date.now(); save();
    alert('Backup saved to your downloads. Keep it safe — email it to yourself or save it in Files. Restore it anytime from Settings.');
    if(cur.view==='settings') render();
  }catch(e){ alert('Could not create the backup file.'); }
}
function importBackupFile(){
  var inp=document.getElementById('bk_file'); var f=inp&&inp.files[0]; if(!f) return;
  var rd=new FileReader();
  rd.onload=function(){
    if(inp) inp.value='';
    try{
      var o=JSON.parse(rd.result);
      if(!o||!o.config||!Array.isArray(o.jobs)||!Array.isArray(o.clients)){ alert('That does not look like a Money Core backup file.'); return; }
      if(!confirm('Restore this backup? It REPLACES all data currently on this device.')) return;
      normalizeState(o);
      var oldState=state; state=o;
      if(!save()){ state=oldState; alert('Not enough storage to restore this backup. Free up space and try again.'); return; }
      jobTab='overview'; go('dashboard'); alert('Backup restored ✓');
    }catch(e){ alert('Could not read that backup file.'); }
  };
  rd.readAsText(f);
}
function startFresh(){
  if(!confirm('Clear the demo jobs and start with your real jobs? Your business settings will stay.')) return;
  state.clients=[]; state.jobs=[]; save(); jobTab='overview'; go('dashboard');
}
function daysSinceBackup(){ return (state.meta&&state.meta.lastBackup)?daysAgo(state.meta.lastBackup):null; }
function backupStatusHTML(){
  var d=daysSinceBackup();
  if(d!==null && d<0) d=0;
  if(d===null) return '<div class="flag" style="margin-top:10px">⚠️ You haven\'t backed up yet.</div>';
  if(d>=7) return '<div class="flag" style="margin-top:10px">⚠️ Last backup: '+d+' days ago — time for a fresh one.</div>';
  return '<div class="muted" style="margin-top:10px">✓ Last backup: '+(d===0?'today':d+' day'+(d===1?'':'s')+' ago')+'.</div>';
}

/* ---------- router ---------- */
var cur = {view:'dashboard', param:null};
function go(view, param){ cur={view:view, param:param||null}; render(); window.scrollTo(0,0); }
function setNav(){
  document.querySelectorAll('nav.bottom button').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-nav')===cur.view);
  });
}
function render(){
  setNav();
  var el = document.getElementById('view');
  var hdr = document.getElementById('hdrBtn');
  hdr.style.display='none';
  if(cur.view==='dashboard') el.innerHTML = viewDashboard();
  else if(cur.view==='jobs') el.innerHTML = viewJobs();
  else if(cur.view==='clients') el.innerHTML = viewClients();
  else if(cur.view==='newbid'){ el.innerHTML = viewNewBid(); wireBidForm(null); }
  else if(cur.view==='settings') el.innerHTML = viewSettings();
  else if(cur.view==='job'){ el.innerHTML = viewJob(cur.param); afterJob(cur.param); }
  setHeader();
}
function setHeader(){
  var t=document.getElementById('hdrTitle'), s=document.getElementById('hdrSub');
  var map={dashboard:['📊 '+esc(state.config.businessName),'Run your jobs. Win the money.'],
    jobs:['🗂️ Jobs','Your pipeline'],clients:['👥 Clients',''],
    newbid:['➕ New Bid','Build a profitable bid'],settings:['⚙️ Settings','Your business numbers'],
    job:['👤 Job','']};
  var m=map[cur.view]||['Money Core',''];
  t.innerHTML=m[0]; s.textContent=m[1];
}

/* ---------- Dashboard ---------- */
function reminders(){
  var out=[];
  state.jobs.forEach(function(j){
    if(j.status==='bid_sent' && daysAgo(j.createdAt) >= n(state.config.followUpDays))
      out.push({icon:'📨', text:'Follow up: '+ (j.name||'job') +' — bid sent '+daysAgo(j.createdAt)+'d ago', job:j.id});
    if(j.invoice && j.invoice.issued && jobBalance(j) > 0.5)
      out.push({icon:'💸', text:'Unpaid: '+(j.name||'job')+' owes '+money(jobBalance(j)), job:j.id});
  });
  return out;
}
function viewDashboard(){
  var jobs=state.jobs;
  var owed=jobs.reduce(function(t,j){ return t + (j.invoice&&j.invoice.issued?Math.max(0,jobBalance(j)):0); },0);
  var active=jobs.filter(function(j){return j.status==='won'||j.status==='in_progress';}).length;
  var foundRec=jobs.filter(function(j){return j.status!=='lead'&&j.status!=='bid_sent';})
    .reduce(function(t,j){return t+bidCalc(j.bid).found;},0);
  var profitBooked=jobs.filter(function(j){return j.status==='paid';})
    .reduce(function(t,j){return t+bidCalc(j.bid).profit;},0);
  var rem=reminders();
  var counts={}; STATUSES.forEach(function(s){counts[s]=0;});
  jobs.forEach(function(j){counts[j.status]=(counts[j.status]||0)+1;});

  var h='';
  var dsb=daysSinceBackup();
  if(jobs.length && (dsb===null || dsb>=7)){
    h+='<div class="flag" style="cursor:pointer;background:#fff3d6" onclick="go(\'settings\')">📤 '+(dsb===null?'Back up your data so you never lose a job — tap here':'Last backup '+dsb+' days ago — tap to back up')+'</div>';
  }
  h+='<div class="tiles">';
  h+='<div class="tile green"><div class="lbl">Active jobs</div><div class="num">'+active+'</div></div>';
  h+='<div class="tile"><div class="lbl">Money owed</div><div class="num">'+money(owed)+'</div></div>';
  h+='<div class="tile found"><div class="lbl">Found money</div><div class="num">'+money(foundRec)+'</div></div>';
  h+='<div class="tile green"><div class="lbl">Profit booked</div><div class="num">'+money(profitBooked)+'</div></div>';
  h+='</div>';

  h+='<div class="scanhero" onclick="openScan()"><div class="scanhero-ic">📷</div>'+
     '<div class="scanhero-tx"><div class="scanhero-t">Scan a receipt</div>'+
     '<div class="scanhero-s">Snap it → save to a job → prices in seconds</div></div>'+
     '<div class="scanhero-go">→</div></div>';

  if(rem.length){
    h+='<div class="card"><h2>🔔 Needs attention</h2>';
    rem.forEach(function(r){ h+='<div class="flag" onclick="go(\'job\',\''+r.job+'\')">'+r.icon+' '+esc(r.text)+'</div>'; });
    h+='</div>';
  }

  h+='<div class="card"><h2>Pipeline</h2>';
  STATUSES.forEach(function(s){
    h+='<div class="statline"><span><span class="badge b-'+s+'">'+STATUS_LABEL[s]+'</span></span><span class="v">'+counts[s]+'</span></div>';
  });
  h+='</div>';

  h+='<div class="card"><h2>🧠 Money Core Assistant</h2><div class="muted">Ask it to build a bid, draft a follow-up, or tell you who owes you money. Coming in the next version (V2) — powered by AI.</div><button class="btn ghost" style="margin-top:10px" onclick="alert(\'The AI Assistant goes live in V2 with the secure backend. For now, build bids in the New Bid tab.\')">Preview</button></div>';

  h+='<button class="btn green" onclick="go(\'newbid\')">➕ Start a new bid</button>';
  return h;
}

/* ---------- Jobs ---------- */
function viewJobs(){
  if(!state.jobs.length) return empty('🗂️','No jobs yet','Start your first bid to create a job.','go(\'newbid\')','➕ New Bid');
  var jobs=state.jobs.slice().sort(function(a,b){return b.createdAt-a.createdAt;});
  var h='<button class="btn green" onclick="go(\'newbid\')">➕ New Bid</button>';
  h+='<input id="jobsearch" placeholder="🔍 Search jobs or clients" oninput="filterJobs()" style="margin-top:12px">';
  h+='<div id="joblist">';
  jobs.forEach(function(j){
    var bal=jobBalance(j);
    var hay=(j.name||'')+' '+clientById(j.clientId).name+' '+STATUS_LABEL[j.status];
    h+='<div class="item" data-s="'+esc(hay)+'" onclick="go(\'job\',\''+j.id+'\')">'+
       '<div><div class="t">'+esc(j.name||'Untitled job')+'</div>'+
       '<div class="s">'+esc(clientById(j.clientId).name)+' · <span class="badge b-'+j.status+'">'+STATUS_LABEL[j.status]+'</span></div></div>'+
       '<div class="r">'+money(bidCalc(j.bid).price)+(j.invoice&&j.invoice.issued&&bal>0.5?'<div class="s" style="color:#c00">owes '+money(bal)+'</div>':'')+'</div></div>';
  });
  h+='</div><div id="nojobs" class="muted hidden" style="text-align:center;padding:24px">No jobs match.</div>';
  return h;
}

function filterJobs(){
  var q=(document.getElementById('jobsearch').value||'').toLowerCase().trim();
  var shown=0;
  document.querySelectorAll('#joblist .item').forEach(function(el){
    var hit=(el.getAttribute('data-s')||'').toLowerCase().indexOf(q)>-1;
    el.style.display=hit?'':'none'; if(hit) shown++;
  });
  var no=document.getElementById('nojobs'); if(no) no.classList.toggle('hidden', shown>0);
}

/* ---------- Clients ---------- */
function viewClients(){
  var h='<button class="btn ghost" onclick="clientModal()">➕ Add client</button>';
  if(!state.clients.length) return h+empty('👥','No clients yet','Add a client or create one while building a bid.','','');
  state.clients.forEach(function(c){
    var jobs=state.jobs.filter(function(j){return j.clientId===c.id;}).length;
    h+='<div class="item" onclick="clientModal(\''+c.id+'\')"><div><div class="t">'+esc(c.name)+'</div>'+
       '<div class="s">'+(c.phone?esc(c.phone)+' · ':'')+jobs+' job'+(jobs===1?'':'s')+'</div></div><div class="r">›</div></div>';
  });
  return h;
}
function clientModal(id){
  var c = id?clientById(id):{name:'',phone:'',email:''};
  openModal((id?'Edit':'Add')+' Client',
    '<label>Name</label><input id="cl_name" value="'+esc(c.name)+'">'+
    '<label>Phone</label><input id="cl_phone" value="'+esc(c.phone||'')+'">'+
    '<label>Email</label><input id="cl_email" value="'+esc(c.email||'')+'">'+
    '<button class="btn" style="margin-top:14px" onclick="saveClient(\''+(id||'')+'\')">Save</button>'+
    (id?'<button class="btn danger" style="margin-top:8px" onclick="delClient(\''+id+'\')">Delete</button>':''));
}
function saveClient(id){
  var name=document.getElementById('cl_name').value.trim();
  if(!name){ alert('Name required'); return; }
  var data={name:name, phone:document.getElementById('cl_phone').value.trim(), email:document.getElementById('cl_email').value.trim()};
  if(id){ Object.assign(clientById(id),data); }
  else { data.id=uid(); state.clients.push(data); }
  save(); closeModal(); render();
}
function delClient(id){
  if(state.jobs.some(function(j){return j.clientId===id;})){ alert('This client has jobs. Reassign or delete those first.'); return; }
  if(!confirm('Delete this client?')) return;
  state.clients=state.clients.filter(function(c){return c.id!==id;});
  save(); closeModal(); render();
}

/* ---------- New Bid + shared bid form ---------- */
function blankBid(){ return {hours:40, rate:state.config.rate, crew:[], materials:[{desc:'',qty:'',price:''}], equip:0,permits:0,subs:0,dump:0}; }
var draft = null;
function viewNewBid(){
  draft = blankBid();
  var opts='<option value="">— new client —</option>'+state.clients.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+'</option>';}).join('');
  return '<div class="card"><h2>Job</h2>'+
    '<label>Client</label><select id="nb_client">'+opts+'</select>'+
    '<label>New client name (if new)</label><input id="nb_newclient" placeholder="leave blank if existing">'+
    '<label>Job name</label><input id="nb_jobname" placeholder="e.g. Back deck rebuild">'+
    '</div>'+ bidFormHTML(draft) +
    '<button class="btn green" id="nb_save" onclick="saveNewBid()" style="margin-top:6px">💾 Save bid &amp; create job</button>';
}
function bidFormHTML(b){
  var mats=(b.materials||[]).map(function(m,i){return matRow(m,i);}).join('');
  return '<div class="card"><h2>Labor</h2>'+
    '<div class="row"><div><label>Your hours</label><input id="bf_hours" type="number" inputmode="decimal" value="'+esc(b.hours)+'"></div>'+
    '<div><label>Your rate ($/hr)</label><input id="bf_rate" type="number" inputmode="decimal" value="'+esc(b.rate)+'"></div></div></div>'+
    '<div class="card"><h2>Crew / Helpers</h2><div class="muted">Add helpers, installers, or any crew — each at their own rate.</div>'+
    '<div id="bf_crew">'+crewRowsHTML(b)+'</div>'+
    '<button class="addrow" onclick="addCrew()">+ Add crew member</button></div>'+
    '<div class="card"><h2>Materials</h2><div class="mathdr"><span>Item</span><span>Qty</span><span>$ Ea</span><span>Total</span><span></span></div>'+
    '<div id="bf_mats">'+mats+'</div><div class="row"><button class="addrow" onclick="addMat()">+ Add material</button><button class="addrow" onclick="openLibPicker()">📦 From library</button></div></div>'+
    '<div class="card"><h2>Other Costs</h2><div class="row"><div><label>Equipment</label><input id="bf_equip" type="number" inputmode="decimal" value="'+esc(b.equip)+'"></div>'+
    '<div><label>Permits</label><input id="bf_permits" type="number" inputmode="decimal" value="'+esc(b.permits)+'"></div></div>'+
    '<div class="row"><div><label>Subs</label><input id="bf_subs" type="number" inputmode="decimal" value="'+esc(b.subs)+'"></div>'+
    '<div><label>Dump</label><input id="bf_dump" type="number" inputmode="decimal" value="'+esc(b.dump)+'"></div></div></div>'+
    '<div class="card"><h2>The Bid</h2><div id="bf_break"></div>'+
    '<div class="result"><div><div class="lbl">Bid Price</div></div><div class="v" id="bf_price">$0</div></div>'+
    '<div class="result leak"><div><div class="lbl">Found money</div></div><div class="v" id="bf_found">$0</div></div>'+
    '<div class="found-note" id="bf_foundnote"></div></div>';
}
function matRow(m,i){
  return '<div class="matline" data-i="'+i+'">'+
    '<input class="m-desc" placeholder="item" value="'+esc(m.desc||'')+'">'+
    '<input class="m-qty" type="number" inputmode="decimal" placeholder="0" value="'+esc(m.qty==null?'':m.qty)+'">'+
    '<input class="m-price" type="number" inputmode="decimal" placeholder="0" value="'+esc(m.price==null?'':m.price)+'">'+
    '<span class="lt">$0</span><span class="x" onclick="delMat(this)">×</span></div>';
}
function readBidForm(){
  var mats=[];
  document.querySelectorAll('#bf_mats .matline').forEach(function(r){
    mats.push({desc:r.querySelector('.m-desc').value, qty:r.querySelector('.m-qty').value, price:r.querySelector('.m-price').value});
  });
  var crew=[];
  document.querySelectorAll('#bf_crew .crewline').forEach(function(r){
    crew.push({name:r.querySelector('.cr-role').value, hours:r.querySelector('.cr-hours').value, rate:r.querySelector('.cr-rate').value});
  });
  return { hours:document.getElementById('bf_hours').value, rate:document.getElementById('bf_rate').value,
    crew:crew,
    materials:mats, equip:document.getElementById('bf_equip').value, permits:document.getElementById('bf_permits').value,
    subs:document.getElementById('bf_subs').value, dump:document.getElementById('bf_dump').value };
}
function recalcBid(){
  var b=readBidForm();
  document.querySelectorAll('#bf_mats .matline').forEach(function(r){
    var q=n(r.querySelector('.m-qty').value), p=n(r.querySelector('.m-price').value);
    r.querySelector('.lt').textContent=money(q*p);
  });
  var c=bidCalc(b);
  document.getElementById('bf_break').innerHTML=
    line('Labor (you)',c.labor)+(c.crew>0?line('Crew / helpers',c.crew):'')+line('Materials',c.mat)+
    line('Other',c.other)+line('Overhead (auto)',c.overhead)+
    '<div class="statline"><span><b>Total cost</b></span><span class="v">'+money(c.totalCost)+'</span></div>'+
    line('Profit ('+n(state.config.margin)+'%)',c.profit)+(c.tax>0?line('Tax',c.tax):'');
  document.getElementById('bf_price').textContent=money(c.price);
  document.getElementById('bf_found').textContent=money(c.found);
  document.getElementById('bf_foundnote').textContent=c.oldWay>0?('That is '+Math.round(c.found/c.oldWay*100)+'% more than bidding with no overhead/profit.'):'';
}
function line(label,val){ return '<div class="statline"><span>'+esc(label)+'</span><span class="v">'+money(val)+'</span></div>'; }
function wireBidForm(){
  var v=document.getElementById('view');
  v.addEventListener('input', recalcBid);
  v.addEventListener('change', recalcBid);
  recalcBid();
}
function addMat(desc,qty,price){ var w=document.getElementById('bf_mats'); var d=document.createElement('div'); d.innerHTML=matRow({desc:desc||'',qty:(qty!=null?qty:''),price:(price!=null?price:'')},0); w.appendChild(d.firstChild); recalcBid(); }
function crewRowsHTML(b){ return (b.crew||[]).map(function(c){return crewRow(c);}).join(''); }
function crewRow(c){
  c=c||{}; var roles=state.config.crewRoles||[];
  var opts=roles.map(function(r){return '<option value="'+esc(r.name)+'" data-rate="'+r.rate+'"'+(c.name===r.name?' selected':'')+'>'+esc(r.name)+'</option>';}).join('');
  return '<div class="crewline">'+
    '<select class="cr-role" onchange="crewRolePick(this)">'+opts+'</select>'+
    '<input class="cr-hours" type="number" inputmode="decimal" placeholder="hrs" value="'+esc(c.hours==null?'':c.hours)+'">'+
    '<input class="cr-rate" type="number" inputmode="decimal" placeholder="$/hr" value="'+esc(c.rate==null?'':c.rate)+'">'+
    '<span class="x" onclick="this.parentNode.remove();recalcBid()">×</span></div>';
}
function crewRolePick(sel){ var opt=sel.options[sel.selectedIndex]; var rate=opt&&opt.getAttribute('data-rate'); var ri=sel.parentNode.querySelector('.cr-rate'); if(ri && rate!=null) ri.value=rate; recalcBid(); }
function addCrew(){ var w=document.getElementById('bf_crew'); var def=(state.config.crewRoles||[])[0]||{name:'Helper',rate:30}; var d=document.createElement('div'); d.innerHTML=crewRow({name:def.name,rate:def.rate,hours:''}); w.appendChild(d.firstChild); recalcBid(); }
function openLibPicker(){
  if(!state.materials.length){ alert('No saved materials yet. Add them in Settings → Materials Library.'); return; }
  var list=state.materials.map(function(m){return '<button class="btn ghost" style="margin-top:8px;text-align:left" onclick="addMatFromLib(\''+m.id+'\')">'+esc(m.desc)+' · '+money(m.price)+'/ea</button>';}).join('');
  openModal('📦 Saved materials', list);
}
function addMatFromLib(id){ var m=state.materials.filter(function(x){return x.id===id;})[0]; if(!m) return; closeModal(); addMat(m.desc,1,m.price); }
function addLibMaterial(){ var d=document.getElementById('lib_desc').value.trim(); var p=n(document.getElementById('lib_price').value); if(!d){ alert('Enter a material name'); return; } state.materials.push({id:uid(),desc:d,price:p}); save(); render(); }
function delLibMaterial(id){ state.materials=state.materials.filter(function(m){return m.id!==id;}); save(); render(); }
function addCrewRole(){ var nm=document.getElementById('crn_name').value.trim(); var rt=n(document.getElementById('crn_rate').value); if(!nm){ alert('Enter a role name'); return; } state.config.crewRoles=state.config.crewRoles||[]; state.config.crewRoles.push({name:nm,rate:rt}); save(); render(); }
function delCrewRole(i){ if(!state.config.crewRoles) return; state.config.crewRoles.splice(i,1); save(); render(); }
function delMat(x){ x.parentNode.remove(); recalcBid(); }
function saveNewBid(){
  var jobname=document.getElementById('nb_jobname').value.trim();
  if(!jobname){ alert('Give the job a name'); return; }
  var clientId=document.getElementById('nb_client').value;
  var newName=document.getElementById('nb_newclient').value.trim();
  if(!clientId){
    if(!newName){ alert('Pick a client or enter a new client name'); return; }
    clientId=uid(); state.clients.push({id:clientId, name:newName, phone:'', email:''});
  }
  var job={ id:uid(), clientId:clientId, name:jobname, status:'bid_sent', createdAt:Date.now(),
    bid:readBidForm(), changeOrders:[], costs:[], invoice:{issued:false}, payments:[], proposal:null, photos:[],
    activity:[{ts:Date.now(), text:'Bid created'}] };
  state.jobs.push(job); save(); go('job', job.id);
}

/* ---------- Job detail ---------- */
var jobTab='overview';
function viewJob(id){
  var j=jobById(id); if(!j) return empty('','Job not found','','go(\'jobs\')','Back');
  jobTab = jobTab||'overview';
  var tabs=['overview','bid','costs','change','invoice','proposal','photos'];
  var tl={overview:'Overview',bid:'Bid',costs:'Time & Costs',change:'Change Orders',invoice:'Invoice',proposal:'Proposal',photos:'Photos'};
  var h='<div class="tabs">'+tabs.map(function(t){return '<div class="tab '+(jobTab===t?'active':'')+'" onclick="jobTab=\''+t+'\';render()">'+tl[t]+'</div>';}).join('')+'</div>';
  h+='<div class="card" style="margin-top:0"><div class="t" style="font-size:18px;font-weight:800">'+esc(j.name)+'</div>'+
     '<div class="muted">'+esc(clientById(j.clientId).name)+'</div>'+
     '<div style="margin-top:8px"><span class="badge b-'+j.status+'">'+STATUS_LABEL[j.status]+'</span></div>'+
     statusButtons(j)+'</div>';
  if(jobTab==='overview') h+=jobOverview(j);
  else if(jobTab==='bid') h+=bidFormHTML(j.bid)+'<button class="btn green" onclick="saveJobBid(\''+id+'\')">💾 Save bid changes</button>';
  else if(jobTab==='costs') h+=jobCosts(j);
  else if(jobTab==='change') h+=jobChange(j);
  else if(jobTab==='invoice') h+=jobInvoice(j);
  else if(jobTab==='proposal') h+=jobProposal(j);
  else if(jobTab==='photos') h+=jobPhotos(j);
  return h;
}
function afterJob(id){ if(jobTab==='bid'){ wireBidForm(); } }
function statusButtons(j){
  var idx=STATUSES.indexOf(j.status);
  var h='<div class="pill-btns">';
  if(idx<STATUSES.length-1) h+='<button class="btn green sm" onclick="advance(\''+j.id+'\')">Mark '+STATUS_LABEL[STATUSES[idx+1]]+' →</button>';
  if(idx>0) h+='<button class="btn ghost sm" onclick="backStatus(\''+j.id+'\')">← '+STATUS_LABEL[STATUSES[idx-1]]+'</button>';
  h+='<button class="btn ghost sm" onclick="editJobModal(\''+j.id+'\')">✏️ Edit</button>';
  h+='<button class="btn danger sm" onclick="delJob(\''+j.id+'\')">Delete</button></div>';
  return h;
}
function editJobModal(id){
  var j=jobById(id);
  var opts='<option value="">— pick a client —</option>'+state.clients.map(function(c){return '<option value="'+c.id+'"'+(c.id===j.clientId?' selected':'')+'>'+esc(c.name)+'</option>';}).join('');
  openModal('Edit job',
    '<label>Job name</label><input id="ej_name" value="'+esc(j.name)+'">'+
    '<label>Client</label><select id="ej_client">'+opts+'</select>'+
    '<label>Or add a new client</label><input id="ej_newclient" placeholder="leave blank if existing">'+
    '<button class="btn" style="margin-top:14px" onclick="saveJobEdit(\''+id+'\')">Save</button>');
}
function saveJobEdit(id){
  var j=jobById(id); var name=document.getElementById('ej_name').value.trim(); if(!name){ alert('Job needs a name'); return; }
  var cid=document.getElementById('ej_client').value; var newName=document.getElementById('ej_newclient').value.trim();
  if(newName){ cid=uid(); state.clients.push({id:cid,name:newName,phone:'',email:''}); }
  j.name=name; j.clientId=cid; save(); closeModal(); render();
}
function advance(id){ var j=jobById(id); var i=STATUSES.indexOf(j.status); if(i<STATUSES.length-1){ j.status=STATUSES[i+1]; j.activity.push({ts:Date.now(),text:'Status → '+STATUS_LABEL[j.status]}); save(); render(); } }
function backStatus(id){ var j=jobById(id); var i=STATUSES.indexOf(j.status); if(i>0){ j.status=STATUSES[i-1]; save(); render(); } }
function delJob(id){ if(!confirm('Delete this job?')) return; state.jobs=state.jobs.filter(function(j){return j.id!==id;}); save(); jobTab='overview'; go('jobs'); }
function saveJobBid(id){ var j=jobById(id); j.bid=readBidForm(); j.activity.push({ts:Date.now(),text:'Bid updated'}); save(); alert('Bid saved'); jobTab='overview'; render(); }

function jobOverview(j){
  var c=bidCalc(j.bid);
  var h='<div class="card"><h2>Money summary</h2>'+
    line('Bid price',c.price)+line('Change orders',(j.changeOrders||[]).reduce(function(t,x){return t+n(x.amount);},0))+
    '<div class="statline"><span><b>Invoice total</b></span><span class="v">'+money(jobInvoiceTotal(j))+'</span></div>'+
    line('Paid',jobPaid(j))+
    '<div class="statline"><span><b>Balance due</b></span><span class="v" style="color:'+(jobBalance(j)>0.5?'#c00':'#1a7f43')+'">'+money(jobBalance(j))+'</span></div>'+
    '</div>';
  h+='<div class="result leak"><div><div class="lbl">Found money on this job</div></div><div class="v">'+money(c.found)+'</div></div>';
  h+='<div class="card"><h2>Activity</h2>'+(j.activity||[]).slice().reverse().map(function(a){return '<div class="statline"><span>'+esc(a.text)+'</span><span class="muted">'+daysAgo(a.ts)+'d ago</span></div>';}).join('')+'</div>';
  return h;
}
function actualCosts(j){
  var o={labor:0,laborHrs:0,mat:0,other:0};
  (j.costs||[]).forEach(function(c){
    if(c.kind==='labor'){ o.laborHrs+=n(c.hours); o.labor+=n(c.amount); }
    else if(c.kind==='material'){ o.mat+=n(c.amount); }
    else { o.other+=n(c.amount); }
  });
  o.total=o.labor+o.mat+o.other; return o;
}
function jobCosts(j){
  var est=bidCalc(j.bid), a=actualCosts(j);
  var estHrs=n(j.bid.hours)+(j.bid.crew||[]).reduce(function(t,c){return t+n(c.hours);},0);
  var variance=a.total-est.direct;
  var h='<div class="card"><h2>Estimated vs Actual</h2>'+
    '<div class="statline"><span>Estimated hours</span><span class="v">'+(Math.round(estHrs*10)/10)+'</span></div>'+
    '<div class="statline"><span>Actual hours logged</span><span class="v">'+(Math.round(a.laborHrs*10)/10)+'</span></div>'+
    line('Estimated cost',est.direct)+line('Actual cost so far',a.total);
  if(a.total>0){
    h+='<div class="statline tot"><span>'+(variance>0?'Over estimate':'Under estimate')+'</span><span class="v" style="color:'+(variance>0?'var(--red)':'var(--green2)')+'">'+money(Math.abs(variance))+'</span></div>';
    h+='<div class="found-note">'+(variance>0?'This job is running over what you bid — bump similar bids ~'+Math.round(variance/Math.max(1,est.direct)*100)+'% next time.':'You\'re under your estimate — solid margin. 💪')+'</div>';
  } else { h+='<div class="found-note">Log hours and material costs as you go to see how the real job compares to your bid.</div>'; }
  h+='</div>';
  h+='<div class="card"><h2>Log time &amp; costs</h2>'+
    '<label>Type</label><select id="ct_kind" onchange="ctKind()"><option value="labor">Labor (hours)</option><option value="material">Material cost</option><option value="other">Other cost</option></select>'+
    '<div id="ct_hoursbox"><label>Hours worked (× your $'+n(state.config.rate)+'/hr)</label><input id="ct_hours" type="number" inputmode="decimal" placeholder="0"></div>'+
    '<div id="ct_amtbox" class="hidden"><label>Amount ($)</label><input id="ct_amt" type="number" inputmode="decimal" placeholder="0"></div>'+
    '<label>Note (optional)</label><input id="ct_desc" placeholder="e.g. framing day 1">'+
    '<button class="btn" style="margin-top:10px" onclick="addCost(\''+j.id+'\')">+ Log it</button>';
  (j.costs||[]).slice().reverse().forEach(function(c){
    var lbl=c.kind==='labor'?(c.hours+'h labor'):(c.kind==='material'?'Material':'Other');
    h+='<div class="statline"><span>'+lbl+(c.desc?' · '+esc(c.desc):'')+'</span><span class="v">'+money(c.amount)+' <span class="x" style="color:var(--red);cursor:pointer;margin-left:6px" onclick="delCost(\''+j.id+'\',\''+c.id+'\')">×</span></span></div>';
  });
  h+='</div>';
  return h;
}
function ctKind(){ var k=document.getElementById('ct_kind').value; document.getElementById('ct_hoursbox').classList.toggle('hidden',k!=='labor'); document.getElementById('ct_amtbox').classList.toggle('hidden',k==='labor'); }
function addCost(id){
  var j=jobById(id); var kind=document.getElementById('ct_kind').value; var desc=document.getElementById('ct_desc').value.trim();
  var e={id:uid(),kind:kind,desc:desc,ts:Date.now(),hours:0,amount:0};
  if(kind==='labor'){ var hrs=n(document.getElementById('ct_hours').value); if(!hrs){ alert('Enter the hours worked'); return; } e.hours=hrs; e.amount=hrs*n(state.config.rate); }
  else { var amt=n(document.getElementById('ct_amt').value); if(!amt){ alert('Enter an amount'); return; } e.amount=amt; }
  j.costs=j.costs||[]; j.costs.push(e); j.activity.push({ts:Date.now(),text:'Logged '+(kind==='labor'?e.hours+'h':money(e.amount))}); save(); render();
}
function delCost(id,cid){ var j=jobById(id); j.costs=j.costs.filter(function(c){return c.id!==cid;}); save(); render(); }

function jobChange(j){
  var h='<div class="card"><h2>Change Orders</h2><div class="muted">Mid-job scope changes. These add to the invoice so you get paid for the extra work.</div>';
  (j.changeOrders||[]).forEach(function(co){ h+='<div class="statline"><span>'+esc(co.desc)+'</span><span class="v">'+money(co.amount)+' <span class="x" style="color:#c00;cursor:pointer" onclick="delCO(\''+j.id+'\',\''+co.id+'\')">×</span></span></div>'; });
  h+='<label>Description</label><input id="co_desc" placeholder="e.g. add 2 more posts">'+
     '<label>Amount ($)</label><input id="co_amt" type="number" inputmode="decimal">'+
     '<button class="btn ghost" style="margin-top:10px" onclick="addCO(\''+j.id+'\')">+ Add change order</button></div>';
  return h;
}
function addCO(id){ var j=jobById(id); var d=document.getElementById('co_desc').value.trim(); var a=n(document.getElementById('co_amt').value);
  if(!d||!a){ alert('Add a description and amount'); return; }
  j.changeOrders=j.changeOrders||[]; j.changeOrders.push({id:uid(),desc:d,amount:a,ts:Date.now()});
  j.activity.push({ts:Date.now(),text:'Change order: '+d+' ('+money(a)+')'}); save(); render(); }
function delCO(id,coid){ var j=jobById(id); j.changeOrders=j.changeOrders.filter(function(x){return x.id!==coid;}); save(); render(); }

function jobInvoice(j){
  var c=bidCalc(j.bid);
  var h='<div class="card"><h2>Invoice</h2>';
  h+=line('Labor + materials + costs',c.direct)+line('Overhead + profit',c.overhead+c.profit+c.tax)+
     line('Change orders',(j.changeOrders||[]).reduce(function(t,x){return t+n(x.amount);},0))+
     '<div class="statline"><span><b>Total</b></span><span class="v">'+money(jobInvoiceTotal(j))+'</span></div>'+
     line('Paid',jobPaid(j))+
     '<div class="statline"><span><b>Balance due</b></span><span class="v">'+money(jobBalance(j))+'</span></div>';
  if(!j.invoice||!j.invoice.issued) h+='<button class="btn" style="margin-top:12px" onclick="issueInvoice(\''+j.id+'\')">📄 Issue invoice</button>';
  else h+='<div class="flag" style="margin-top:12px">📄 Invoice issued '+daysAgo(j.invoice.issuedAt)+'d ago</div>';
  h+='<button class="btn green" style="margin-top:10px" onclick="sendInvoice(\''+j.id+'\')">📤 Send invoice to client</button>';
  h+='<button class="btn ghost" style="margin-top:8px" onclick="printInvoice(\''+j.id+'\')">🖨️ Save as PDF</button>';
  h+='</div>';
  h+='<div class="card"><h2>Record a payment</h2><div class="muted">V1 records payments manually. Online card payments (Stripe) come in V2.</div>'+
     '<label>Amount ($)</label><input id="pay_amt" type="number" inputmode="decimal" value="'+Math.max(0,Math.round(jobBalance(j)))+'">'+
     '<label>Method</label><select id="pay_method"><option>Check</option><option>Cash</option><option>Card</option><option>Venmo/Zelle</option><option>Bank transfer</option></select>'+
     '<button class="btn green" style="margin-top:10px" onclick="recordPay(\''+j.id+'\')">+ Record payment</button>';
  (j.payments||[]).forEach(function(p){ h+='<div class="statline"><span>'+esc(p.method)+' · '+daysAgo(p.ts)+'d ago</span><span class="v">'+money(p.amount)+'</span></div>'; });
  h+='</div>';
  return h;
}
function issueInvoice(id){ var j=jobById(id); j.invoice={issued:true, issuedAt:Date.now()}; j.activity.push({ts:Date.now(),text:'Invoice issued ('+money(jobInvoiceTotal(j))+')'}); save(); render(); }
function recordPay(id){ var j=jobById(id); var a=n(document.getElementById('pay_amt').value); if(!a){ alert('Enter an amount'); return; }
  var bal=jobBalance(j);
  if(a > bal+0.5){ if(!confirm('This payment ('+money(a)+') is more than the balance due ('+money(bal)+'). Record it anyway?')) return; }
  var snap=JSON.stringify({payments:j.payments||[],activity:j.activity,status:j.status});
  j.payments=j.payments||[]; j.payments.push({id:uid(),amount:a,method:document.getElementById('pay_method').value,ts:Date.now()});
  j.activity.push({ts:Date.now(),text:'Payment '+money(a)});
  if(jobBalance(j)<=0.5 && j.status!=='paid'){ j.status='paid'; j.activity.push({ts:Date.now(),text:'Paid in full ✓'}); }
  if(!save()){ var s=JSON.parse(snap); j.payments=s.payments; j.activity=s.activity; j.status=s.status; return; }
  render(); }

/* ---------- send / share to client (client-side, uses the phone's share sheet) ---------- */
function proposalText(j){
  var c=bidCalc(j.bid);
  return state.config.businessName+'\nProposal for '+clientById(j.clientId).name+'\n'+j.name+'\n\n'+
    'Labor & installation: '+money(c.labor+c.helper+c.overhead+c.profit)+'\n'+
    'Materials: '+money(c.mat+c.tax)+'\n'+
    (c.other>0?'Other: '+money(c.other)+'\n':'')+
    'PROJECT TOTAL: '+money(jobInvoiceTotal(j))+'\n\nReply to accept. Thank you!';
}
function invoiceText(j){
  return state.config.businessName+'\nInvoice — '+j.name+'\nFor: '+clientById(j.clientId).name+'\n\n'+
    'Total: '+money(jobInvoiceTotal(j))+'\nPaid: '+money(jobPaid(j))+'\nBALANCE DUE: '+money(jobBalance(j))+'\n\nThank you for your business!';
}
function shareToClient(title, text){
  if(navigator.share){ navigator.share({title:title, text:text}).catch(function(){}); return; }
  openModal('Send '+title, '<div class="muted">Copy this and text or email it to your client.</div>'+
    '<textarea readonly rows="9" style="width:100%;margin-top:8px">'+esc(text)+'</textarea>'+
    '<button class="btn" style="margin-top:10px" onclick="copyFrom(this)">Copy text</button>');
}
function copyFrom(btn){ var ta=btn.parentNode.querySelector('textarea'); if(!ta) return; ta.select(); try{ document.execCommand('copy'); btn.textContent='Copied ✓'; }catch(e){} }
function sendProposal(id){ var j=jobById(id); if(j) shareToClient('Proposal', proposalText(j)); }
function sendInvoice(id){ var j=jobById(id); if(j) shareToClient('Invoice', invoiceText(j)); }

/* ---------- printable PDF (clean doc → print/save as PDF) ---------- */
function printDoc(title, bodyHTML){
  var w=window.open('','_blank');
  if(!w){ alert('Allow pop-ups to print or save as PDF.'); return; }
  w.document.write('<!DOCTYPE html><html><head><title>'+esc(title)+'</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,Arial,sans-serif;color:#111;padding:28px;max-width:700px;margin:auto}h1{font-size:22px;margin:6px 0 2px}.muted{color:#666;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:18px}td{padding:9px 0;border-bottom:1px solid #eee}td.r{text-align:right}.tot td{font-weight:800;border-top:2px solid #333;border-bottom:none;font-size:18px}.brand{font-weight:800;font-size:18px}</style></head><body>'+bodyHTML+'</body></html>');
  w.document.close(); w.focus();
  setTimeout(function(){ try{ w.print(); }catch(e){} }, 400);
}
function proposalDocHTML(j){
  var c=bidCalc(j.bid);
  return '<div class="brand">'+esc(state.config.businessName)+'</div><h1>Proposal</h1>'+
    '<div class="muted">For '+esc(clientById(j.clientId).name)+' &middot; '+esc(j.name)+'</div><table>'+
    '<tr><td>Labor &amp; installation</td><td class="r">'+money(c.labor+c.helper+c.overhead+c.profit)+'</td></tr>'+
    '<tr><td>Materials</td><td class="r">'+money(c.mat+c.tax)+'</td></tr>'+
    (c.other>0?'<tr><td>Other</td><td class="r">'+money(c.other)+'</td></tr>':'')+
    '<tr class="tot"><td>Project Total</td><td class="r">'+money(jobInvoiceTotal(j))+'</td></tr></table>'+
    '<p class="muted">Thank you for the opportunity. Reply to accept this proposal.</p>';
}
function invoiceDocHTML(j){
  return '<div class="brand">'+esc(state.config.businessName)+'</div><h1>Invoice</h1>'+
    '<div class="muted">For '+esc(clientById(j.clientId).name)+' &middot; '+esc(j.name)+'</div><table>'+
    '<tr><td>Total</td><td class="r">'+money(jobInvoiceTotal(j))+'</td></tr>'+
    '<tr><td>Paid</td><td class="r">'+money(jobPaid(j))+'</td></tr>'+
    '<tr class="tot"><td>Balance Due</td><td class="r">'+money(jobBalance(j))+'</td></tr></table>'+
    '<p class="muted">Thank you for your business.</p>';
}
function printProposal(id){ var j=jobById(id); if(j) printDoc('Proposal - '+(j.name||''), proposalDocHTML(j)); }
function printInvoice(id){ var j=jobById(id); if(j) printDoc('Invoice - '+(j.name||''), invoiceDocHTML(j)); }

/* ---------- 📷 receipt scan (camera) ---------- */
var pendingReceipt=null;
function openScan(){ var i=document.getElementById('scanInput'); if(i){ i.value=''; i.click(); } }
function handleScan(){
  var inp=document.getElementById('scanInput'); var f=inp&&inp.files[0]; if(!f) return;
  var img=new Image(), rd=new FileReader();
  rd.onload=function(){ img.onload=function(){
    var max=1100, sc=Math.min(1,max/Math.max(img.width,img.height));
    var cv=document.createElement('canvas'); cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    try{ pendingReceipt=cv.toDataURL('image/jpeg',0.7); }catch(e){ pendingReceipt=rd.result; }
    chooseReceiptJob();
  }; img.onerror=function(){ alert('Could not read that image.'); }; img.src=rd.result; };
  rd.readAsDataURL(f);
}
function chooseReceiptJob(){
  var act=state.jobs.filter(function(j){return j.status!=='paid';}).sort(function(a,b){return b.createdAt-a.createdAt;});
  var list=act.length?act.map(function(j){return '<button class="btn ghost" style="margin-top:8px;text-align:left" onclick="saveReceiptTo(\''+j.id+'\')">📂 '+esc(j.name||'Job')+' · '+esc(clientById(j.clientId).name)+'</button>';}).join(''):'<div class="muted" style="margin-top:8px">No open jobs yet — make one below.</div>';
  openModal('📷 Receipt captured', '<img src="'+pendingReceipt+'" alt="receipt" style="width:100%;border-radius:14px;border:1px solid var(--line)">'+
    '<div class="muted" style="margin-top:10px">Saved on your phone. Pick a job, then enter the prices. <b>Auto price-reading is coming soon.</b></div>'+
    '<label style="margin-top:12px">Save to a job</label>'+list+
    '<button class="btn" style="margin-top:12px" onclick="newJobForReceipt()">＋ New job for this receipt</button>');
}
function saveReceiptTo(id){
  var j=jobById(id); if(!j) return; j.photos=j.photos||[]; j.photos.push(pendingReceipt);
  if(!save()){ j.photos.pop(); return; }
  j.activity.push({ts:Date.now(),text:'Receipt photo added'}); pendingReceipt=null; closeModal(); jobTab='bid'; go('job',id);
}
function newJobForReceipt(){
  var name=prompt('Name this job (e.g. Smith kitchen):'); if(!name||!name.trim()) return;
  var job={id:uid(),clientId:'',name:name.trim(),status:'lead',createdAt:Date.now(),
    bid:blankBid(),changeOrders:[],costs:[],invoice:{issued:false},payments:[],proposal:null,
    photos:[pendingReceipt],activity:[{ts:Date.now(),text:'Created from a receipt scan'}]};
  state.jobs.push(job); if(!save()){ state.jobs.pop(); alert('Not enough storage.'); return; }
  pendingReceipt=null; closeModal(); jobTab='bid'; go('job',job.id);
}

function jobProposal(j){
  var c=bidCalc(j.bid);
  var h='<div class="card"><h2>Client Proposal</h2><div class="muted">A clean summary for the client. Internal markup is hidden — they see the project price.</div>';
  h+='<div style="border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:10px">'+
     '<div style="font-weight:800">'+esc(state.config.businessName)+'</div>'+
     '<div class="muted">Proposal for '+esc(clientById(j.clientId).name)+'</div>'+
     '<div style="margin:10px 0;font-weight:700">'+esc(j.name)+'</div>'+
     '<div class="statline"><span>Labor &amp; installation</span><span class="v">'+money(c.labor+c.helper+c.overhead+c.profit)+'</span></div>'+
     '<div class="statline"><span>Materials</span><span class="v">'+money(c.mat+c.tax)+'</span></div>'+
     (c.other>0?'<div class="statline"><span>Other</span><span class="v">'+money(c.other)+'</span></div>':'')+
     '<div class="statline"><span><b>Project total</b></span><span class="v">'+money(jobInvoiceTotal(j))+'</span></div>'+
     '</div>';
  h+='<button class="btn green" style="margin-top:10px" onclick="sendProposal(\''+j.id+'\')">📤 Send proposal to client</button>';
  h+='<button class="btn ghost" style="margin-top:8px" onclick="printProposal(\''+j.id+'\')">🖨️ Save as PDF</button>';
  if(j.proposal&&j.proposal.signedName) h+='<div class="flag" style="margin-top:10px">✍️ Accepted by '+esc(j.proposal.signedName)+' · '+daysAgo(j.proposal.ts)+'d ago</div>';
  else h+='<label>Client signs to accept (type full name)</label><input id="sig_name"><button class="btn green" style="margin-top:10px" onclick="signProposal(\''+j.id+'\')">✍️ Accept proposal</button>'+
     '<div class="muted" style="margin-top:6px">Note: V1 captures a typed acceptance. Legally-binding e-signature comes in V2.</div>';
  h+='</div>';
  return h;
}
function signProposal(id){ var j=jobById(id); var nm=document.getElementById('sig_name').value.trim(); if(!nm){ alert('Type the name'); return; }
  j.proposal={signedName:nm, ts:Date.now()}; if(j.status==='lead'||j.status==='bid_sent'){ j.status='won'; }
  j.activity.push({ts:Date.now(),text:'Proposal accepted by '+nm}); save(); render(); }

function jobPhotos(j){
  var h='<div class="card"><h2>Photos &amp; Docs</h2><div class="muted">Job pics, receipts, permits. Saved on this device.</div>';
  h+='<input id="ph_file" type="file" accept="image/*" style="margin-top:10px" onchange="addPhoto(\''+j.id+'\')">';
  h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">';
  (j.photos||[]).forEach(function(p,i){ h+='<div style="position:relative"><img src="'+p+'" style="width:90px;height:90px;object-fit:cover;border-radius:10px;border:1px solid var(--line)"><span class="x" style="position:absolute;top:-6px;right:-6px;background:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;box-shadow:0 1px 3px rgba(0,0,0,.3)" onclick="delPhoto(\''+j.id+'\','+i+')">×</span></div>'; });
  h+='</div></div>';
  return h;
}
function addPhoto(id){
  var f=document.getElementById('ph_file').files[0]; if(!f) return;
  var img=new Image(), rd=new FileReader();
  rd.onload=function(){ img.onload=function(){
    var max=900, sc=Math.min(1,max/Math.max(img.width,img.height));
    var cv=document.createElement('canvas'); cv.width=img.width*sc; cv.height=img.height*sc;
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    var j=jobById(id); j.photos=j.photos||[]; j.photos.push(cv.toDataURL('image/jpeg',0.7));
    if(!save()){ j.photos.pop(); } render();
  }; img.src=rd.result; };
  rd.readAsDataURL(f);
}
function delPhoto(id,i){ var j=jobById(id); j.photos.splice(i,1); save(); render(); }

/* ---------- Settings ---------- */
function viewSettings(){
  var c=state.config;
  return '<div class="card"><h2>Business</h2>'+
    '<label>Business name</label><input id="st_name" value="'+esc(c.businessName)+'">'+
    '<label>Your labor rate ($/hr)</label><input id="st_rate" type="number" inputmode="decimal" value="'+esc(c.rate)+'">'+
    '</div>'+
    '<div class="card"><h2>👷 Crew &amp; Labor Rates</h2>'+
    '<div class="muted">Helper, installer, lead — set each rate once, then add them to any bid.</div>'+
    ((c.crewRoles||[]).length?(c.crewRoles).map(function(r,i){return '<div class="statline"><span>'+esc(r.name)+'</span><span class="v">'+money(r.rate)+'/hr <span class="x" style="color:var(--red);cursor:pointer;margin-left:6px" onclick="delCrewRole('+i+')">×</span></span></div>';}).join(''):'<div class="muted" style="margin-top:8px">None yet.</div>')+
    '<label>Role name</label><input id="crn_name" placeholder="e.g. Installer">'+
    '<label>Rate ($/hr)</label><input id="crn_rate" type="number" inputmode="decimal" placeholder="0">'+
    '<button class="btn ghost" style="margin-top:10px" onclick="addCrewRole()">+ Add role</button>'+
    '</div>'+
    '<div class="card"><h2>Overhead &amp; Profit</h2>'+
    '<label>Overhead per month ($)</label><input id="st_ohMonth" type="number" inputmode="decimal" value="'+esc(c.ohMonth)+'">'+
    '<label>Billable hours per month</label><input id="st_billHrs" type="number" inputmode="decimal" value="'+esc(c.billHrs)+'">'+
    '<label>Profit markup (%)</label><input id="st_margin" type="number" inputmode="decimal" value="'+esc(c.margin)+'">'+
    '<label>Tax on materials (%)</label><input id="st_tax" type="number" inputmode="decimal" value="'+esc(c.tax)+'">'+
    '<div class="muted" style="margin-top:8px">Overhead per hour ≈ '+money(n(c.billHrs)>0?n(c.ohMonth)/n(c.billHrs):0)+' (monthly overhead ÷ billable hours).</div>'+
    '</div><button class="btn green" onclick="saveSettings()">💾 Save settings</button>'+
    '<div class="card"><h2>📦 Materials Library</h2>'+
    '<div class="muted">Save materials you use a lot — then add them to any bid in one tap.</div>'+
    (state.materials.length?state.materials.map(function(m){return '<div class="statline"><span>'+esc(m.desc)+'</span><span class="v">'+money(m.price)+'/ea <span class="x" style="color:var(--red);cursor:pointer;margin-left:6px" onclick="delLibMaterial(\''+m.id+'\')">×</span></span></div>';}).join(''):'<div class="muted" style="margin-top:8px">None saved yet.</div>')+
    '<label style="margin-top:10px">Material name</label><input id="lib_desc" placeholder="e.g. 2x4 stud">'+
    '<label>Price each ($)</label><input id="lib_price" type="number" inputmode="decimal" placeholder="0">'+
    '<button class="btn ghost" style="margin-top:10px" onclick="addLibMaterial()">+ Save material</button>'+
    '</div>'+
    '<div class="card"><h2>💾 Backup &amp; Safety</h2>'+
    '<div class="muted">Your data lives only on this phone. Back it up so you never lose a job — save the file to your email or Files app.</div>'+
    backupStatusHTML()+
    '<button class="btn" style="margin-top:10px" onclick="exportBackup()">📤 Back up my data (download file)</button>'+
    '<label style="margin-top:12px">Restore from a backup file</label>'+
    '<input id="bk_file" type="file" accept="application/json,.json" onchange="importBackupFile()">'+
    '<div class="flag" style="margin-top:12px">🔒 Saved only on this device — never uploaded anywhere.</div>'+
    '</div>'+
    '<div class="card"><h2>Demo &amp; Reset</h2>'+
    '<button class="btn ghost" onclick="startFresh()">🧹 Start fresh (clear demo jobs)</button>'+
    '<button class="btn ghost" style="margin-top:10px" onclick="loadDemo()">↺ Load demo jobs</button>'+
    '<button class="btn danger" style="margin-top:10px" onclick="wipe()">Reset everything</button>'+
    '</div>';
}
function saveSettings(){
  if(n(document.getElementById('st_billHrs').value) <= 0){ alert('Billable hours must be greater than 0 — it spreads your monthly overhead across your hours.'); return; }
  var c=state.config;
  c.businessName=document.getElementById('st_name').value.trim()||'My Business';
  ['rate','ohMonth','billHrs','margin','tax'].forEach(function(k){ c[k]=n(document.getElementById('st_'+k).value); });
  save(); alert('Settings saved'); go('dashboard');
}
function wipe(){ if(!confirm('Erase ALL clients, jobs, and settings on this device?')) return; localStorage.removeItem(KEY); state=load(); go('dashboard'); }

/* ---------- modal + empty ---------- */
function openModal(title, body){
  document.getElementById('modalRoot').innerHTML='<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal"><h2>'+esc(title)+'</h2>'+body+'<button class="btn ghost" style="margin-top:10px" onclick="closeModal()">Close</button></div></div>';
}
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }
function empty(ic,title,sub,action,label){
  return '<div class="empty"><span class="ic">'+ic+'</span><div style="font-weight:700">'+esc(title)+'</div><div class="muted">'+esc(sub)+'</div>'+(action?'<button class="btn green" style="margin-top:14px;width:auto;padding:11px 18px" onclick="'+action+'">'+esc(label)+'</button>':'')+'</div>';
}
function hdrAction(){}

/* ---------- add to home screen tip ---------- */
function isStandalone(){ return (window.navigator.standalone===true) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
function maybeShowA2HS(){
  try{
    if(isStandalone()) return;
    if(localStorage.getItem('moneycore.a2hs')) return;
    var bar=document.createElement('div'); bar.className='a2hs';
    bar.innerHTML='📲 <b>Tip:</b> tap Share → <b>Add to Home Screen</b> so your jobs stay saved &amp; it opens like an app. <span class="x" onclick="dismissA2HS()">×</span>';
    document.body.appendChild(bar);
  }catch(e){}
}
function dismissA2HS(){ try{localStorage.setItem('moneycore.a2hs','1');}catch(e){} var b=document.querySelector('.a2hs'); if(b) b.remove(); }

/* ---------- boot ---------- */
go('dashboard');
maybeShowA2HS();
