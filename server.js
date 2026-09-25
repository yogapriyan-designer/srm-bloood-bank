const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'bloodbank.db'));
db.pragma('journal_mode = DELETE'); db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
try { db.exec('ALTER TABLE notifications ADD COLUMN whatsapp_sent INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }

// ---- seed real donors from the Excel export (first run only) ----
const iso = s => { const m = /^(\d\d)-(\d\d)-(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || null); };
if (!db.prepare('SELECT COUNT(*) c FROM donors').get().c) {
  const ins = db.prepare(`INSERT INTO donors (name,age,dob,blood_group,type,residence,contact,department,last_donation) VALUES (?,?,?,?,?,?,?,?,?)`);
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'donors_seed.json'), 'utf8'));
  db.transaction(() => rows.forEach(r => ins.run(r.name, +r.age, r.dob, r.bg, 'Student', r.type, r.mobile, r.dept, iso(r.prev))))();
  console.log(`Seeded ${rows.length} donors from Excel`);
}

const today = () => new Date().toISOString().slice(0, 10);
const audit = (action, by, role, details) => db.prepare('INSERT INTO audit_log (action,performed_by,role,details) VALUES (?,?,?,?)').run(action, by, role, details);
const pad = (p, n) => `${p}-${String(n).padStart(3, '0')}`;
const eligibility = d => {
  if (!d) return 'First Time';
  const c = new Date(d); c.setMonth(c.getMonth() + 6);
  return c <= new Date() ? 'Eligible' : 'Recent';
};
const donorOut = d => ({ ...d, code: pad('DON', d.id), status: eligibility(d.last_donation) });
const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const wrap = fn => (req, res) => { try { res.json(fn(req, res) ?? { ok: true }); } catch (e) { console.error(e); res.status(400).json({ error: e.message.includes('UNIQUE') ? 'This mobile number is already registered' : e.message }); } };
const need = (o, ...k) => k.forEach(f => { if (o[f] === undefined || o[f] === '') throw new Error(`${f} is required`); });

