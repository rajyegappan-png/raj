const express = require('express'), cors = require('cors'), path = require('path'), Database = require('better-sqlite3');
const app = express(), db = new Database(path.join(__dirname, 'smartroad.db'));
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';          // set a real key before deploying
const PORT = process.env.PORT || 3000;

db.exec(`
CREATE TABLE IF NOT EXISTS road_issues (id INTEGER PRIMARY KEY, road TEXT, type TEXT, severity TEXT, description TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS accidents (id INTEGER PRIMARY KEY, location TEXT, type TEXT, severity TEXT, vehicles INTEGER, injuries TEXT, description TEXT, phone TEXT, status TEXT DEFAULT 'Reported', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS complaints (id INTEGER PRIMARY KEY, name TEXT, email TEXT, category TEXT, location TEXT, description TEXT, status TEXT DEFAULT 'Pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY, rating INTEGER, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY, name TEXT, email TEXT, subject TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS emergency_contacts (id INTEGER PRIMARY KEY, name TEXT, number TEXT, description TEXT, icon TEXT);
`);
if (!db.prepare('SELECT COUNT(*) c FROM emergency_contacts').get().c) {
  const ins = db.prepare('INSERT INTO emergency_contacts (name, number, description, icon) VALUES (?,?,?,?)');
  [['National Emergency', '112', 'Single emergency number for police, fire and medical help', '🆘'],
   ['Police', '100', 'Crime, threats and traffic law enforcement', '👮'],
   ['Ambulance', '108', 'Medical emergencies and accident victims', '🚑'],
   ['Fire & Rescue', '101', 'Fire, vehicle fire and rescue operations', '🚒'],
   ['Highway Helpline', '1033', 'Help for breakdowns and incidents on national highways', '🛣'],
   ['Road Accident Emergency', '1073', 'Report road accidents and request assistance', '⚠']].forEach(r => ins.run(...r));
}

app.use(cors()); app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const missing = (b, fields) => fields.filter(f => !clean(b[f])).join(', ');
const oneOf = (v, list) => list.includes(v);
const admin = (req, res, next) => req.get('x-admin-key') === ADMIN_KEY ? next() : res.status(401).json({ error: 'Admin key required' });
const bad = (res, msg) => res.status(400).json({ error: msg });
const ref = (p, id) => p + '-' + String(id).padStart(5, '0');
const idOf = r => parseInt(String(r).split('-')[1], 10);
const SEV = ['Low', 'Medium', 'High', 'Critical'];

// ---- Road Condition
app.get('/api/road-issues', (req, res) => res.json(db.prepare('SELECT id, road, type, severity, description, created_at FROM road_issues ORDER BY id DESC LIMIT 100').all()));
app.post('/api/road-issues', (req, res) => {
  const b = req.body, m = missing(b, ['road', 'type', 'severity']);
  if (m) return bad(res, 'Missing: ' + m);
  if (!oneOf(b.severity, SEV)) return bad(res, 'Invalid severity');
  const r = db.prepare('INSERT INTO road_issues (road, type, severity, description) VALUES (?,?,?,?)').run(clean(b.road, 120), clean(b.type, 60), b.severity, clean(b.description, 500));
  res.status(201).json({ id: r.lastInsertRowid });
});

// ---- Accident Reporting
app.post('/api/accidents', (req, res) => {
  const b = req.body, m = missing(b, ['location', 'type', 'severity', 'description']);
  if (m) return bad(res, 'Missing: ' + m);
  if (!oneOf(b.severity, SEV)) return bad(res, 'Invalid severity');
  const v = Math.max(1, Math.min(50, parseInt(b.vehicles) || 1));
  const r = db.prepare('INSERT INTO accidents (location, type, severity, vehicles, injuries, description, phone) VALUES (?,?,?,?,?,?,?)')
    .run(clean(b.location, 200), clean(b.type, 60), b.severity, v, b.injuries === 'Yes' ? 'Yes' : 'No', clean(b.description, 1000), clean(b.phone, 20));
  res.status(201).json({ reference: ref('ACC', r.lastInsertRowid) });
});
app.get('/api/accidents', (req, res) =>   // public list: no phone numbers or descriptions
  res.json(db.prepare('SELECT id, location, type, severity, status, created_at FROM accidents ORDER BY id DESC LIMIT 20').all().map(a => ({ ...a, reference: ref('ACC', a.id) }))));
app.patch('/api/accidents/:ref/status', admin, (req, res) => {
  if (!oneOf(req.body.status, ['Reported', 'Responding', 'Resolved'])) return bad(res, 'Invalid status');
  const r = db.prepare('UPDATE accidents SET status = ? WHERE id = ?').run(req.body.status, idOf(req.params.ref));
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
});

