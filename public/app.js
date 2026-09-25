const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const opts = (a, sel) => a.map(x => `<option ${x === sel ? 'selected' : ''}>${x}</option>`).join('');
const bgSel = (n, ph = 'Select') => `<select name="${n}" required><option value="">${ph}</option>${opts(GROUPS)}</select>`;
const tag = (t, c = '') => `<span class="tag ${c}">${esc(t)}</span>`;
const empty = (i, t, s) => `<div class="empty"><div style="font-size:42px">${i}</div><b>${t}</b>${s}</div>`;

async function api(p, method = 'GET', body) {
  const r = await fetch('/api/' + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j;
}
function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (err ? ' err' : ''); setTimeout(() => t.className = '', 3200); }
function openModal(title, html) { $('#mt').textContent = title; $('#mb').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
// submit helper: wires a form inside the modal to an API call
function bindForm(fn) { $('#mb form').onsubmit = async e => { e.preventDefault(); try { const r = await fn(Object.fromEntries(new FormData(e.target))); if (r !== 'keep') closeModal(); go(cur); } catch (x) { toast(x.message, true); } }; }

const PAGES = {
  dashboard: ['📊', 'Dashboard', 'Real-time blood bank overview'], donors: ['👥', 'Donor Registration', 'Manage blood donors'],
  collection: ['🩸', 'Blood Collection', 'Record and track blood collections'], lab: ['🧪', 'Lab Testing', 'Module – test blood samples for safety'],
  inventory: ['📦', 'Inventory', 'Live stock by blood group and component'], requests: ['📄', 'Hospital Blood Requests', 'Manage blood requisitions'],
  issue: ['🚚', 'Issue Blood', 'Issue blood against approved requests'], emergency: ['⚠️', 'Emergency Blood Request', 'Create emergency requests that notify all students and faculty members'],
  notifications: ['🔔', 'Notifications', 'View emergency blood request notifications for donors'], audit: ['📋', 'Audit Log', 'Track all system actions and changes']
};
let cur = 'dashboard';
$('#nav').innerHTML = Object.entries(PAGES).map(([k, v]) => `<a data-k="${k}" onclick="go('${k}')"><span>${v[0]}</span>${v[1].replace(' Module', '').replace('Hospital ', '').replace('Emergency Blood Request', 'Emergency Request').replace('Blood Requests', 'Blood Requests')}</a>`).join('');

async function go(k) {
  cur = k; const [, t, s] = PAGES[k];
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.k === k));
  $('#title').textContent = t; $('#sub').textContent = s; $('#action').innerHTML = ''; $('#view').innerHTML = '<div class="empty">Loading…</div>';
  try { await R[k](); } catch (e) { $('#view').innerHTML = empty('❌', 'Could not load', esc(e.message)); }
}
const act = (label, fn, cls = '') => { $('#action').innerHTML = `<button class="btn ${cls}">${label}</button>`; $('#action button').onclick = fn; };

