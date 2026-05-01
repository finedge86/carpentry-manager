// Al-Najjar Carpentry Manager — App Logic
'use strict';

const TODAY = new Date().toISOString().split('T')[0];
const THIS_MONTH = TODAY.slice(0,7);

let DB = {clients:[],projects:[],invoices:[],expenses:[],employees:[],rentPayments:[],salaryPayments:[],sharedExpenses:[],cashTransactions:[]};
try {
  const s = localStorage.getItem('carpv3');
  if (s) {
    const o = JSON.parse(s);
    Object.assign(DB, o);
    ['employees','rentPayments','salaryPayments','sharedExpenses','cashTransactions'].forEach(k => { if (!DB[k]) DB[k] = []; });
  }
} catch(e) {}

let editId = {project:null,invoice:null,expense:null,client:null,rent:null,employee:null,salary:null,shared:null,cash:null};
let selectedClientId = null;
let currentMonth = THIS_MONTH;
let cashTypeEdit = 'in';
let cashFilter = 'all';

// ── HELPERS ──────────────────────────────────────────────────────────────────
function persist() { try { localStorage.setItem('carpv3', JSON.stringify(DB)); } catch(e) {} }
const kwd = n => 'KWD ' + (+n||0).toFixed(3);
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtMonth = m => { if(!m) return '—'; const [y,mo] = m.split('-'); return new Date(+y,+mo-1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,5);
const clientName = id => (DB.clients.find(x=>x.id===id)||{}).name||'—';
const projectName = id => (DB.projects.find(x=>x.id===id)||{}).name||'—';
const empName = id => (DB.employees.find(x=>x.id===id)||{}).name||'—';
const initials = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const SB = {Paid:'badge-paid',Pending:'badge-pending',Overdue:'badge-overdue',Open:'badge-open',Done:'badge-done',Cancelled:'badge-cancelled','In progress':'badge-pending'};
const bdg = s => `<span class="badge ${SB[s]||''}">${s}</span>`;
const CC = {'Materials':'#1D9E75','Tools':'#378ADD','Labor':'#D85A30','Rent':'#534AB7','Salary':'#185FA5','Shared':'#0F6E56','Transport':'#888780','Utilities':'#BA7517','Other':'#D4537E','Sales':'#1D9E75','Advance':'#22C585'};

// ── CONFIRM ───────────────────────────────────────────────────────────────────
let _cb = null;
document.getElementById('confirm-ok-btn').addEventListener('click', () => { document.getElementById('confirm-box').classList.remove('open'); if(_cb) _cb(); _cb=null; });
document.getElementById('confirm-cancel-btn').addEventListener('click', () => { document.getElementById('confirm-box').classList.remove('open'); _cb=null; });
function askConfirm(cb) { _cb=cb; document.getElementById('confirm-box').classList.add('open'); }

// ── TOTALS ────────────────────────────────────────────────────────────────────
function totalExpenses(m) {
  const fdD = arr => m&&m!=='all' ? arr.filter(x=>(x.date||'').startsWith(m)) : arr;
  const fdM = arr => m&&m!=='all' ? arr.filter(x=>(x.month||'').startsWith(m)) : arr;
  const exp = fdD(DB.expenses).reduce((s,e)=>s+e.amount,0);
  const rent = fdM(DB.rentPayments).reduce((s,r)=>s+r.amount,0);
  const sal = fdM(DB.salaryPayments).reduce((s,s2)=>s+s2.amount,0);
  const shared = fdD(DB.sharedExpenses).reduce((s,e)=>s+e.amount,0);
  return {exp,rent,sal,shared,total:exp+rent+sal+shared};
}
function cashBalance() {
  const inTotal = DB.cashTransactions.filter(t=>t.type==='in').reduce((s,t)=>s+t.amount,0);
  const outTotal = DB.cashTransactions.filter(t=>t.type==='out').reduce((s,t)=>s+t.amount,0);
  return {inTotal,outTotal,balance:inTotal-outTotal};
}
function projectPaid(pid) { return DB.invoices.filter(i=>i.projectId===pid&&i.status==='Paid').reduce((s,i)=>s+i.amount,0); }
function projectRemaining(p) { return Math.max(0,(p.value||0)-projectPaid(p.id)); }
function projectPayPct(p) { const v=p.value||0; if(!v) return 0; return Math.min(100,Math.round(projectPaid(p.id)/v*100)); }
function projectPayBadge(p) { const paid=projectPaid(p.id),v=p.value||0; if(!v) return bdg('No value'); if(paid>=v) return '<span class="badge badge-fullypaid">Fully paid</span>'; if(paid>0) return '<span class="badge badge-partial">Partial</span>'; return '<span class="badge badge-unpaid">Unpaid</span>'; }
function totalProjectPending() { return DB.projects.filter(p=>p.status!=='Cancelled').reduce((s,p)=>s+projectRemaining(p),0); }

// ── NAV ───────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
    const p = el.dataset.page;
    document.querySelectorAll('.page').forEach(pg=>pg.classList.remove('active'));
    document.getElementById('page-'+p).classList.add('active');
    ({dashboard:renderDash,cash:renderCash,monthly:renderMonthly,overhead:renderOverhead,shared:renderShared,expenses:renderExpenses,'clients-report':renderClientReport,projects:renderProjects,invoices:renderInvoices,clients:renderClients})[p]?.();
  });
});

document.querySelectorAll('.oh-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.oh-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.oh-section').forEach(s=>s.classList.remove('active'));
    document.getElementById('oh-'+btn.dataset.ohtab).classList.add('active');
  });
});

document.getElementById('btn-prev-month').addEventListener('click', () => { const [y,m]=currentMonth.split('-').map(Number); const d=new Date(y,m-2,1); currentMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderMonthly(); });
document.getElementById('btn-next-month').addEventListener('click', () => { const [y,m]=currentMonth.split('-').map(Number); const d=new Date(y,m,1); currentMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderMonthly(); });

document.querySelectorAll('.cash-filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cash-filter-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    cashFilter = btn.dataset.cashfilter;
    renderCashTable();
  });
});

// ── MODAL HELPERS ─────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById('modal-'+id).classList.add('open'); }
function closeModal(id) { document.getElementById('modal-'+id).classList.remove('open'); }
[['rent-cancel-btn','rent'],['emp-cancel-btn','employee'],['sal-cancel-btn','salary'],['shared-cancel-btn','shared'],['proj-cancel-btn','project'],['inv-cancel-btn','invoice'],['exp-cancel-btn','expense'],['cli-cancel-btn','client'],['cash-cancel-btn','cash']].forEach(([btn,modal]) => {
  document.getElementById(btn).addEventListener('click', () => closeModal(modal));
});