// ---- Complaint & Feedback
app.post('/api/complaints', (req, res) => {
  const b = req.body, m = missing(b, ['name', 'email', 'category', 'description']);
  if (m) return bad(res, 'Missing: ' + m);
  if (!/^\S+@\S+\.\S+$/.test(clean(b.email))) return bad(res, 'Invalid email');
  const r = db.prepare('INSERT INTO complaints (name, email, category, location, description) VALUES (?,?,?,?,?)')
    .run(clean(b.name, 100), clean(b.email, 120), clean(b.category, 60), clean(b.location, 200), clean(b.description, 1000));
  res.status(201).json({ reference: ref('CMP', r.lastInsertRowid) });
});
app.get('/api/complaints/track/:ref', (req, res) => {          // anyone with the reference can see status only
  const c = db.prepare('SELECT category, location, status, created_at FROM complaints WHERE id = ?').get(idOf(req.params.ref));
  c ? res.json(c) : res.status(404).json({ error: 'No complaint found for this reference' });
});
app.get('/api/complaints', admin, (req, res) => res.json(db.prepare('SELECT * FROM complaints ORDER BY id DESC').all()));
app.patch('/api/complaints/:ref/status', admin, (req, res) => {
  if (!oneOf(req.body.status, ['Pending', 'In Progress', 'Resolved', 'Rejected'])) return bad(res, 'Invalid status');
  const r = db.prepare('UPDATE complaints SET status = ? WHERE id = ?').run(req.body.status, idOf(req.params.ref));
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
});
app.post('/api/feedback', (req, res) => {
  const rating = parseInt(req.body.rating), msg = clean(req.body.message, 1000);
  if (!(rating >= 1 && rating <= 5) || !msg) return bad(res, 'Rating (1-5) and message are required');
  db.prepare('INSERT INTO feedback (rating, message) VALUES (?,?)').run(rating, msg);
  res.status(201).json({ ok: true });
});
app.get('/api/feedback', admin, (req, res) => res.json(db.prepare('SELECT * FROM feedback ORDER BY id DESC').all()));

// ---- Emergency Services + Contact Us
app.get('/api/emergency', (req, res) => res.json(db.prepare('SELECT name, number, description, icon FROM emergency_contacts ORDER BY id').all()));
app.post('/api/contact', (req, res) => {
  const b = req.body, m = missing(b, ['name', 'email', 'subject', 'message']);
  if (m) return bad(res, 'Missing: ' + m);
  if (!/^\S+@\S+\.\S+$/.test(clean(b.email))) return bad(res, 'Invalid email');
  db.prepare('INSERT INTO contact_messages (name, email, subject, message) VALUES (?,?,?,?)').run(clean(b.name, 100), clean(b.email, 120), clean(b.subject, 150), clean(b.message, 2000));
  res.status(201).json({ ok: true });
});
app.get('/api/contact', admin, (req, res) => res.json(db.prepare('SELECT * FROM contact_messages ORDER BY id DESC').all()));