// ---- donors ----
app.get('/api/donors', wrap(() => db.prepare('SELECT * FROM donors ORDER BY id').all().map(donorOut)));
app.post('/api/donors', wrap(req => {
  const b = req.body; need(b, 'name', 'age', 'blood_group', 'type', 'contact');
  if (!/^\d{10}$/.test(b.contact)) throw new Error('Contact must be 10 digits');
  const r = db.prepare('INSERT INTO donors (name,age,blood_group,type,residence,contact,email,department,last_donation) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(b.name, +b.age, b.blood_group, b.type, b.type === 'Student' ? (b.residence || 'Day Scholar') : 'N/A', b.contact, b.email || null, b.department || null, b.last_donation || null);
  audit('Donor Registered', 'Dr. Admin', 'Admin', `Registered donor ${b.name} (${b.blood_group})`);
  return { id: r.lastInsertRowid };
}));
app.delete('/api/donors/:id', wrap(req => {
  const d = db.prepare('SELECT * FROM donors WHERE id=?').get(req.params.id);
  if (!d) throw new Error('Donor not found');
  if (db.prepare('SELECT 1 FROM collections WHERE donor_id=?').get(d.id)) throw new Error('Donor has blood collections and cannot be deleted');
  db.prepare('DELETE FROM notifications WHERE donor_id=?').run(d.id);
  db.prepare('DELETE FROM donors WHERE id=?').run(d.id);
  audit('Donor Deleted', 'Dr. Admin', 'Admin', `Deleted donor ${d.name}`);
}));

// ---- collections ----
const colSelect = `SELECT c.*, d.name donor_name FROM collections c JOIN donors d ON d.id=c.donor_id`;
app.get('/api/collections', wrap(() => db.prepare(colSelect + ' ORDER BY c.id').all().map(c => ({ ...c, code: pad('COL', c.id) }))));
app.post('/api/collections', wrap(req => {
  const b = req.body; need(b, 'donor_id', 'component', 'expiry');
  const d = db.prepare('SELECT * FROM donors WHERE id=?').get(b.donor_id);
  if (!d) throw new Error('Donor not found');
  if (eligibility(d.last_donation) === 'Recent') throw new Error(`${d.name} donated within the last 6 months and is not eligible`);
  const date = b.date || today();
  db.transaction(() => {
    db.prepare('INSERT INTO collections (donor_id,date,blood_group,component,qty,expiry) VALUES (?,?,?,?,?,?)').run(d.id, date, d.blood_group, b.component, +b.qty || 1, b.expiry);
    db.prepare('UPDATE donors SET last_donation=? WHERE id=?').run(date, d.id);
  })();
  audit('Blood Collected', 'Officer Kumar', 'Blood Bank Officer', `Collected ${b.qty || 1} unit of ${d.blood_group} from ${d.name}`);
}));

// ---- lab tests ----
app.get('/api/lab-tests', wrap(() => db.prepare(`SELECT l.*, c.blood_group, d.name donor_name FROM lab_tests l JOIN collections c ON c.id=l.collection_id JOIN donors d ON d.id=c.donor_id ORDER BY l.id`).all().map(l => ({ ...l, code: pad('LAB', l.id), collection_code: pad('COL', l.collection_id) }))));
app.post('/api/lab-tests', wrap(req => {
  const b = req.body; need(b, 'collection_id');
  const c = db.prepare('SELECT * FROM collections WHERE id=?').get(b.collection_id);
  if (!c || c.status !== 'Pending') throw new Error('Collection is not awaiting testing');
  const t = ['hiv', 'hepb', 'hepc', 'malaria', 'syphilis'].map(k => b[k] || 'Negative');
  const result = t.every(x => x === 'Negative') ? 'Approved' : 'Rejected';
  db.transaction(() => {
    db.prepare('INSERT INTO lab_tests (collection_id,hiv,hepb,hepc,malaria,syphilis,result,tested_by) VALUES (?,?,?,?,?,?,?,?)').run(c.id, ...t, result, 'Lab Tech Priya');
    db.prepare('UPDATE collections SET status=? WHERE id=?').run(result, c.id);
  })();
  audit('Lab Test Completed', 'Lab Tech Priya', 'Lab Staff', `${result} blood unit ${pad('COL', c.id)} (${c.blood_group})`);
}));

// ---- inventory ----
app.get('/api/inventory', wrap(() => {
  const rows = db.prepare(`SELECT * FROM collections WHERE status='Approved' AND expiry >= ?`).all(today());
  const inv = {}; GROUPS.forEach(g => inv[g] = { 'Whole Blood': 0, Plasma: 0, Platelets: 0, RBC: 0, total: 0 });
  rows.forEach(r => { inv[r.blood_group][r.component] += r.qty; inv[r.blood_group].total += r.qty; });
  const d = new Date(); d.setDate(d.getDate() + 5);
  const expiring = rows.filter(r => r.expiry <= d.toISOString().slice(0, 10)).map(r => ({ ...r, code: pad('COL', r.id) }));
  return { inventory: inv, expiring, total: rows.reduce((s, r) => s + r.qty, 0) };
}));

// ---- hospital blood requests ----
app.get('/api/requests', wrap(() => db.prepare('SELECT * FROM blood_requests ORDER BY id DESC').all().map(r => ({ ...r, code: pad('REQ', r.id) }))));
app.post('/api/requests', wrap(req => {
  const b = req.body; need(b, 'patient_id', 'patient_name', 'blood_group');
  db.prepare('INSERT INTO blood_requests (patient_id,patient_name,blood_group,units,emergency,requested_by,date) VALUES (?,?,?,?,?,?,?)').run(b.patient_id, b.patient_name, b.blood_group, +b.units || 1, b.emergency ? 1 : 0, 'Dr. Ramesh', today());
  audit('Blood Requested', 'Dr. Ramesh', 'Doctor', `Request for ${b.units || 1} unit(s) of ${b.blood_group} for ${b.patient_name}`);
}));
app.patch('/api/requests/:id', wrap(req => {
  const st = req.body.status; if (!['Approved', 'Rejected'].includes(st)) throw new Error('Invalid status');
  db.prepare("UPDATE blood_requests SET status=? WHERE id=? AND status='Pending'").run(st, req.params.id);
  audit(`Request ${st}`, 'Dr. Admin', 'Admin', `${pad('REQ', req.params.id)} ${st.toLowerCase()}`);
}));

// ---- issue blood ----
app.get('/api/issues', wrap(() => ({
  issues: db.prepare('SELECT i.*, r.patient_name, r.blood_group FROM issues i JOIN blood_requests r ON r.id=i.request_id ORDER BY i.id DESC').all().map(i => ({ ...i, code: pad('ISS', i.id), request_code: pad('REQ', i.request_id) })),
  pending: db.prepare("SELECT * FROM blood_requests WHERE status='Approved'").all().map(r => ({ ...r, code: pad('REQ', r.id) }))
})));
app.post('/api/issues', wrap(req => {
  const r = db.prepare("SELECT * FROM blood_requests WHERE id=? AND status='Approved'").get(req.body.request_id);
  if (!r) throw new Error('Select an approved request');
  const units = db.prepare("SELECT * FROM collections WHERE status='Approved' AND blood_group=? AND expiry>=? ORDER BY expiry LIMIT ?").all(r.blood_group, today(), r.units);
  if (units.length < r.units) throw new Error(`Only ${units.length} unit(s) of ${r.blood_group} in stock, ${r.units} required`);
  db.transaction(() => {
    units.forEach(u => db.prepare("UPDATE collections SET status='Issued' WHERE id=?").run(u.id));
    db.prepare("UPDATE blood_requests SET status='Issued' WHERE id=?").run(r.id);
    db.prepare('INSERT INTO issues (request_id,units,issued_by,date) VALUES (?,?,?,?)').run(r.id, r.units, 'Officer Kumar', today());
  })();
  audit('Blood Issued', 'Officer Kumar', 'Blood Bank Officer', `Issued ${r.units} unit(s) of ${r.blood_group} for ${r.patient_name}`);
}));

// ---- emergency requests + donor notifications ----
app.get('/api/emergency', wrap(() => db.prepare('SELECT * FROM emergency_requests ORDER BY id DESC').all().map(e => ({
  ...e, code: pad('EMR', e.id),
  notified: db.prepare('SELECT COUNT(*) c FROM notifications WHERE emergency_id=?').get(e.id).c,
  volunteers: db.prepare('SELECT d.name,d.contact,d.blood_group,d.residence FROM notifications n JOIN donors d ON d.id=n.donor_id WHERE n.emergency_id=? AND n.volunteered=1').all(e.id)
}))));
app.post('/api/emergency', wrap(req => {
  const b = req.body; need(b, 'patient_name', 'guardian_name', 'mobile', 'venue', 'blood_group');
  if (!/^\d{10}$/.test(b.mobile)) throw new Error('Mobile must be 10 digits');
  return db.transaction(() => {
    const id = db.prepare('INSERT INTO emergency_requests (patient_name,guardian_name,mobile,venue,blood_group,units) VALUES (?,?,?,?,?,?)').run(b.patient_name, b.guardian_name, b.mobile, b.venue, b.blood_group, +b.units || 1).lastInsertRowid;
    const ins = db.prepare('INSERT INTO notifications (emergency_id,donor_id,priority,blood_match) VALUES (?,?,?,?)');
    const donors = db.prepare('SELECT * FROM donors').all();
    donors.forEach(d => ins.run(id, d.id, { 'First Time': 1, Eligible: 2, Recent: 3 }[eligibility(d.last_donation)], d.blood_group === b.blood_group ? 1 : 0));
    db.prepare('INSERT INTO blood_requests (patient_id,patient_name,blood_group,units,emergency,requested_by,date) VALUES (?,?,?,?,1,?,?)').run(pad('EMR', id), b.patient_name, b.blood_group, +b.units || 1, 'Emergency Desk', today());
    audit('Emergency Request', 'Dr. Admin', 'Admin', `Emergency for ${b.patient_name} (${b.blood_group}) at ${b.venue} - notified ${donors.length} donors`);
    return { id, notified: donors.length };
  })();
}));
app.get('/api/notifications/:donorId', wrap(req => db.prepare(`SELECT n.*, e.patient_name, e.guardian_name, e.mobile, e.venue, e.blood_group, e.units, e.created_at emergency_time
  FROM notifications n JOIN emergency_requests e ON e.id=n.emergency_id WHERE n.donor_id=? ORDER BY n.blood_match DESC, e.id DESC`).all(req.params.donorId)));
app.post('/api/notifications/:id/volunteer', wrap(req => {
  const n = db.prepare('SELECT * FROM notifications WHERE id=?').get(req.params.id);
  if (!n || n.priority === 3) throw new Error('Recent donors cannot volunteer');
  db.prepare('UPDATE notifications SET volunteered=1 WHERE id=?').run(n.id);
  const d = db.prepare('SELECT name FROM donors WHERE id=?').get(n.donor_id);
  audit('Donor Volunteered', d.name, 'Donor', `Volunteered for ${pad('EMR', n.emergency_id)}`);
}));


// ---- WhatsApp: works for every blood group ----
const CC = process.env.COUNTRY_CODE || '91';
const CAN_GIVE = { 'A+': ['A+', 'A-', 'O+', 'O-'], 'A-': ['A-', 'O-'], 'B+': ['B+', 'B-', 'O+', 'O-'], 'B-': ['B-', 'O-'], 'AB+': GROUPS, 'AB-': ['A-', 'B-', 'AB-', 'O-'], 'O+': ['O+', 'O-'], 'O-': ['O-'] };
app.get('/api/emergency/:id/whatsapp', wrap(req => {
  const e = db.prepare('SELECT * FROM emergency_requests WHERE id=?').get(req.params.id);
  if (!e) throw new Error('Emergency request not found');
  const allowed = req.query.compatible === '1' ? CAN_GIVE[e.blood_group] : [e.blood_group];
  const msg = n => `🚨 URGENT BLOOD NEEDED - SRM Hospital Blood Bank\n\nHi ${n}, we urgently need ${e.units} unit(s) of ${e.blood_group} blood.\nPatient: ${e.patient_name}\nVenue: ${e.venue}\nContact: ${e.guardian_name} - ${e.mobile}\n\nIf you can donate, please reply YES and come to the venue. Thank you for saving a life 🙏`;
  const donors = db.prepare(`SELECT n.id nid, n.priority, n.whatsapp_sent, d.name, d.contact, d.blood_group, d.residence, d.type, d.department
    FROM notifications n JOIN donors d ON d.id=n.donor_id WHERE n.emergency_id=? AND n.priority<3 ORDER BY (d.blood_group=?) DESC, n.priority, d.name`).all(e.id, e.blood_group)
    .filter(r => allowed.includes(r.blood_group))
    .map(r => ({ ...r, status: r.priority === 1 ? 'First Time' : 'Eligible', link: `https://wa.me/${CC}${r.contact}?text=${encodeURIComponent(msg(r.name))}` }));
  return { emergency: { ...e, code: pad('EMR', e.id) }, donors };
}));
app.post('/api/notifications/:id/sent', wrap(req => {
  db.prepare('UPDATE notifications SET whatsapp_sent=1 WHERE id=?').run(req.params.id);
  const x = db.prepare('SELECT d.name, n.emergency_id FROM notifications n JOIN donors d ON d.id=n.donor_id WHERE n.id=?').get(req.params.id);
  if (x) audit('WhatsApp Sent', 'Dr. Admin', 'Admin', `WhatsApp alert sent to ${x.name} for ${pad('EMR', x.emergency_id)}`);
}));

// ---- audit + dashboard ----
app.get('/api/audit', wrap(() => db.prepare('SELECT * FROM audit_log ORDER BY id DESC').all()));
app.get('/api/dashboard', wrap(() => {
  const donors = db.prepare('SELECT * FROM donors').all().map(donorOut);
  const cnt = f => donors.filter(f).length;
  return {
    donors: donors.length, eligible: cnt(d => d.status !== 'Recent'),
    hostelers: cnt(d => d.residence === 'Hosteler'), dayScholars: cnt(d => d.residence === 'Day Scholar'),
    pending: db.prepare("SELECT COUNT(*) c FROM blood_requests WHERE status='Pending'").get().c,
    issuedToday: db.prepare('SELECT COALESCE(SUM(units),0) s FROM issues WHERE date=?').get(today()).s,
    emergencies: db.prepare('SELECT COUNT(*) c FROM emergency_requests').get().c
  };
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SRM Blood Bank running at http://localhost:${PORT}`));