const R = {
  async dashboard() {
    const [d, i] = await Promise.all([api('dashboard'), api('inventory')]);
    const low = GROUPS.map(g => [g, i.inventory[g].total]).filter(x => x[1] < 5);
    $('#view').innerHTML = `<div class="grid g4">
      ${[['Total Units Available', i.total, 'Across all blood groups'], ['Issued Today', d.issuedToday, 'Units issued today'], ['Registered Donors', d.donors, `${d.eligible} eligible to donate`], ['Pending Requests', d.pending, 'Awaiting approval']].map(x => `<div class="card stat"><small>${x[0]}</small><b>${x[1]}</b><span>${x[2]}</span></div>`).join('')}</div>
      <div class="grid g4"><div class="card stat"><small>🏠 Hostelers</small><b>${d.hostelers}</b><span>Registered donors</span></div>
      <div class="card stat"><small>🚌 Day Scholars</small><b>${d.dayScholars}</b><span>Registered donors</span></div>
      <div class="card stat"><small>⚠️ Emergency Requests</small><b>${d.emergencies}</b><span>Total raised</span></div></div>
      <div class="grid g2"><div class="card"><h3>🩸 Blood Group Inventory</h3><div class="bg8">${GROUPS.map(g => `<div class="bgc"><b style="font-size:16px">${g}</b><b>${i.inventory[g].total}</b><small>units</small></div>`).join('')}</div></div>
      <div><div class="card"><h3 style="color:#dc2626">⚠ Low Stock Alerts</h3>${low.map(x => `<span class="tag bad" style="margin:0 6px 6px 0">${x[0]}: ${x[1]} unit${x[1] == 1 ? '' : 's'}</span>`).join('') || 'All stock levels healthy'}</div>
      <div class="card"><h3>🕒 Expiring Within 5 Days</h3>${i.expiring.map(e => `<div>${e.code} – ${e.blood_group} ${e.component} (${e.expiry})</div>`).join('') || '<span style="color:var(--m)">No units expiring soon.</span>'}</div></div></div>`;
  },

  async donors() {
    const all = await api('donors'); let f = 'All', q = '';
    act('＋ Register Donor', () => {
      openModal('Register New Donor', `<form><div class="f">
        <div><label>Name *</label><input name="name" required></div><div><label>Age *</label><input name="age" type="number" min="17" max="65" required></div>
        <div><label>Blood Group *</label>${bgSel('blood_group')}</div>
        <div><label>Type *</label><select name="type" required onchange="document.getElementById('rs').style.display=this.value=='Student'?'block':'none'"><option>Student</option><option>Faculty</option><option>External</option></select></div>
        <div id="rs"><label>Hosteler / Day Scholar *</label><select name="residence"><option>Hosteler</option><option>Day Scholar</option></select></div>
        <div><label>Contact Number *</label><input name="contact" pattern="\\d{10}" maxlength="10" required></div>
        <div><label>Email</label><input name="email" type="email"></div><div><label>Department</label><input name="department"></div>
        <div class="w"><label>Have you donated blood before? *</label><select name="donated_before" required onchange="const d=document.getElementById('ld'),i=d.querySelector('input');d.style.display=this.value=='yes'?'block':'none';i.disabled=this.value!='yes';i.required=this.value=='yes'"><option value="">Select</option><option value="no">First time donor</option><option value="yes">Already donated</option></select></div>
        <div id="ld" class="w" style="display:none"><label>Last Donation Date *</label><input name="last_donation" type="date" max="${new Date().toISOString().slice(0, 10)}" disabled></div></div><button class="btn full">Register Donor</button></form>`);
      bindForm(b => api('donors', 'POST', b).then(() => toast('Donor saved to database')));
    });
    const draw = () => {
      const rows = all.filter(d => (f === 'All' || d.residence === f || d.type === f) && (`${d.name} ${d.blood_group} ${d.code} ${d.department} ${d.contact}`).toLowerCase().includes(q));
      $('#tb').innerHTML = rows.map(d => `<tr><td>${d.code}</td><td><b>${esc(d.name)}</b></td><td>${d.age}</td><td>${tag(d.blood_group)}</td><td>${d.type}</td>
        <td>${d.residence == 'Hosteler' ? tag('Hosteler', 'host') : d.residence == 'Day Scholar' ? tag('Day Scholar', 'day') : '–'}</td><td>${esc(d.department || '–')}</td><td>${d.contact}</td><td>${d.last_donation || 'Never'}</td>
        <td>${d.status == 'First Time' ? tag('First Time', 'ok') : d.status == 'Eligible' ? tag('Eligible', 'gold') : tag('Recent', 'bad')}</td><td><button class="lnk" style="color:#dc2626" onclick="delDonor(${d.id})">🗑</button></td></tr>`).join('') || `<tr><td colspan=11 class="empty">No donors found</td></tr>`;
      $('#cnt').textContent = rows.length + ' donors';
    };
    window.delDonor = async id => { if (confirm('Delete this donor?')) try { await api('donors/' + id, 'DELETE'); toast('Donor deleted'); go('donors'); } catch (e) { toast(e.message, true); } };
    $('#view').innerHTML = `<div class="card"><div class="bar2"><input id="q" placeholder="Search by name, blood group, dept or ID…">${['All', 'Hosteler', 'Day Scholar', 'Faculty', 'External'].map(x => `<button class="pill ${x == 'All' ? 'on' : ''}" data-f="${x}">${x == 'Hosteler' ? 'Hostelers' : x == 'Day Scholar' ? 'Day Scholars' : x}</button>`).join('')}<span class="tag" id="cnt" style="margin-left:auto;align-self:center"></span></div>
      <table><thead><tr><th>ID</th><th>Name</th><th>Age</th><th>Blood</th><th>Type</th><th>Residence</th><th>Dept</th><th>Contact</th><th>Last Donation</th><th>Eligibility</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
    $('#q').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
    document.querySelectorAll('.pill').forEach(p => p.onclick = () => { f = p.dataset.f; document.querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x == p)); draw(); }); draw();
  },

  async collection() {
    const [cols, donors] = await Promise.all([api('collections'), api('donors')]);
    act('＋ New Collection', () => {
      const el = donors.filter(d => d.status !== 'Recent');
      openModal('Record Blood Collection', `<form><div class="f"><div class="w"><label>Donor * (only eligible donors listed)</label><select name="donor_id" required><option value="">Select donor</option>${el.map(d => `<option value="${d.id}">${esc(d.name)} (${d.blood_group}) – ${d.code}</option>`).join('')}</select></div>
        <div><label>Component Type *</label><select name="component"><option>Whole Blood</option><option>Plasma</option><option>Platelets</option><option>RBC</option></select></div><div><label>Quantity</label><input name="qty" type="number" value="1" min="1"></div>
        <div class="w"><label>Expiry Date *</label><input name="expiry" type="date" required></div></div><button class="btn full">Record Collection</button></form>`);
      bindForm(b => api('collections', 'POST', b).then(() => toast('Collection recorded – send to Lab Testing')));
    });
    $('#view').innerHTML = `<div class="card"><table><thead><tr><th>ID</th><th>Donor</th><th>Date</th><th>Blood Group</th><th>Component</th><th>Qty</th><th>Expiry</th><th>Status</th></tr></thead><tbody>
      ${cols.map(c => `<tr><td>${c.code}</td><td>${esc(c.donor_name)}</td><td>${c.date}</td><td>${tag(c.blood_group)}</td><td>${c.component}</td><td>${c.qty}</td><td>${c.expiry}</td><td>${tag(c.status, c.status == 'Approved' ? 'okl' : c.status == 'Rejected' ? 'bad' : 'gold')}</td></tr>`).join('') || `<tr><td colspan=8 class="empty">No collections yet</td></tr>`}</tbody></table></div>`;
  },

  async lab() {
    const [tests, cols] = await Promise.all([api('lab-tests'), api('collections')]);
    act('🧪 New Lab Test', () => {
      const p = cols.filter(c => c.status === 'Pending'); if (!p.length) return toast('No collections awaiting testing', true);
      const sel = n => `<div><label>${n[1]}</label><select name="${n[0]}"><option>Negative</option><option>Positive</option></select></div>`;
      openModal('New Lab Test', `<form><div class="f"><div class="w"><label>Collection *</label><select name="collection_id">${p.map(c => `<option value="${c.id}">${c.code} – ${esc(c.donor_name)} (${c.blood_group})</option>`).join('')}</select></div>
        ${[['hiv', 'HIV'], ['hepb', 'Hep B'], ['hepc', 'Hep C'], ['malaria', 'Malaria'], ['syphilis', 'Syphilis']].map(sel).join('')}</div><button class="btn full">Submit Result</button></form>`);
      bindForm(b => api('lab-tests', 'POST', b).then(() => toast('Lab result saved')));
    });
    const r = v => tag(v, v == 'Negative' ? 'okl' : 'bad');
    $('#view').innerHTML = `<div class="card"><table><thead><tr><th>ID</th><th>Collection</th><th>Donor</th><th>Blood</th><th>HIV</th><th>Hep B</th><th>Hep C</th><th>Malaria</th><th>Syphilis</th><th>Result</th><th>Tested By</th></tr></thead><tbody>
      ${tests.map(t => `<tr><td>${t.code}</td><td>${t.collection_code}</td><td>${esc(t.donor_name)}</td><td>${tag(t.blood_group)}</td><td>${r(t.hiv)}</td><td>${r(t.hepb)}</td><td>${r(t.hepc)}</td><td>${r(t.malaria)}</td><td>${r(t.syphilis)}</td><td>${tag(t.result, t.result == 'Approved' ? 'ok' : 'bad')}</td><td>${t.tested_by}</td></tr>`).join('') || `<tr><td colspan=11 class="empty">No tests yet. ${cols.filter(c => c.status == 'Pending').length} collection(s) awaiting testing.</td></tr>`}</tbody></table></div>`;
  },

  async inventory() {
    const { inventory: v, total } = await api('inventory'), C = ['Whole Blood', 'Plasma', 'Platelets', 'RBC'];
    $('#view').innerHTML = `<div class="bg8" style="margin-bottom:18px">${GROUPS.map(g => `<div class="bgc card" style="margin:0"><b style="font-size:16px">${g}</b><b>${v[g].total}</b><small>units</small><br>${v[g].total < 5 ? tag('⚠ Low', 'bad') : tag('OK', 'ok')}</div>`).join('')}</div>
      <div class="card"><h3>Detailed Breakdown ${tag(total + ' total')}</h3><table><thead><tr><th>Blood Group</th>${C.map(c => `<th>${c}</th>`).join('')}<th>Total</th><th>Status</th></tr></thead><tbody>
      ${GROUPS.map(g => `<tr><td>${tag(g)}</td>${C.map(c => `<td>${v[g][c]}</td>`).join('')}<td><b>${v[g].total}</b></td><td>${v[g].total < 5 ? tag('⚠ Low Stock', 'bad') : tag('In Stock', 'ok')}</td></tr>`).join('')}</tbody></table></div>`;
  },

  async requests() {
    const rows = await api('requests');
    act('＋ New Request', () => {
      openModal('New Blood Request', `<form><div class="f"><div><label>Patient ID *</label><input name="patient_id" required></div><div><label>Patient Name *</label><input name="patient_name" required></div>
        <div><label>Blood Group *</label>${bgSel('blood_group')}</div><div><label>Units Required</label><input name="units" type="number" min="1" value="1"></div>
        <div class="w"><label style="color:#dc2626"><input type="checkbox" name="emergency" value="1" style="width:auto"> Emergency Request</label></div></div><button class="btn full">Submit Request</button></form>`);
      bindForm(b => api('requests', 'POST', b).then(() => toast('Request submitted')));
    });
    window.setReq = async (id, s) => { try { await api('requests/' + id, 'PATCH', { status: s }); toast('Request ' + s.toLowerCase()); go('requests'); } catch (e) { toast(e.message, true); } };
    $('#view').innerHTML = `<div class="card"><table><thead><tr><th>ID</th><th>Patient</th><th>Blood Group</th><th>Units</th><th>Emergency</th><th>Status</th><th>Requested By</th><th>Date</th><th>Actions</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r.code}</td><td>${esc(r.patient_name)}</td><td>${tag(r.blood_group)}</td><td>${r.units}</td><td>${r.emergency ? tag('Yes', 'bad') : 'No'}</td><td>${tag(r.status, r.status == 'Approved' || r.status == 'Issued' ? 'ok' : r.status == 'Rejected' ? 'bad' : 'gold')}</td><td>${esc(r.requested_by)}</td><td>${r.date}</td>
      <td>${r.status == 'Pending' ? `<button class="lnk" style="color:#16a34a" onclick="setReq(${r.id},'Approved')">✔ Approve</button><button class="lnk" style="color:#dc2626" onclick="setReq(${r.id},'Rejected')">✖ Reject</button>` : ''}</td></tr>`).join('') || `<tr><td colspan=9 class="empty">No requests</td></tr>`}</tbody></table></div>`;
  },

  async issue() {
    const { issues, pending } = await api('issues');
    act('🚚 Issue Blood', () => {
      if (!pending.length) return toast('No approved requests pending', true);
      openModal('Issue Blood', `<form><label>Approved Request *</label><select name="request_id">${pending.map(p => `<option value="${p.id}">${p.code} – ${esc(p.patient_name)} (${p.blood_group} × ${p.units})</option>`).join('')}</select><button class="btn full">Issue</button></form>`);
      bindForm(b => api('issues', 'POST', b).then(() => toast('Blood issued')));
    });
    $('#view').innerHTML = `<div class="warn">${pending.length} approved request(s) pending issue</div><div class="card"><table><thead><tr><th>Issue ID</th><th>Request ID</th><th>Patient</th><th>Blood Group</th><th>Units</th><th>Issued By</th><th>Date</th></tr></thead><tbody>
      ${issues.map(i => `<tr><td>${i.code}</td><td>${i.request_code}</td><td>${esc(i.patient_name)}</td><td>${tag(i.blood_group)}</td><td>${i.units}</td><td>${i.issued_by}</td><td>${i.date}</td></tr>`).join('') || `<tr><td colspan=7 class="empty">No blood has been issued yet.</td></tr>`}</tbody></table></div>`;
  },

  async emergency() {
    const list = await api('emergency');
    act('⚠ New Emergency Request', () => {
      openModal('⚠ Emergency Blood Request', `<div class="warn"><b>Notification Priority Order:</b><ol style="margin:6px 0 0 18px;line-height:1.7"><li>First-time donors (never donated) – can volunteer</li><li>Eligible donors (donated 6+ months ago) – can volunteer</li><li>Recent donors (within 6 months) – notified but cannot volunteer</li></ol></div>
      <form><div class="f"><div><label>Patient Name *</label><input name="patient_name" required></div><div><label>Guardian Name *</label><input name="guardian_name" required></div>
      <div><label>Mobile Number *</label><input name="mobile" placeholder="10-digit mobile" pattern="\\d{10}" maxlength="10" required></div><div><label>Venue *</label><input name="venue" placeholder="Hospital/Ward/Room" required></div>
      <div><label>Blood Group Needed *</label>${bgSel('blood_group')}</div><div><label>Units Required *</label><input name="units" type="number" min="1" value="1"></div></div><button class="btn red full">✈ Send Emergency Request & Notify All</button></form>`);
      bindForm(async b => { const r = await api('emergency', 'POST', b); toast(`Saved. ${r.notified} donors notified`); showWA(r.id); return 'keep'; });
    }, 'red');
    $('#view').innerHTML = list.map(e => `<div class="card em"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><h3 style="margin:0">${e.code} – ${esc(e.patient_name)} ${tag(e.blood_group, 'bad')} × ${e.units}</h3><span style="color:var(--m);font-size:13px">${e.created_at} UTC</span></div>
      <p style="margin-top:8px;font-size:14px">Guardian: <b>${esc(e.guardian_name)}</b> · 📞 ${e.mobile} · 📍 ${esc(e.venue)}</p>
      <button class="btn" style="margin-top:12px;background:#16a34a" onclick="showWA(${e.id})">📲 Send WhatsApp to ${e.blood_group} donors</button><div class="vol">${e.notified} donors notified · <b>${e.volunteers.length} volunteered</b>${e.volunteers.map(v => `<div>✔ ${esc(v.name)} (${v.blood_group}, ${v.residence}) – ${v.contact}</div>`).join('')}</div></div>`).join('')
      || `<div class="card">${empty('⚠️', 'No Emergency Requests', 'Create an emergency request to notify all students and faculty donors instantly.')}</div>`;
  },

  async notifications() {
    const donors = await api('donors'); let id = donors[0]?.id;
    const st = d => d.status == 'First Time' ? 'First Time Donor' : d.status == 'Eligible' ? 'Eligible Donor' : 'Recent Donor';
    $('#view').innerHTML = `<div class="card"><h3>View Notifications As Donor</h3><select id="ds" style="max-width:480px">${donors.map(d => `<option value="${d.id}">${esc(d.name)} (${d.blood_group}) – ${d.type}${d.residence != 'N/A' ? ' / ' + d.residence : ''} – ${st(d)}</option>`).join('')}</select></div><div id="nl"></div>`;
    window.volunteer = async n => { try { await api(`notifications/${n}/volunteer`, 'POST'); toast('Thank you for volunteering!'); load(); } catch (e) { toast(e.message, true); } };
    const load = async () => {
      const d = donors.find(x => x.id == id), n = await api('notifications/' + id);
      $('#nl').innerHTML = n.map(x => `<div class="card em"><div style="display:flex;justify-content:space-between"><b>🚨 Urgent: ${x.blood_group} blood needed for ${esc(x.patient_name)}</b>${x.blood_match ? tag('Your group matches', 'ok') : ''}</div>
        <p style="margin:8px 0;font-size:14px">${x.units} unit(s) · 📍 ${esc(x.venue)} · Guardian ${esc(x.guardian_name)} (📞 ${x.mobile})</p>
        ${x.volunteered ? tag('✔ You volunteered', 'ok') : x.priority == 3 ? tag('Donated within 6 months – cannot volunteer', 'gold') : `<button class="btn" onclick="volunteer(${x.id})">I can donate</button>`}</div>`).join('')
        || `<div class="card">${empty('🔔', 'No Notifications', esc(d.name) + ' has no notifications yet.')}</div>`;
    };
    $('#ds').onchange = e => { id = e.target.value; load(); }; load();
  },

  async audit() {
    const rows = await api('audit'); let q = '';
    $('#view').innerHTML = `<div class="card"><div class="bar2"><input id="q" placeholder="Search actions, users, or details…"><span class="tag" id="cnt" style="margin-left:auto"></span></div><table><thead><tr><th>Timestamp</th><th>Action</th><th>Performed By</th><th>Role</th><th>Details</th></tr></thead><tbody id="tb"></tbody></table></div>`;
    const draw = () => { const r = rows.filter(x => JSON.stringify(x).toLowerCase().includes(q)); $('#cnt').textContent = r.length + ' entries';
      $('#tb').innerHTML = r.map(x => `<tr><td style="color:var(--m)">${x.ts}</td><td><b>${esc(x.action)}</b></td><td>${esc(x.performed_by)}</td><td>${tag(x.role)}</td><td style="color:var(--m)">${esc(x.details)}</td></tr>`).join('') || `<tr><td colspan=5 class="empty">No entries</td></tr>`; };
    $('#q').oninput = e => { q = e.target.value.toLowerCase(); draw(); }; draw();
  }
};