// ---- Traffic, road segments and routes (seeded demo data, served from the database)
db.exec(`
CREATE TABLE IF NOT EXISTS traffic (id INTEGER PRIMARY KEY, road TEXT, district TEXT, level TEXT, speed INTEGER, delay INTEGER);
CREATE TABLE IF NOT EXISTS road_segments (id INTEGER PRIMARY KEY, road TEXT, from_area TEXT, to_area TEXT, type TEXT, severity TEXT, reports INTEGER, usage INTEGER);
`);
if (!db.prepare('SELECT COUNT(*) c FROM traffic').get().c) {
  const t = db.prepare('INSERT INTO traffic (road, district, level, speed, delay) VALUES (?,?,?,?,?)');
  [['Anna Salai','Chennai','Heavy',18,17],['OMR','Chennai','Moderate',34,9],['Mount Road','Chennai','Heavy',21,14],['Avinashi Road','Coimbatore','Low',48,4],
   ['Trichy Road','Coimbatore','Moderate',31,8],['KK Nagar Road','Madurai','Low',45,5],['Salem Bypass','Salem','Moderate',36,7],['Central Bus Stand Road','Tiruchirappalli','Low',43,4]].forEach(r => t.run(...r));
}
if (!db.prepare('SELECT COUNT(*) c FROM road_segments').get().c) {
  const s = db.prepare('INSERT INTO road_segments (road, from_area, to_area, type, severity, reports, usage) VALUES (?,?,?,?,?,?,?)');
  [['MG Road','Central','Market','Pothole','High',8,92],['Park Road','Central','Park','Waterlogging','Medium',5,76],['Station Road','Station','Market','Construction','High',6,81],
   ['Ring Road','North','South','Blocked Road','Critical',10,88],['Anna Salai','Guindy','Teynampet','Damaged Road','Medium',4,95]].forEach(r => s.run(...r));
}
const GRAPH = {
  'Central': [['Guindy',7],['T Nagar',5]], 'Guindy': [['Central',7],['T Nagar',4],['OMR',10]], 'T Nagar': [['Central',5],['Guindy',4],['OMR',8]], 'OMR': [['Guindy',10],['T Nagar',8]],
  'Gandhipuram': [['RS Puram',4],['Airport',8]], 'RS Puram': [['Gandhipuram',4],['Airport',6]], 'Airport': [['Gandhipuram',8],['RS Puram',6]],
  'Mattuthavani': [['KK Nagar',5],['Periyar',7]], 'KK Nagar': [['Mattuthavani',5],['Periyar',4]], 'Periyar': [['Mattuthavani',7],['KK Nagar',4]],
  'Salem Central': [['Fairlands',4],['Hasthampatti',6]], 'Fairlands': [['Salem Central',4],['Hasthampatti',3]], 'Hasthampatti': [['Salem Central',6],['Fairlands',3]]
};
function dijkstra(start, end) {
  const nodes = Object.keys(GRAPH), dist = {}, prev = {}, seen = new Set();
  nodes.forEach(n => dist[n] = Infinity);
  if (!(start in GRAPH) || !(end in GRAPH)) return null;
  dist[start] = 0;
  while (seen.size < nodes.length) {
    let u = null; nodes.forEach(n => { if (!seen.has(n) && (u === null || dist[n] < dist[u])) u = n; });
    if (u === null || dist[u] === Infinity) break;
    seen.add(u); if (u === end) break;
    GRAPH[u].forEach(([v, w]) => { if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } });
  }
  if (dist[end] === Infinity) return null;
  const path = []; let cur = end;
  while (cur) { path.unshift(cur); if (cur === start) break; cur = prev[cur]; }
  return { path, cost: dist[end] };
}
app.get('/api/traffic', (req, res) => res.json(db.prepare('SELECT road, district, level, speed, delay FROM traffic ORDER BY id').all()));
app.get('/api/road-check', (req, res) => {
  const f = clean(req.query.from, 80).toLowerCase(), t = clean(req.query.to, 80).toLowerCase();
  if (!f || !t) return bad(res, 'from and to are required');
  const segments = db.prepare('SELECT road, from_area, to_area, type, severity, reports FROM road_segments').all();
  const matches = value => value.toLowerCase().includes(f) || value.toLowerCase().includes(t);
  const segmentIssues = segments.filter(x =>
    matches(x.from_area) || matches(x.to_area) || matches(x.road) ||
    (x.road.toLowerCase().includes(f) && x.road.toLowerCase().includes(t)));
  const reportedIssues = db.prepare('SELECT road, type, severity FROM road_issues').all()
    .filter(x => matches(x.road))
    .map(x => ({ ...x, from_area: '', to_area: '', reports: 1 }));
  res.json([...segmentIssues, ...reportedIssues]);
});
app.get('/api/road-priority', (req, res) => {
  const sev = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  const rows = db.prepare('SELECT road, type, severity, reports, usage FROM road_segments').all();
  const issues = db.prepare('SELECT road, type, severity FROM road_issues').all();
  issues.forEach(i => {
    const e = rows.find(r => r.road.toLowerCase() === i.road.toLowerCase());
    e ? e.reports++ : rows.push({ road: i.road, type: i.type, severity: i.severity, reports: 1, usage: 50 });
  });
  const ranked = rows.map(r => ({ ...r, score: Math.round(r.usage * 0.4 + r.reports * 4 + (sev[r.severity] || 1) * 10) })).sort((a, b) => b.score - a.score);
  const seg = db.prepare('SELECT severity, reports FROM road_segments').all();
  res.json({
    rows: ranked,
    total: issues.length + seg.reduce((a, b) => a + b.reports, 0),
    high: seg.filter(x => ['High', 'Critical'].includes(x.severity)).length + issues.filter(x => ['High', 'Critical'].includes(x.severity)).length
  });
});
app.post('/api/route', (req, res) => {
  const from = clean(req.body.from, 80), to = clean(req.body.to, 80);
  if (!from || !to) return bad(res, 'from and to are required');
  const recommended = dijkstra(from, to);
  const alternatives = recommended ? [...new Set((GRAPH[from] || []).map(x => x[0]))].map(n => dijkstra(n, to)).filter(Boolean).sort((a, b) => a.cost - b.cost).slice(0, 2) : [];
  res.json({ recommended, alternatives });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(PORT, () => console.log('Smart Road running at http://localhost:' + PORT));