// ── CASH ──────────────────────────────────────────────────────────────────────
function setCashType(type) {
  cashTypeEdit = type;
  const inBtn = document.getElementById('cash-type-in-btn');
  const outBtn = document.getElementById('cash-type-out-btn');
  if (type === 'in') {
    inBtn.className = 'btn btn-in'; inBtn.style.flex='1';
    outBtn.className = 'btn'; outBtn.style.flex='1';
    document.getElementById('cash-modal-title').textContent = 'Cash In';
    document.getElementById('ca-cat').innerHTML = `<option value="Sales">Sales / Collection</option><option value="Advance">Advance payment</option><option value="Refund">Refund received</option><option value="Other">Other</option>`;
  } else {
    outBtn.className = 'btn btn-out'; outBtn.style.flex='1';
    inBtn.className = 'btn'; inBtn.style.flex='1';
    document.getElementById('cash-modal-title').textContent = 'Cash Out';
    document.getElementById('ca-cat').innerHTML = `<option value="Materials">Materials purchase</option><option value="Tools">Tools purchase</option><option value="Labor">Labor payment</option><option value="Utilities">Utilities</option><option value="Transport">Transport</option><option value="Rent">Rent</option><option value="Salary">Salary</option><option value="Other">Other</option>`;
  }
}
document.getElementById('cash-type-in-btn').addEventListener('click', () => setCashType('in'));
document.getElementById('cash-type-out-btn').addEventListener('click', () => setCashType('out'));
document.getElementById('btn-cash-in').addEventListener('click', () => { editId.cash=null; ['ca-desc','ca-amount','ca-ref','ca-notes'].forEach(id=>document.getElementById(id).value=''); document.getElementById('ca-date').value=TODAY; setCashType('in'); openModal('cash'); });
document.getElementById('btn-cash-out').addEventListener('click', () => { editId.cash=null; ['ca-desc','ca-amount','ca-ref','ca-notes'].forEach(id=>document.getElementById(id).value=''); document.getElementById('ca-date').value=TODAY; setCashType('out'); openModal('cash'); });
document.getElementById('cash-save-btn').addEventListener('click', () => {
  const amt=parseFloat(document.getElementById('ca-amount').value)||0;
  const desc=document.getElementById('ca-desc').value.trim();
  if(!amt||!desc) return;
  const obj={type:cashTypeEdit,desc,amount:amt,date:document.getElementById('ca-date').value,cat:document.getElementById('ca-cat').value,ref:document.getElementById('ca-ref').value,notes:document.getElementById('ca-notes').value};
  if(editId.cash) Object.assign(DB.cashTransactions.find(x=>x.id===editId.cash),obj);
  else DB.cashTransactions.push({id:uid(),...obj});
  persist(); closeModal('cash'); renderCash(); renderDash();
});

function editCash(id) {
  editId.cash=id; const t=DB.cashTransactions.find(x=>x.id===id);
  setCashType(t.type);
  document.getElementById('ca-desc').value=t.desc;
  document.getElementById('ca-amount').value=t.amount;
  document.getElementById('ca-date').value=t.date||'';
  document.getElementById('ca-cat').value=t.cat||'Other';
  document.getElementById('ca-ref').value=t.ref||'';
  document.getElementById('ca-notes').value=t.notes||'';
  openModal('cash');
}

function renderCash() {
  const {inTotal,outTotal,balance} = cashBalance();
  document.getElementById('cash-balance-display').textContent = kwd(balance);
  document.getElementById('cash-balance-display').style.color = balance>=0?'#fff':'#fca5a5';
  document.getElementById('cash-balance-sub').textContent = DB.cashTransactions.length+' transactions';
  document.getElementById('cash-total-in').textContent = kwd(inTotal);
  document.getElementById('cash-total-out').textContent = kwd(outTotal);
  const mIn = DB.cashTransactions.filter(t=>t.type==='in'&&(t.date||'').startsWith(THIS_MONTH)).reduce((s,t)=>s+t.amount,0);
  const mOut = DB.cashTransactions.filter(t=>t.type==='out'&&(t.date||'').startsWith(THIS_MONTH)).reduce((s,t)=>s+t.amount,0);
  const mNet = mIn-mOut;
  document.getElementById('cash-month-net').textContent = kwd(mNet);
  document.getElementById('cash-month-net').className = 'metric-value '+(mNet>=0?'mv-green':'mv-red');
  document.getElementById('cash-month-label').textContent = fmtMonth(THIS_MONTH);
  renderCashTable();
}

function renderCashTable() {
  const tb = document.getElementById('cash-tbody');
  let txns = [...DB.cashTransactions].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(cashFilter==='in') txns=txns.filter(t=>t.type==='in');
  if(cashFilter==='out') txns=txns.filter(t=>t.type==='out');
  if(!txns.length) { tb.innerHTML='<tr><td colspan="7"><div class="empty-state">No cash transactions yet.<br>Use "+ Cash In" and "− Cash Out" to track every cash movement.</div></td></tr>'; return; }
  tb.innerHTML = txns.map(t=>`<tr class="cash-row-${t.type}">
    <td><strong>${t.desc}</strong>${t.notes?`<br><small style="color:var(--color-text-tertiary)">${t.notes}</small>`:''}</td>
    <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CC[t.cat]||'#888'};margin-right:5px"></span>${t.cat}</td>
    <td><span class="badge badge-${t.type==='in'?'in':'out'}">${t.type==='in'?'▲ Cash In':'▼ Cash Out'}</span></td>
    <td style="font-weight:500;color:${t.type==='in'?'#1D9E75':'#D85A30'}">${t.type==='in'?'+':'−'} ${kwd(t.amount)}</td>
    <td>${fmtDate(t.date)}</td>
    <td style="color:var(--color-text-secondary);font-size:12px">${t.ref||'—'}</td>
    <td><div class="row-actions"><button class="btn-edit" onclick="editCash('${t.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delCash('${t.id}')">Delete</button></div></td>
  </tr>`).join('');
}
window.delCash = id => askConfirm(() => { DB.cashTransactions=DB.cashTransactions.filter(x=>x.id!==id); persist(); renderCash(); renderDash(); });
window.editCash = editCash;

// ── RENT ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-add-rent').addEventListener('click', () => { editId.rent=null; document.getElementById('rent-modal-title').textContent='Add rent payment'; ['r-desc','r-amount'].forEach(id=>document.getElementById(id).value=''); document.getElementById('r-month').value=THIS_MONTH; document.getElementById('r-date').value=TODAY; openModal('rent'); });
document.getElementById('rent-save-btn').addEventListener('click', () => { const amt=parseFloat(document.getElementById('r-amount').value)||0; if(!amt) return; const obj={desc:document.getElementById('r-desc').value,amount:amt,month:document.getElementById('r-month').value,date:document.getElementById('r-date').value}; if(editId.rent) Object.assign(DB.rentPayments.find(x=>x.id===editId.rent),obj); else DB.rentPayments.push({id:uid(),...obj}); persist(); closeModal('rent'); renderRent(); renderDash(); });

// ── EMPLOYEE ──────────────────────────────────────────────────────────────────
document.getElementById('btn-add-employee').addEventListener('click', () => { editId.employee=null; document.getElementById('emp-modal-title').textContent='Add employee'; ['em-name','em-role','em-salary','em-phone','em-notes'].forEach(id=>document.getElementById(id).value=''); openModal('employee'); });
document.getElementById('emp-save-btn').addEventListener('click', () => { const name=document.getElementById('em-name').value.trim(); if(!name) return; const obj={name,role:document.getElementById('em-role').value,salary:parseFloat(document.getElementById('em-salary').value)||0,phone:document.getElementById('em-phone').value,notes:document.getElementById('em-notes').value}; if(editId.employee) Object.assign(DB.employees.find(x=>x.id===editId.employee),obj); else DB.employees.push({id:uid(),...obj}); persist(); closeModal('employee'); renderEmployees(); });