window.showWA = async (id, compat = 0) => {
  try {
    const { emergency: e, donors } = await api(`emergency/${id}/whatsapp?compatible=${compat}`);
    window._wa = { id, compat, donors }; const pend = donors.filter(d => !d.whatsapp_sent).length;
    openModal(`📲 WhatsApp – ${e.code} · ${e.blood_group} needed`, `<div class="note">${compat ? `Donors who can safely give <b>${e.blood_group}</b>` : `Donors with blood group <b>${e.blood_group}</b>`} and allowed to donate: <b>${donors.length}</b><br>Click <b>Send</b> – WhatsApp opens with the message ready. Just press send there.
      <label style="margin:10px 0 0;font-weight:500"><input type="checkbox" style="width:auto" ${compat ? 'checked' : ''} onchange="showWA(${id}, this.checked ? 1 : 0)"> Also include compatible blood groups (e.g. O- can give to everyone)</label></div>
      <div style="margin:14px 0 6px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><button class="btn" style="background:#16a34a" onclick="sendAll()" ${pend ? '' : 'disabled'}>📲 ${pend ? `Send to All (${pend})` : 'All sent'}</button><small style="color:var(--m)">Opens a WhatsApp chat for every donor below who has not been sent this alert yet.</small></div>
      <table><thead><tr><th>Donor</th><th>Group</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>
      ${donors.map(d => `<tr><td><b>${esc(d.name)}</b><br><small style="color:var(--m)">${d.contact}</small></td><td>${tag(d.blood_group, d.blood_group == e.blood_group ? 'ok' : '')}</td><td>${d.residence == 'Hosteler' ? tag('Hosteler', 'host') : d.residence == 'Day Scholar' ? tag('Day Scholar', 'day') : d.type}</td>
      <td>${d.status == 'First Time' ? tag('First Time', 'ok') : tag('Eligible', 'gold')}</td><td><a class="btn" style="background:#16a34a;text-decoration:none;display:inline-block;padding:8px 14px" href="${d.link}" target="_blank" rel="noopener" onclick="markSent(${d.nid},this)">${d.whatsapp_sent ? '✔ Sent again' : 'Send'}</a></td></tr>`).join('') || `<tr><td colspan=5 class="empty">No eligible donors found. Try including compatible groups.</td></tr>`}</tbody></table>`);
  } catch (x) { toast(x.message, true); }
};
window.markSent = (n, el) => { api(`notifications/${n}/sent`, 'POST'); el.textContent = '✔ Sent'; };
// Send to All: opens one WhatsApp chat per donor not yet sent. The window.open calls must run
// synchronously inside the click, otherwise the browser's pop-up blocker stops them.
window.sendAll = async () => {
  const { id, compat, donors } = window._wa || {};
  const todo = (donors || []).filter(d => !d.whatsapp_sent);
  if (!todo.length) return toast('Everyone has already been sent this alert');
  const opened = todo.filter(d => window.open(d.link, '_blank'));
  await Promise.all(opened.map(d => api(`notifications/${d.nid}/sent`, 'POST').catch(() => { })));
  const missed = todo.length - opened.length;
  toast(missed ? `Opened ${opened.length}. ${missed} blocked - allow pop-ups for localhost:3000, then click Send to All again` : `Opened WhatsApp for ${opened.length} donors - press send in each tab`, !!missed);
  await showWA(id, compat);
};

// ---- splash: logo animates in, then the app fades in ----
window.addEventListener('load', () => setTimeout(() => {
  $('#splash').classList.add('out'); $('#app').classList.remove('hidden'); go('dashboard');
  setTimeout(() => $('#splash').remove(), 800);
}, 3200));