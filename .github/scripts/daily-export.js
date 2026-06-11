const https = require('https');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL;

function httpsReq(method, hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname, path, method,
      headers: { ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const kwd = n => 'KWD ' + (+n || 0).toFixed(3);

  // Kuwait time
  const now = new Date();
  const kuwaitTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const dateStr = kuwaitTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const todayStr = kuwaitTime.toISOString().split('T')[0];
  const thisMonth = todayStr.slice(0, 7);

  // Fetch from Supabase
  console.log('Fetching data...');
  const res = await httpsReq('GET', 'bqljghqeodliivjupgqw.supabase.co',
    '/rest/v1/carpentry_data?select=data,updated_at&limit=1',
    { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
  );

  if (res.status !== 200 || !res.body || !res.body[0]) {
    throw new Error('Supabase error: ' + JSON.stringify(res.body));
  }

  const DB = res.body[0].data;
  const updatedAt = res.body[0].updated_at;
  console.log('Data fetched OK');

  const invoices = DB.invoices || [];
  const expenses = DB.expenses || [];
  const projects = DB.projects || [];
  const clients = DB.clients || [];
  const cashTx = DB.cashTransactions || [];
  const salaries = DB.salaryPayments || [];
  const rents = DB.rentPayments || [];
  const shared = DB.sharedExpenses || [];
  const employees = DB.employees || [];

  const cn = id => (clients.find(c => c.id === id) || {}).name || '';
  const pn = id => (projects.find(p => p.id === id) || {}).name || '';

  // Totals
  const totalIncome = invoices.filter(i => i.status === 'Paid' && !String(i.notes||'').startsWith('\uD83D\uDCB5')).reduce((s,i) => s+i.amount, 0);
  const totalExp = expenses.reduce((s,e) => s+e.amount, 0) + salaries.reduce((s,p) => s+p.amount, 0) + rents.reduce((s,r) => s+r.amount, 0) + shared.reduce((s,x) => s+x.amount, 0);
  const netProfit = totalIncome - totalExp;
  const cashIn = cashTx.filter(t => t.type === 'in').reduce((s,t) => s+t.amount, 0);
  const cashOut = cashTx.filter(t => t.type === 'out').reduce((s,t) => s+t.amount, 0);
  const cashBal = cashIn - cashOut;
  const openProjects = projects.filter(p => p.status === 'Open' || p.status === 'In progress').length;
  const pending = projects.filter(p => p.status !== 'Cancelled').reduce((s,p) => {
    const paid = invoices.filter(i => i.projectId === p.id && i.status === 'Paid').reduce((ss,i) => ss+i.amount, 0);
    return s + Math.max(0, (p.value||0) - paid);
  }, 0);

  // Month totals
  const monthIncome = invoices.filter(i => i.status === 'Paid' && (i.date||'').startsWith(thisMonth)).reduce((s,i) => s+i.amount, 0);
  const monthExp = expenses.filter(e => (e.date||'').startsWith(thisMonth)).reduce((s,e) => s+e.amount, 0)
    + salaries.filter(p => (p.month||'').startsWith(thisMonth)).reduce((s,p) => s+p.amount, 0)
    + rents.filter(r => (r.month||'').startsWith(thisMonth)).reduce((s,r) => s+r.amount, 0)
    + shared.filter(x => (x.date||'').startsWith(thisMonth)).reduce((s,x) => s+x.amount, 0);
  const monthProfit = monthIncome - monthExp;

  // Today activity
  const todayTx = cashTx.filter(t => (t.date||'').startsWith(todayStr));
  const todayExp = expenses.filter(e => (e.date||'').startsWith(todayStr));

  // Build CSV
  const csvRows = [
    ['Fine Edge Carpentry — Daily Backup', dateStr],
    [''],
    ['ALL-TIME SUMMARY'],
    ['Total Income', kwd(totalIncome)],
    ['Total Expenses', kwd(totalExp)],
    ['Net Profit', kwd(netProfit)],
    ['Cash Balance', kwd(cashBal)],
    ['Open Projects', openProjects],
    ['Pending Receivables', kwd(pending)],
    [''],
    ['THIS MONTH (' + thisMonth + ')'],
    ['Month Income', kwd(monthIncome)],
    ['Month Expenses', kwd(monthExp)],
    ['Month Profit', kwd(monthProfit)],
    [''],
    ['CLIENTS'],
    ['Name', 'Phone', 'Area', 'Entry Date'],
    ...clients.map(c => [c.name, c.phone||'', c.area||'', c.entryDate||'']),
    [''],
    ['PROJECTS'],
    ['Name', 'Client', 'Value (KWD)', 'Status', 'Due Date'],
    ...projects.map(p => [p.name, cn(p.clientId), (p.value||0).toFixed(3), p.status, p.due||'']),
    [''],
    ['INVOICES'],
    ['Client', 'Project', 'Amount (KWD)', 'Date', 'Status'],
    ...invoices.map(i => [cn(i.clientId), pn(i.projectId), i.amount.toFixed(3), i.date||'', i.status]),
    [''],
    ['EXPENSES'],
    ['Description', 'Supplier', 'Category', 'Amount (KWD)', 'Date'],
    ...expenses.map(e => [e.desc, e.supplier||'', e.cat, e.amount.toFixed(3), e.date||'']),
    [''],
    ['CASH TRANSACTIONS'],
    ['Description', 'Type', 'Category', 'Amount (KWD)', 'Date'],
    ...cashTx.map(t => [t.desc, t.type, t.cat||'', t.amount.toFixed(3), t.date||'']),
    [''],
    ['EMPLOYEES'],
    ['Name', 'Role', 'Base Salary (KWD)'],
    ...employees.map(e => [e.name, e.role||'', (e.salary||0).toFixed(3)]),
  ];
  const csv = csvRows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const csvB64 = Buffer.from(csv, 'utf-8').toString('base64');

  // Today activity HTML
  const profitColor = netProfit >= 0 ? '#2dd4a0' : '#f08060';
  const monthColor = monthProfit >= 0 ? '#2dd4a0' : '#f08060';

  const todayRows = [
    ...todayTx.map(t => `<tr><td style="padding:6px 10px;border-bottom:1px solid #333">${t.desc}</td><td style="padding:6px 10px;border-bottom:1px solid #333;color:${t.type==='in'?'#2dd4a0':'#f08060'}">${t.type==='in'?'Cash In':'Cash Out'}</td><td style="padding:6px 10px;border-bottom:1px solid #333;text-align:right;font-weight:600;color:${t.type==='in'?'#2dd4a0':'#f08060'}">${kwd(t.amount)}</td></tr>`),
    ...todayExp.map(e => `<tr><td style="padding:6px 10px;border-bottom:1px solid #333">${e.desc}${e.supplier?' ('+e.supplier+')':''}</td><td style="padding:6px 10px;border-bottom:1px solid #333;color:#f08060">Expense</td><td style="padding:6px 10px;border-bottom:1px solid #333;text-align:right;font-weight:600;color:#f08060">${kwd(e.amount)}</td></tr>`)
  ].join('');

  const todaySection = todayRows
    ? `<h3 style="color:#2dd4a0;margin:0 0 10px;font-size:14px">Today's Activity</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="background:#2a2a32"><th style="padding:7px 10px;text-align:left;color:#888">Description</th><th style="padding:7px 10px;text-align:left;color:#888">Type</th><th style="padding:7px 10px;text-align:right;color:#888">Amount</th></tr>${todayRows}</table>`
    : '<p style="color:#666;font-size:13px;margin:0">No activity recorded today.</p>';

  const emailHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#111;color:#f0eff5;margin:0;padding:20px">
<div style="max-width:600px;margin:0 auto">
<div style="background:linear-gradient(135deg,#1a1a1f,#0d3320);border-radius:12px;padding:24px;margin-bottom:16px">
<h1 style="margin:0;font-size:22px;color:#fff">Fine Edge Carpentry</h1>
<p style="margin:4px 0 0;color:rgba(255,255,255,.6);font-size:13px">Daily Report — ${dateStr}</p>
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:12px">
<tr>
<td style="padding:0 6px 6px 0;width:50%"><div style="background:#1a1a1f;border-radius:10px;padding:16px;border-left:3px solid ${profitColor}"><div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:6px">Net Profit (All Time)</div><div style="font-size:22px;font-weight:700;color:${profitColor}">${kwd(netProfit)}</div></div></td>
<td style="padding:0 0 6px 6px;width:50%"><div style="background:#1a1a1f;border-radius:10px;padding:16px;border-left:3px solid #3a8fd4"><div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:6px">Cash Balance</div><div style="font-size:22px;font-weight:700;color:#3a8fd4">${kwd(cashBal)}</div></div></td>
</tr>
<tr>
<td style="padding:6px 6px 0 0"><div style="background:#1a1a1f;border-radius:10px;padding:16px;border-left:3px solid #d4920a"><div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:6px">Pending Receivables</div><div style="font-size:22px;font-weight:700;color:#d4920a">${kwd(pending)}</div></div></td>
<td style="padding:6px 0 0 6px"><div style="background:#1a1a1f;border-radius:10px;padding:16px;border-left:3px solid #7c72e0"><div style="font-size:10px;color:#666;text-transform:uppercase;margin-bottom:6px">Open Projects</div><div style="font-size:22px;font-weight:700;color:#7c72e0">${openProjects}</div></div></td>
</tr>
</table>
<div style="background:#1a1a1f;border-radius:10px;padding:16px;margin-bottom:12px">
<h3 style="margin:0 0 12px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.5px">This Month (${thisMonth})</h3>
<table style="width:100%;font-size:13px">
<tr><td style="padding:4px 0;color:#aaa">Income</td><td style="text-align:right;color:#2dd4a0;font-weight:600">${kwd(monthIncome)}</td></tr>
<tr><td style="padding:4px 0;color:#aaa">Expenses</td><td style="text-align:right;color:#f08060;font-weight:600">${kwd(monthExp)}</td></tr>
<tr style="border-top:1px solid #333"><td style="padding:8px 0 4px;font-weight:600">Month Profit</td><td style="text-align:right;font-weight:700;font-size:15px;color:${monthColor}">${kwd(monthProfit)}</td></tr>
</table>
</div>
<div style="background:#1a1a1f;border-radius:10px;padding:16px;margin-bottom:12px">${todaySection}</div>
<div style="background:#1a1a1f;border-radius:10px;padding:14px;text-align:center;font-size:12px;color:#555">
Full data backup attached as CSV<br>
Last saved: ${updatedAt ? new Date(updatedAt).toLocaleString('en-GB') : 'N/A'}<br><br>
Fine Edge Carpentry Manager • Auto-sent daily at 11:00 PM Kuwait Time
</div>
</div></body></html>`;

  // Send via Resend
  console.log('Sending email to', TO_EMAIL);
  const emailRes = await httpsReq('POST', 'api.resend.com', '/emails',
    { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    {
      from: 'Fine Edge Reports <onboarding@resend.dev>',
      to: [TO_EMAIL],
      subject: 'Fine Edge Daily Report — ' + dateStr,
      html: emailHTML,
      attachments: [{ filename: 'fineedge-backup-' + todayStr + '.csv', content: csvB64 }]
    }
  );

  if (emailRes.status !== 200) throw new Error('Resend error: ' + JSON.stringify(emailRes.body));
  console.log('Email sent successfully!', emailRes.body.id);
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