// ── SALARY ────────────────────────────────────────────────────────────────────
document.getElementById('btn-add-salary').addEventListener('click', () => { editId.salary=null; document.getElementById('sal-modal-title').textContent='Record salary payment'; document.getElementById('s-emp').innerHTML=DB.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')||'<option>Add employee first</option>'; document.getElementById('s-amount').value=''; document.getElementById('s-month').value=THIS_MONTH; document.getElementById('s-date').value=TODAY; document.getElementById('s-notes').value=''; openModal('salary'); });
document.getElementById('sal-save-btn').addEventListener('click', () => { const amt=parseFloat(document.getElementById('s-amount').value)||0; if(!amt) return; const obj={empId:document.getElementById('s-emp').value,amount:amt,month:document.getElementById('s-month').value,date:document.getElementById('s-date').value,notes:document.getElementById('s-notes').value}; if(editId.salary) Object.assign(DB.salaryPayments.find(x=>x.id===editId.salary),obj); else DB.salaryPayments.push({id:uid(),...obj}); persist(); closeModal('salary'); renderSalaries(); renderEmployees(); renderDash(); });

// ── SHARED ────────────────────────────────────────────────────────────────────
function buildSplitRows(splits) {
  const c = document.getElementById('split-rows'); c.innerHTML = '';
  (splits||[]).forEach(sp => addSplitRow(sp.projectId, sp.amount));
  updateSplitHint();
}
function addSplitRow(projId, amt) {
  const c = document.getElementById('split-rows');
  const row = document.createElement('div'); row.className = 'split-row';
  row.innerHTML = `<select class="sp-proj"><option value="">— project —</option>${DB.projects.map(p=>`<option value="${p.id}"${p.id===projId?' selected':''}>${p.name}</option>`).join('')}</select><input class="sp-amt" type="number" min="0" step="0.001" placeholder="KWD" value="${amt||''}"><button class="sp-del">×</button>`;
  row.querySelector('.sp-del').addEventListener('click', () => { row.remove(); updateSplitHint(); });
  row.querySelector('.sp-amt').addEventListener('input', updateSplitHint);
  c.appendChild(row);
}
function updateSplitHint() {
  const total = parseFloat(document.getElementById('sh-amount').value)||0;
  const st = [...document.querySelectorAll('.sp-amt')].reduce((s,el)=>s+(parseFloat(el.value)||0),0);
  const h = document.getElementById('split-total-hint');
  if(total>0) h.textContent=`Split: KWD ${st.toFixed(3)} / ${kwd(total)} — Unassigned: KWD ${Math.max(0,total-st).toFixed(3)}`;
  else h.textContent='';
}
document.getElementById('sh-amount').addEventListener('input', updateSplitHint);
document.getElementById('add-split-btn').addEventListener('click', () => addSplitRow('',0));
document.getElementById('btn-add-shared').addEventListener('click', () => { editId.shared=null; document.getElementById('shared-modal-title').textContent='Add shared expense'; ['sh-desc','sh-amount','sh-notes'].forEach(id=>document.getElementById(id).value=''); document.getElementById('sh-date').value=TODAY; document.getElementById('sh-cat').value='Materials'; buildSplitRows([]); openModal('shared'); });
document.getElementById('shared-save-btn').addEventListener('click', () => { const desc=document.getElementById('sh-desc').value.trim(); const amt=parseFloat(document.getElementById('sh-amount').value)||0; if(!desc||!amt) return; const splits=[...document.querySelectorAll('.split-row')].map(r=>({projectId:r.querySelector('.sp-proj').value,amount:parseFloat(r.querySelector('.sp-amt').value)||0})).filter(s=>s.projectId&&s.amount>0); const obj={desc,amount:amt,date:document.getElementById('sh-date').value,cat:document.getElementById('sh-cat').value,splits,notes:document.getElementById('sh-notes').value}; if(editId.shared) Object.assign(DB.sharedExpenses.find(x=>x.id===editId.shared),obj); else DB.sharedExpenses.push({id:uid(),...obj}); persist(); closeModal('shared'); renderShared(); renderDash(); });

// ── PROJECT ───────────────────────────────────────────────────────────────────
document.getElementById('btn-add-project').addEventListener('click', () => { editId.project=null; document.getElementById('mpt').textContent='New project'; document.getElementById('p-client').innerHTML=DB.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')||'<option>Add client first</option>'; ['p-name','p-value','p-due','p-notes'].forEach(id=>document.getElementById(id).value=''); document.getElementById('p-start').value=TODAY; document.getElementById('p-status').value='Open'; openModal('project'); });
document.getElementById('proj-save-btn').addEventListener('click', () => { const name=document.getElementById('p-name').value.trim(); if(!name) return; const obj={name,clientId:document.getElementById('p-client').value,value:parseFloat(document.getElementById('p-value').value)||0,start:document.getElementById('p-start').value,due:document.getElementById('p-due').value,status:document.getElementById('p-status').value,notes:document.getElementById('p-notes').value}; if(editId.project) Object.assign(DB.projects.find(x=>x.id===editId.project),obj); else DB.projects.push({id:uid(),...obj}); persist(); closeModal('project'); renderProjects(); });

// ── INVOICE ───────────────────────────────────────────────────────────────────
document.getElementById('btn-add-invoice').addEventListener('click', () => { editId.invoice=null; document.getElementById('mit').textContent='New invoice'; document.getElementById('i-client').innerHTML=DB.clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')||'<option>Add client first</option>'; document.getElementById('i-project').innerHTML='<option value="">— none —</option>'+DB.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join(''); ['i-amount','i-notes'].forEach(id=>document.getElementById(id).value=''); document.getElementById('i-date').value=TODAY; document.getElementById('i-status').value='Pending'; openModal('invoice'); });
document.getElementById('inv-save-btn').addEventListener('click', () => { const amt=parseFloat(document.getElementById('i-amount').value)||0; if(!amt) return; const obj={clientId:document.getElementById('i-client').value,projectId:document.getElementById('i-project').value,amount:amt,date:document.getElementById('i-date').value,status:document.getElementById('i-status').value,notes:document.getElementById('i-notes').value}; if(editId.invoice) Object.assign(DB.invoices.find(x=>x.id===editId.invoice),obj); else DB.invoices.push({id:uid(),...obj}); persist(); closeModal('invoice'); renderInvoices(); renderDash(); });

// ── EXPENSE ───────────────────────────────────────────────────────────────────
document.getElementById('btn-add-expense').addEventListener('click', () => { editId.expense=null; document.getElementById('met').textContent='Add expense'; document.getElementById('e-project').innerHTML='<option value="">— none —</option>'+DB.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join(''); ['e-desc','e-amount'].forEach(id=>document.getElementById(id).value=''); document.getElementById('e-date').value=TODAY; document.getElementById('e-cat').value='Materials'; openModal('expense'); });
document.getElementById('exp-save-btn').addEventListener('click', () => { const amt=parseFloat(document.getElementById('e-amount').value)||0; const desc=document.getElementById('e-desc').value.trim(); if(!amt||!desc) return; const obj={desc,amount:amt,date:document.getElementById('e-date').value,cat:document.getElementById('e-cat').value,projectId:document.getElementById('e-project').value}; if(editId.expense) Object.assign(DB.expenses.find(x=>x.id===editId.expense),obj); else DB.expenses.push({id:uid(),...obj}); persist(); closeModal('expense'); renderExpenses(); renderDash(); });

// ── CLIENT ────────────────────────────────────────────────────────────────────
document.getElementById('btn-add-client').addEventListener('click', () => { editId.client=null; document.getElementById('mct').textContent='Add client'; ['c-name','c-phone','c-area','c-notes'].forEach(id=>document.getElementById(id).value=''); openModal('client'); });
document.getElementById('cli-save-btn').addEventListener('click', () => { const name=document.getElementById('c-name').value.trim(); if(!name) return; const obj={name,phone:document.getElementById('c-phone').value,area:document.getElementById('c-area').value,notes:document.getElementById('c-notes').value}; if(editId.client) Object.assign(DB.clients.find(x=>x.id===editId.client),obj); else DB.clients.push({id:uid(),...obj}); persist(); closeModal('client'); renderClients(); });

// ── DELETERS ──────────────────────────────────────────────────────────────────
window.delInvoice = id => askConfirm(() => { DB.invoices=DB.invoices.filter(x=>x.id!==id); persist(); renderInvoices(); renderDash(); });
window.delExpense = id => askConfirm(() => { DB.expenses=DB.expenses.filter(x=>x.id!==id); persist(); renderExpenses(); renderDash(); });
window.delProject = id => askConfirm(() => { DB.projects=DB.projects.filter(x=>x.id!==id); persist(); renderProjects(); });
window.delClient  = id => askConfirm(() => { DB.clients=DB.clients.filter(x=>x.id!==id); persist(); renderClients(); });
window.delRent    = id => askConfirm(() => { DB.rentPayments=DB.rentPayments.filter(x=>x.id!==id); persist(); renderRent(); renderDash(); });
window.delSalary  = id => askConfirm(() => { DB.salaryPayments=DB.salaryPayments.filter(x=>x.id!==id); persist(); renderSalaries(); renderEmployees(); renderDash(); });
window.delShared  = id => askConfirm(() => { DB.sharedExpenses=DB.sharedExpenses.filter(x=>x.id!==id); persist(); renderShared(); renderDash(); });
window.delEmployee= id => askConfirm(() => { DB.employees=DB.employees.filter(x=>x.id!==id); DB.salaryPayments=DB.salaryPayments.filter(x=>x.empId!==id); persist(); renderEmployees(); renderSalaries(); });

// ── EDIT OPENERS ──────────────────────────────────────────────────────────────
window.editRent = id => { editId.rent=id; const r=DB.rentPayments.find(x=>x.id===id); document.getElementById('rent-modal-title').textContent='Edit rent payment'; document.getElementById('r-desc').value=r.desc||''; document.getElementById('r-amount').value=r.amount; document.getElementById('r-month').value=r.month||''; document.getElementById('r-date').value=r.date||''; openModal('rent'); };
window.editEmployee = id => { editId.employee=id; const e=DB.employees.find(x=>x.id===id); document.getElementById('emp-modal-title').textContent='Edit employee'; document.getElementById('em-name').value=e.name; document.getElementById('em-role').value=e.role||''; document.getElementById('em-salary').value=e.salary||''; document.getElementById('em-phone').value=e.phone||''; document.getElementById('em-notes').value=e.notes||''; openModal('employee'); };
window.editSalary = id => { editId.salary=id; const s=DB.salaryPayments.find(x=>x.id===id); document.getElementById('sal-modal-title').textContent='Edit salary'; document.getElementById('s-emp').innerHTML=DB.employees.map(e=>`<option value="${e.id}"${e.id===s.empId?' selected':''}>${e.name}</option>`).join(''); document.getElementById('s-amount').value=s.amount; document.getElementById('s-month').value=s.month||''; document.getElementById('s-date').value=s.date||''; document.getElementById('s-notes').value=s.notes||''; openModal('salary'); };
window.editShared = id => { editId.shared=id; const sh=DB.sharedExpenses.find(x=>x.id===id); document.getElementById('shared-modal-title').textContent='Edit shared expense'; document.getElementById('sh-desc').value=sh.desc; document.getElementById('sh-amount').value=sh.amount; document.getElementById('sh-date').value=sh.date||''; document.getElementById('sh-cat').value=sh.cat||'Materials'; document.getElementById('sh-notes').value=sh.notes||''; buildSplitRows(sh.splits||[]); openModal('shared'); };
window.editProject = id => { editId.project=id; const r=DB.projects.find(x=>x.id===id); document.getElementById('mpt').textContent='Edit project'; document.getElementById('p-client').innerHTML=DB.clients.map(c=>`<option value="${c.id}"${c.id===r.clientId?' selected':''}>${c.name}</option>`).join(''); document.getElementById('p-name').value=r.name; document.getElementById('p-value').value=r.value; document.getElementById('p-start').value=r.start||''; document.getElementById('p-due').value=r.due||''; document.getElementById('p-status').value=r.status; document.getElementById('p-notes').value=r.notes||''; openModal('project'); };
window.editInvoice = id => { editId.invoice=id; const r=DB.invoices.find(x=>x.id===id); document.getElementById('mit').textContent='Edit invoice'; document.getElementById('i-client').innerHTML=DB.clients.map(c=>`<option value="${c.id}"${c.id===r.clientId?' selected':''}>${c.name}</option>`).join(''); document.getElementById('i-project').innerHTML='<option value="">— none —</option>'+DB.projects.map(p=>`<option value="${p.id}"${p.id===r.projectId?' selected':''}>${p.name}</option>`).join(''); document.getElementById('i-amount').value=r.amount; document.getElementById('i-date').value=r.date||''; document.getElementById('i-status').value=r.status; document.getElementById('i-notes').value=r.notes||''; openModal('invoice'); };
window.editExpense = id => { editId.expense=id; const r=DB.expenses.find(x=>x.id===id); document.getElementById('met').textContent='Edit expense'; document.getElementById('e-project').innerHTML='<option value="">— none —</option>'+DB.projects.map(p=>`<option value="${p.id}"${p.id===r.projectId?' selected':''}>${p.name}</option>`).join(''); document.getElementById('e-desc').value=r.desc; document.getElementById('e-amount').value=r.amount; document.getElementById('e-date').value=r.date||''; document.getElementById('e-cat').value=r.cat; document.getElementById('e-project').value=r.projectId||''; openModal('expense'); };
window.editClient = id => { editId.client=id; const r=DB.clients.find(x=>x.id===id); document.getElementById('mct').textContent='Edit client'; document.getElementById('c-name').value=r.name; document.getElementById('c-phone').value=r.phone||''; document.getElementById('c-area').value=r.area||''; document.getElementById('c-notes').value=r.notes||''; openModal('client'); };
window.quickSalary = empId => { const emp=DB.employees.find(x=>x.id===empId); editId.salary=null; document.getElementById('sal-modal-title').textContent='Pay salary'; document.getElementById('s-emp').innerHTML=DB.employees.map(e=>`<option value="${e.id}"${e.id===empId?' selected':''}>${e.name}</option>`).join(''); document.getElementById('s-amount').value=emp?emp.salary||'':''; document.getElementById('s-month').value=THIS_MONTH; document.getElementById('s-date').value=TODAY; document.getElementById('s-notes').value=''; openModal('salary'); };
window.togglePaid = id => { const inv=DB.invoices.find(i=>i.id===id); if(inv){ inv.status=inv.status==='Paid'?'Pending':'Paid'; persist(); renderInvoices(); renderDash(); } };

// ── CHART ──────────────────────────────────────────────────────────────────────
function get6Months(end) {
  const [y,m] = end.split('-').map(Number); const r = [];
  for(let i=5;i>=0;i--){ const d=new Date(y,m-1-i,1); r.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); }
  return r;
}
function buildChart(elId,months,inc,exp,prf,showP) {
  const el=document.getElementById(elId);
  if(!months.length){ el.innerHTML='<div style="color:var(--color-text-tertiary);font-size:13px;padding:1rem 0">No data yet</div>'; return; }
  const mx=Math.max(...inc,...exp,...(showP?prf.map(Math.abs):[]),1); const H=130;
  el.innerHTML=months.map((mo,i)=>{ const ih=Math.round(inc[i]/mx*H),eh=Math.round(exp[i]/mx*H),ph=showP?Math.round(Math.abs(prf[i])/mx*H):0; const pc=showP?(prf[i]>=0?'#378ADD':'#D85A30'):''; const lbl=new Date(mo+'-01').toLocaleDateString('en-GB',{month:'short'}); return `<div class="bar-group"><div class="bar-col" style="height:${ih}px;background:#1D9E75;opacity:0.85"></div><div class="bar-col" style="height:${eh}px;background:#D85A30;opacity:0.85"></div>${showP?`<div class="bar-col" style="height:${ph}px;background:${pc};opacity:0.7"></div>`:''}<div class="bar-label">${lbl}</div></div>`; }).join('');
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────────
function renderDash() {
  const aM=[...new Set([...DB.invoices,...DB.expenses,...DB.sharedExpenses].map(x=>x.date&&x.date.slice(0,7)).filter(Boolean))].sort().reverse();
  const sel=document.getElementById('dash-filter'); const cv=sel.value;
  sel.innerHTML='<option value="all">All time</option>'+aM.map(mo=>`<option value="${mo}">${fmtMonth(mo)}</option>`).join('');
  if(aM.includes(cv)) sel.value=cv;
  const m=sel.value;
  const fdD=arr=>m&&m!=='all'?arr.filter(x=>(x.date||'').startsWith(m)):arr;
  const income=fdD(DB.invoices).filter(i=>i.status==='Paid').reduce((s,i)=>s+i.amount,0);
  const {exp,rent,sal,shared,total}=totalExpenses(m);
  const profit=income-total,margin=income>0?Math.round(profit/income*100):0;
  const {balance,inTotal,outTotal}=cashBalance();
  document.getElementById('dm-income').textContent=kwd(income);
  document.getElementById('dm-expense').textContent=kwd(total);
  document.getElementById('dm-pending').textContent=kwd(totalProjectPending());
  document.getElementById('dm-pending-hint').textContent=DB.projects.filter(p=>p.status!=='Cancelled'&&projectRemaining(p)>0).length+' project(s) with balance';
  const pe=document.getElementById('dm-profit'); pe.textContent=kwd(profit); pe.className='metric-value '+(profit>=0?'mv-green':'mv-red');
  document.getElementById('dm-margin').textContent='Margin '+margin+'%';
  document.getElementById('dm-cash-balance').textContent=kwd(balance);
  document.getElementById('dm-cash-balance').className='metric-value '+(balance>=0?'mv-cash':'mv-red');
  document.getElementById('dm-cash-hint').textContent=inTotal>0?`In: ${kwd(inTotal)} / Out: ${kwd(outTotal)}`:'No cash transactions';
  document.getElementById('dm-rent').textContent=kwd(DB.rentPayments.filter(r=>r.month===THIS_MONTH).reduce((s,r)=>s+r.amount,0));
  document.getElementById('dm-salary').textContent=kwd(DB.salaryPayments.filter(s=>s.month===THIS_MONTH).reduce((s,s2)=>s+s2.amount,0));
  document.getElementById('dm-emp-count').textContent=DB.employees.length+' employee(s)';
  document.getElementById('dm-shared').textContent=kwd(DB.sharedExpenses.filter(e=>(e.date||'').startsWith(THIS_MONTH)).reduce((s,e)=>s+e.amount,0));
  document.getElementById('profit-bar').style.cssText=`width:${Math.max(0,Math.min(100,margin))}%;background:${profit>=0?'#1D9E75':'#D85A30'}`;
  document.getElementById('profit-bar-label').textContent=margin+'% of income is profit';
  const cats={};
  fdD(DB.expenses).forEach(e=>{cats[e.cat]=(cats[e.cat]||0)+e.amount;});
  if(rent>0) cats['Rent']=(cats['Rent']||0)+rent;
  if(sal>0) cats['Salary']=(cats['Salary']||0)+sal;
  if(shared>0) cats['Shared']=(cats['Shared']||0)+shared;
  const mc=Math.max(...Object.values(cats),1);
  document.getElementById('dash-cats').innerHTML=!Object.keys(cats).length?'<div style="color:var(--color-text-tertiary);font-size:13px">No expenses yet</div>':Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="cat-row"><div class="cat-label">${c}</div><div class="cat-track"><div class="cat-fill" style="width:${Math.round(v/mc*100)}%;background:${CC[c]||'#888'}"></div></div><div class="cat-val">${kwd(v)}</div></div>`).join('');
  const em=m==='all'?THIS_MONTH:m; const m6=get6Months(em);
  buildChart('dash-chart',m6,m6.map(mo=>DB.invoices.filter(i=>(i.date||'').startsWith(mo)&&i.status==='Paid').reduce((s,i)=>s+i.amount,0)),m6.map(mo=>totalExpenses(mo).total),[],false);
  const act=[
    ...DB.invoices.map(i=>({date:i.date,text:`Invoice — ${clientName(i.clientId)}`,amt:'+'+kwd(i.amount),col:'#1D9E75',st:i.status})),
    ...DB.cashTransactions.filter(t=>t.type==='in').map(t=>({date:t.date,text:`💵 Cash in — ${t.desc}`,amt:'+'+kwd(t.amount),col:'#22C585'})),
    ...DB.cashTransactions.filter(t=>t.type==='out').map(t=>({date:t.date,text:`💸 Cash out — ${t.desc}`,amt:'-'+kwd(t.amount),col:'#D85A30'})),
    ...DB.expenses.map(e=>({date:e.date,text:`${e.cat} — ${e.desc}`,amt:'-'+kwd(e.amount),col:'#D85A30'})),
    ...DB.sharedExpenses.map(e=>({date:e.date,text:`Shared — ${e.desc}`,amt:'-'+kwd(e.amount),col:'#0F6E56'})),
    ...DB.rentPayments.map(r=>({date:r.date,text:`Rent — ${r.desc||r.month}`,amt:'-'+kwd(r.amount),col:'#534AB7'})),
    ...DB.salaryPayments.map(s=>({date:s.date,text:`Salary — ${empName(s.empId)}`,amt:'-'+kwd(s.amount),col:'#185FA5'}))
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,8);
  document.getElementById('dash-activity').innerHTML=!act.length?'<div style="color:var(--color-text-tertiary);font-size:13px">No activity yet</div>':act.map(a=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:0.5px solid var(--color-border-tertiary);font-size:13px"><div><div>${a.text}${a.st?` <span class="badge ${SB[a.st]||''}" style="font-size:10px">${a.st}</span>`:''}</div><div style="font-size:11px;color:var(--color-text-tertiary)">${fmtDate(a.date)}</div></div><div style="font-weight:500;color:${a.col}">${a.amt}</div></div>`).join('');
  sel.onchange=renderDash;
}

// ── MONTHLY ───────────────────────────────────────────────────────────────────
function renderMonthly() {
  const m=currentMonth; document.getElementById('month-display').textContent=fmtMonth(m);
  const [y,mo]=m.split('-').map(Number); const pd=new Date(y,mo-2,1); const prev=pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0');
  function md(mo2){ const invs=DB.invoices.filter(i=>(i.date||'').startsWith(mo2)); const income=invs.filter(i=>i.status==='Paid').reduce((s,i)=>s+i.amount,0); const{exp,rent,sal,shared,total}=totalExpenses(mo2); const cashIn=DB.cashTransactions.filter(t=>t.type==='in'&&(t.date||'').startsWith(mo2)).reduce((s,t)=>s+t.amount,0); const cashOut=DB.cashTransactions.filter(t=>t.type==='out'&&(t.date||'').startsWith(mo2)).reduce((s,t)=>s+t.amount,0); return{invs,income,exp,rent,sal,shared,total,profit:income-total,cashIn,cashOut}; }
  const cur=md(m),prv=md(prev);
  const D=(c,p)=>{ if(p===0&&c===0) return'<span class="metric-delta delta-flat">—</span>'; if(p===0) return'<span class="metric-delta delta-up">New</span>'; const pct=Math.round((c-p)/p*100); return pct>0?`<span class="metric-delta delta-up">▲${pct}%</span>`:pct<0?`<span class="metric-delta delta-down">▼${Math.abs(pct)}%</span>`:'<span class="metric-delta delta-flat">—</span>'; };
  const margin=cur.income>0?Math.round(cur.profit/cur.income*100):0;
  const mpend=DB.projects.filter(p=>DB.invoices.some(i=>i.projectId===p.id&&(i.date||'').startsWith(m))).reduce((s,p)=>s+projectRemaining(p),0);
  document.getElementById('mr-metrics').innerHTML=`<div class="metric"><div class="metric-label">Income</div><div class="metric-value mv-green">${kwd(cur.income)}</div>${D(cur.income,prv.income)}</div><div class="metric"><div class="metric-label">Total Expenses</div><div class="metric-value mv-red">${kwd(cur.total)}</div>${D(cur.total,prv.total)}</div><div class="metric"><div class="metric-label">Net Profit</div><div class="metric-value ${cur.profit>=0?'mv-green':'mv-red'}">${kwd(cur.profit)}</div><div class="metric-hint">${margin}%</div></div><div class="metric"><div class="metric-label">Project Pending</div><div class="metric-value mv-amber">${kwd(mpend)}</div></div>`;
  document.getElementById('mr-overhead-metrics').innerHTML=`<div class="metric"><div class="metric-label">Rent</div><div class="metric-value mv-purple">${kwd(cur.rent)}</div>${D(cur.rent,prv.rent)}</div><div class="metric"><div class="metric-label">Salaries</div><div class="metric-value mv-blue">${kwd(cur.sal)}</div>${D(cur.sal,prv.sal)}</div><div class="metric"><div class="metric-label">Shared materials</div><div class="metric-value mv-teal">${kwd(cur.shared)}</div>${D(cur.shared,prv.shared)}</div><div class="metric"><div class="metric-label">Cash net</div><div class="metric-value ${(cur.cashIn-cur.cashOut)>=0?'mv-green':'mv-red'}">${kwd(cur.cashIn-cur.cashOut)}</div><div class="metric-hint">In: ${kwd(cur.cashIn)} / Out: ${kwd(cur.cashOut)}</div></div>`;
  const m6=get6Months(m); const inc6=m6.map(mo2=>DB.invoices.filter(i=>(i.date||'').startsWith(mo2)&&i.status==='Paid').reduce((s,i)=>s+i.amount,0)); const exp6=m6.map(mo2=>totalExpenses(mo2).total);
  buildChart('mr-chart',m6,inc6,exp6,inc6.map((v,i)=>v-exp6[i]),true);
  const cats={};DB.expenses.filter(e=>(e.date||'').startsWith(m)).forEach(e=>{cats[e.cat]=(cats[e.cat]||0)+e.amount;});if(cur.rent>0)cats['Rent']=(cats['Rent']||0)+cur.rent;if(cur.sal>0)cats['Salary']=(cats['Salary']||0)+cur.sal;if(cur.shared>0)cats['Shared']=(cats['Shared']||0)+cur.shared;const mc=Math.max(...Object.values(cats),1);
  document.getElementById('mr-cats').innerHTML=!Object.keys(cats).length?'<div style="color:var(--color-text-tertiary);font-size:13px">None</div>':Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="cat-row"><div class="cat-label">${c}</div><div class="cat-track"><div class="cat-fill" style="width:${Math.round(v/mc*100)}%;background:${CC[c]||'#888'}"></div></div><div class="cat-val">${kwd(v)}</div></div>`).join('');
  const ci={};cur.invs.filter(i=>i.status==='Paid').forEach(i=>{ci[i.clientId]=(ci[i.clientId]||0)+i.amount;});
  document.getElementById('mr-top-clients').innerHTML=!Object.keys(ci).length?'<div style="color:var(--color-text-tertiary);font-size:13px">None</div>':Object.entries(ci).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([cid,amt])=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid var(--color-border-tertiary);font-size:13px"><span>${clientName(cid)}</span><span style="font-weight:500;color:#1D9E75">${kwd(amt)}</span></div>`).join('');
  document.getElementById('mr-invoices').innerHTML=!cur.invs.length?'<div style="color:var(--color-text-tertiary);font-size:13px">None</div>':cur.invs.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(inv=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--color-border-tertiary);font-size:13px"><div><div>${clientName(inv.clientId)}</div><div style="font-size:11px;color:var(--color-text-tertiary)">${inv.projectId?projectName(inv.projectId):'General'} · ${fmtDate(inv.date)}</div></div><div style="display:flex;align-items:center;gap:8px">${bdg(inv.status)}<span style="font-weight:500">${kwd(inv.amount)}</span></div></div>`).join('');
  const allExp=[...DB.expenses.filter(e=>(e.date||'').startsWith(m)).map(e=>({date:e.date,label:e.desc,sub:e.cat,amt:e.amount,col:CC[e.cat]||'#888'})),...DB.sharedExpenses.filter(e=>(e.date||'').startsWith(m)).map(e=>({date:e.date,label:e.desc,sub:'Shared',amt:e.amount,col:'#0F6E56'})),...DB.rentPayments.filter(r=>r.month===m).map(r=>({date:r.date,label:r.desc||'Rent',sub:'Rent',amt:r.amount,col:'#534AB7'})),...DB.salaryPayments.filter(s=>s.month===m).map(s=>({date:s.date,label:empName(s.empId),sub:'Salary',amt:s.amount,col:'#185FA5'})),...DB.cashTransactions.filter(t=>t.type==='out'&&(t.date||'').startsWith(m)).map(t=>({date:t.date,label:t.desc,sub:'Cash out',amt:t.amount,col:'#D85A30'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  document.getElementById('mr-expenses').innerHTML=!allExp.length?'<div style="color:var(--color-text-tertiary);font-size:13px">None</div>':allExp.map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--color-border-tertiary);font-size:13px"><div><div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${e.col};display:inline-block;flex-shrink:0"></span>${e.label}</div><div style="font-size:11px;color:var(--color-text-tertiary)">${e.sub} · ${fmtDate(e.date)}</div></div><span style="font-weight:500;color:#D85A30">${kwd(e.amt)}</span></div>`).join('');
}

// ── OVERHEAD ──────────────────────────────────────────────────────────────────
function renderOverhead(){ renderRent(); renderEmployees(); renderSalaries(); }
function renderRent(){
  const total=DB.rentPayments.reduce((s,r)=>s+r.amount,0);const tm=DB.rentPayments.filter(r=>r.month===THIS_MONTH).reduce((s,r)=>s+r.amount,0);const[y,mo]=THIS_MONTH.split('-').map(Number);const pd=new Date(y,mo-2,1);const pm=pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0');const lm=DB.rentPayments.filter(r=>r.month===pm).reduce((s,r)=>s+r.amount,0);
  document.getElementById('rent-summary').innerHTML=`<div class="metric"><div class="metric-label">This month</div><div class="metric-value mv-purple">${kwd(tm)}</div></div><div class="metric"><div class="metric-label">Last month</div><div class="metric-value mv-purple">${kwd(lm)}</div></div><div class="metric"><div class="metric-label">All time</div><div class="metric-value mv-purple">${kwd(total)}</div></div>`;
  const tb=document.getElementById('rent-tbody');
  if(!DB.rentPayments.length){tb.innerHTML='<tr><td colspan="5"><div class="empty-state">No rent payments yet.</div></td></tr>';return;}
  tb.innerHTML=[...DB.rentPayments].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>`<tr><td>${r.desc||'—'}</td><td style="color:#534AB7;font-weight:500">${kwd(r.amount)}</td><td>${fmtMonth(r.month)}</td><td>${fmtDate(r.date)}</td><td><div class="row-actions"><button class="btn-edit" onclick="editRent('${r.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delRent('${r.id}')">Delete</button></div></td></tr>`).join('');
}
function renderEmployees(){
  const grid=document.getElementById('employees-grid');
  if(!DB.employees.length){grid.innerHTML='<div style="color:var(--color-text-secondary);font-size:13px">No employees yet.</div>';return;}
  grid.innerHTML=DB.employees.map(emp=>{const tm=DB.salaryPayments.filter(s=>s.empId===emp.id&&s.month===THIS_MONTH).reduce((s,p)=>s+p.amount,0);const total=DB.salaryPayments.filter(s=>s.empId===emp.id).reduce((s,p)=>s+p.amount,0);return`<div class="card" style="padding:1rem"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div class="emp-avatar">${initials(emp.name)}</div><div><div style="font-weight:500;font-size:13px">${emp.name}</div><div style="font-size:11px;color:var(--color-text-secondary)">${emp.role||'—'}</div></div></div><div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:3px">Base: <strong>${kwd(emp.salary||0)}/mo</strong></div><div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:3px">This month: <strong style="color:#1D9E75">${kwd(tm)}</strong></div><div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:10px">All time: <strong>${kwd(total)}</strong></div><div class="row-actions"><button class="btn-edit" onclick="editEmployee('${emp.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delEmployee('${emp.id}')">Remove</button><button class="btn btn-primary btn-sm" onclick="quickSalary('${emp.id}')">Pay salary</button></div></div>`;}).join('');
}
function renderSalaries(){
  const tb=document.getElementById('salary-tbody');
  if(!DB.salaryPayments.length){tb.innerHTML='<tr><td colspan="6"><div class="empty-state">No salary payments yet.</div></td></tr>';return;}
  tb.innerHTML=[...DB.salaryPayments].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(s=>`<tr><td><div style="display:flex;align-items:center;gap:8px"><div class="emp-avatar" style="width:26px;height:26px;font-size:10px">${initials(empName(s.empId))}</div>${empName(s.empId)}</div></td><td style="color:#185FA5;font-weight:500">${kwd(s.amount)}</td><td>${fmtMonth(s.month)}</td><td>${fmtDate(s.date)}</td><td style="font-size:12px;color:var(--color-text-secondary)">${s.notes||'—'}</td><td><div class="row-actions"><button class="btn-edit" onclick="editSalary('${s.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delSalary('${s.id}')">Delete</button></div></td></tr>`).join('');
}

// ── SHARED ────────────────────────────────────────────────────────────────────
function renderShared(){
  const total=DB.sharedExpenses.reduce((s,e)=>s+e.amount,0);const tm=DB.sharedExpenses.filter(e=>(e.date||'').startsWith(THIS_MONTH)).reduce((s,e)=>s+e.amount,0);
  document.getElementById('shared-summary').innerHTML=`<div class="metric"><div class="metric-label">This month</div><div class="metric-value mv-teal">${kwd(tm)}</div></div><div class="metric"><div class="metric-label">All time</div><div class="metric-value mv-teal">${kwd(total)}</div></div><div class="metric"><div class="metric-label">Entries</div><div class="metric-value mv-teal">${DB.sharedExpenses.length}</div></div>`;
  const tb=document.getElementById('shared-tbody');
  if(!DB.sharedExpenses.length){tb.innerHTML='<tr><td colspan="5"><div class="empty-state">No shared expenses yet.</div></td></tr>';return;}
  tb.innerHTML=[...DB.sharedExpenses].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(sh=>{const si=sh.splits&&sh.splits.length?sh.splits.map(s=>`<div style="font-size:11px;color:var(--color-text-secondary)">${projectName(s.projectId)}: <strong>${kwd(s.amount)}</strong></div>`).join(''):'<div style="font-size:11px;color:var(--color-text-tertiary)">Not split</div>';return`<tr><td><strong>${sh.desc}</strong><br><span style="font-size:11px;color:var(--color-text-secondary)">${sh.cat}</span></td><td style="font-weight:500;color:#0F6E56">${kwd(sh.amount)}</td><td>${fmtDate(sh.date)}</td><td>${si}</td><td><div class="row-actions"><button class="btn-edit" onclick="editShared('${sh.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delShared('${sh.id}')">Delete</button></div></td></tr>`;}).join('');
}

// ── TABLES ────────────────────────────────────────────────────────────────────
function renderProjects(){
  const tb=document.getElementById('projects-tbody');
  if(!DB.projects.length){tb.innerHTML='<tr><td colspan="9"><div class="empty-state">No projects yet.</div></td></tr>';return;}
  tb.innerHTML=DB.projects.map(p=>{const paid=projectPaid(p.id),rem=projectRemaining(p),pct=projectPayPct(p);return`<tr><td><strong>${p.name}</strong>${p.notes?`<br><small style="color:var(--color-text-tertiary)">${p.notes.slice(0,40)}</small>`:''}</td><td>${clientName(p.clientId)}</td><td>${kwd(p.value)}</td><td style="color:#1D9E75">${kwd(paid)}</td><td style="color:#BA7517">${kwd(rem)}</td><td>${projectPayBadge(p)}<div class="pay-bar-bg"><div class="pay-bar-fill" style="width:${pct}%"></div></div><div style="font-size:10px;color:var(--color-text-tertiary)">${pct}%</div></td><td>${bdg(p.status)}</td><td>${fmtDate(p.due)}</td><td><div class="row-actions"><button class="btn-edit" onclick="editProject('${p.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delProject('${p.id}')">Delete</button></div></td></tr>`;}).join('');
}
function renderInvoices(){
  const tb=document.getElementById('invoices-tbody');
  if(!DB.invoices.length){tb.innerHTML='<tr><td colspan="7"><div class="empty-state">No invoices yet.</div></td></tr>';return;}
  const sorted=[...DB.invoices].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  tb.innerHTML=sorted.map((inv,i)=>`<tr><td style="color:var(--color-text-secondary)">#${String(sorted.length-i).padStart(3,'0')}</td><td>${clientName(inv.clientId)}</td><td>${inv.projectId?projectName(inv.projectId):'—'}</td><td style="font-weight:500">${kwd(inv.amount)}</td><td>${fmtDate(inv.date)}</td><td>${bdg(inv.status)}</td><td><div class="row-actions"><button class="btn-edit" onclick="editInvoice('${inv.id}')">Edit</button><button class="btn btn-sm" onclick="togglePaid('${inv.id}')">${inv.status==='Paid'?'↩':'✓ Paid'}</button><button class="btn-danger btn-sm" onclick="delInvoice('${inv.id}')">Delete</button></div></td></tr>`).join('');
}
function renderExpenses(){
  const tb=document.getElementById('expenses-tbody');
  if(!DB.expenses.length){tb.innerHTML='<tr><td colspan="5"><div class="empty-state">No expenses yet.</div></td></tr>';return;}
  tb.innerHTML=[...DB.expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>`<tr><td>${e.desc}</td><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CC[e.cat]||'#888'};margin-right:6px"></span>${e.cat}</td><td style="color:#D85A30;font-weight:500">${kwd(e.amount)}</td><td>${fmtDate(e.date)}</td><td><div class="row-actions"><button class="btn-edit" onclick="editExpense('${e.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delExpense('${e.id}')">Delete</button></div></td></tr>`).join('');
}
function renderClients(){
  const tb=document.getElementById('clients-tbody');
  if(!DB.clients.length){tb.innerHTML='<tr><td colspan="6"><div class="empty-state">No clients yet.</div></td></tr>';return;}
  tb.innerHTML=DB.clients.map(c=>{const projs=DB.projects.filter(p=>p.clientId===c.id).length;const billed=DB.invoices.filter(i=>i.clientId===c.id).reduce((s,i)=>s+i.amount,0);return`<tr><td><strong>${c.name}</strong></td><td>${c.phone||'—'}</td><td>${c.area||'—'}</td><td>${projs}</td><td>${kwd(billed)}</td><td><div class="row-actions"><button class="btn-edit" onclick="editClient('${c.id}')">Edit</button><button class="btn-danger btn-sm" onclick="delClient('${c.id}')">Delete</button></div></td></tr>`;}).join('');
}

// ── CLIENT REPORTS ────────────────────────────────────────────────────────────
function cliExp(cid,fm){const ids=DB.projects.filter(p=>p.clientId===cid).map(p=>p.id);return DB.expenses.filter(e=>e.projectId&&ids.includes(e.projectId)&&(fm==='all'||!fm||(e.date||'').startsWith(fm)));}
function cliData(cid,fm){const fd=arr=>fm&&fm!=='all'?arr.filter(x=>(x.date||'').startsWith(fm)):arr;const invs=fd(DB.invoices.filter(i=>i.clientId===cid));const income=invs.filter(i=>i.status==='Paid').reduce((s,i)=>s+i.amount,0);const exps=cliExp(cid,fm);const expense=exps.reduce((s,e)=>s+e.amount,0);const pending=DB.projects.filter(p=>p.clientId===cid&&p.status!=='Cancelled').reduce((s,p)=>s+projectRemaining(p),0);return{invs,income,pending,exps,expense,profit:income-expense,margin:income>0?Math.round((income-expense)/income*100):0};}
function renderClientReport(){
  const aM=[...new Set([...DB.invoices,...DB.expenses].map(x=>x.date&&x.date.slice(0,7)).filter(Boolean))].sort().reverse();
  const sel=document.getElementById('cr-filter');const cv=sel.value;
  sel.innerHTML='<option value="all">All time</option>'+aM.map(mo=>`<option value="${mo}">${fmtMonth(mo)}</option>`).join('');
  if(aM.includes(cv))sel.value=cv;const m=sel.value;
  if(!DB.clients.length){document.getElementById('cr-cards').innerHTML='';document.getElementById('cr-detail').innerHTML='<div class="empty-state">No clients yet.</div>';return;}
  document.getElementById('cr-cards').innerHTML=DB.clients.map(c=>{const{income,expense,profit,margin,pending}=cliData(c.id,m);const pc=profit>=0?'#1D9E75':'#D85A30';return`<div class="client-card${selectedClientId===c.id?' selected':''}" onclick="selectedClientId='${c.id}';renderClientReport()"><div class="client-card-header"><div class="avatar">${initials(c.name)}</div><div><div style="font-weight:500;font-size:13px">${c.name}</div><div style="font-size:11px;color:var(--color-text-secondary)">${c.area||c.phone||'—'}</div></div></div><div class="ccm-grid"><div class="ccm"><div class="ccm-label">Income</div><div class="ccm-val" style="color:#1D9E75">${income.toFixed(3)}</div></div><div class="ccm"><div class="ccm-label">Expenses</div><div class="ccm-val" style="color:#D85A30">${expense.toFixed(3)}</div></div><div class="ccm"><div class="ccm-label">Profit</div><div class="ccm-val" style="color:${pc}">${profit.toFixed(3)}</div></div></div><div style="padding:0.5rem 1rem 0.75rem"><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--color-text-tertiary);margin-bottom:3px"><span>Margin ${margin}%</span><span style="color:#BA7517">Rem KWD ${pending.toFixed(3)}</span></div><div class="pbar" style="margin:0"><div class="pfill" style="width:${Math.max(0,Math.min(100,margin))}%;background:${pc}"></div></div></div></div>`;}).join('');
  if(selectedClientId){const c=DB.clients.find(x=>x.id===selectedClientId);if(!c)return;const{invs,income,pending,exps,expense,profit,margin}=cliData(selectedClientId,m);const pc=profit>=0?'#1D9E75':'#D85A30';const projs=DB.projects.filter(p=>p.clientId===selectedClientId);const cats={};exps.forEach(e=>{cats[e.cat]=(cats[e.cat]||0)+e.amount;});const mc2=Math.max(...Object.values(cats),1);document.getElementById('cr-detail').innerHTML=`<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem"><div style="font-family:'DM Serif Display',serif;font-size:18px">${c.name} — Breakdown</div>${c.phone?`<span style="font-size:12px;color:var(--color-text-secondary)">${c.phone}</span>`:''}</div><div class="grid4" style="margin-bottom:1.25rem"><div class="metric"><div class="metric-label">Paid income</div><div class="metric-value mv-green" style="font-size:16px">${kwd(income)}</div></div><div class="metric"><div class="metric-label">Remaining</div><div class="metric-value mv-amber" style="font-size:16px">${kwd(pending)}</div></div><div class="metric"><div class="metric-label">Expenses</div><div class="metric-value mv-red" style="font-size:16px">${kwd(expense)}</div></div><div class="metric"><div class="metric-label">Net profit</div><div class="metric-value" style="font-size:16px;color:${pc}">${kwd(profit)}</div><div class="metric-hint">${margin}%</div></div></div><div class="grid2"><div><div class="sec-title" style="margin-top:0">Projects</div>${!projs.length?'<div style="color:var(--color-text-tertiary);font-size:13px">None</div>':projs.map(p=>{const paid=projectPaid(p.id),rem=projectRemaining(p),pct=projectPayPct(p);return`<div style="padding:8px 0;border-bottom:0.5px solid var(--color-border-tertiary)"><div style="display:flex;justify-content:space-between;font-size:13px"><div><strong>${p.name}</strong> ${bdg(p.status)}</div>${projectPayBadge(p)}</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px;font-size:12px"><div>Value: ${kwd(p.value)}</div><div style="color:#1D9E75">Paid: ${kwd(paid)}</div><div style="color:#BA7517">Rem: ${kwd(rem)}</div></div><div class="pbar" style="margin-top:5px"><div class="pfill" style="width:${pct}%;background:#1D9E75"></div></div></div>`;}).join('')}<div class="sec-title">Invoices</div>${!invs.length?'<div style="color:var(--color-text-tertiary);font-size:13px">None</div>':invs.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(inv=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:0.5px solid var(--color-border-tertiary);font-size:13px"><div><div>${inv.projectId?projectName(inv.projectId):'General'}</div><div style="font-size:11px;color:var(--color-text-tertiary)">${fmtDate(inv.date)}</div></div><div style="display:flex;align-items:center;gap:8px">${bdg(inv.status)}<span style="font-weight:500">${kwd(inv.amount)}</span></div></div>`).join('')}</div><div><div class="sec-title" style="margin-top:0">Expenses</div>${!exps.length?'<div style="color:var(--color-text-tertiary);font-size:13px">None linked via projects</div>':exps.map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:0.5px solid var(--color-border-tertiary);font-size:13px"><div><div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${CC[e.cat]};display:inline-block"></span>${e.desc}</div><div style="font-size:11px;color:var(--color-text-tertiary)">${e.cat}</div></div><span style="font-weight:500;color:#D85A30">${kwd(e.amount)}</span></div>`).join('')}${Object.keys(cats).length?'<div class="sec-title">By category</div>'+Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>`<div class="cat-row"><div class="cat-label">${cat}</div><div class="cat-track"><div class="cat-fill" style="width:${Math.round(val/mc2*100)}%;background:${CC[cat]||'#888'}"></div></div><div class="cat-val">${kwd(val)}</div></div>`).join(''):''}</div></div></div>`;sel.onchange=renderClientReport;}
  else{document.getElementById('cr-detail').innerHTML='<div style="text-align:center;padding:2rem;color:var(--color-text-secondary);font-size:13px">Click a client card to see full breakdown</div>';}
}
window.renderClientReport = renderClientReport;

// ── PWA INSTALL ───────────────────────────────────────────────────────────────
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-banner').classList.add('show');
});
document.getElementById('install-btn').addEventListener('click', async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('install-banner').classList.remove('show');
});
document.getElementById('dismiss-install').addEventListener('click', () => {
  document.getElementById('install-banner').classList.remove('show');
});
window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').classList.remove('show');
});

// ── SERVICE WORKER ────────────────────────────────────────────────────────────
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── INIT ──────────────────────────────────────────────────────────────────────
renderDash();
