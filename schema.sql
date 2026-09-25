-- SRM Hospital Blood Bank - SQLite schema
CREATE TABLE IF NOT EXISTS donors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, age INTEGER, dob TEXT,
  blood_group TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Student',          -- Student | Faculty | External
  residence TEXT DEFAULT 'N/A',                  -- Hosteler | Day Scholar | N/A
  contact TEXT NOT NULL UNIQUE, email TEXT, department TEXT,
  last_donation TEXT,                            -- ISO date or NULL (never donated)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id INTEGER NOT NULL REFERENCES donors(id),
  date TEXT NOT NULL, blood_group TEXT NOT NULL, component TEXT NOT NULL,
  qty INTEGER DEFAULT 1, expiry TEXT NOT NULL,
  status TEXT DEFAULT 'Pending'                  -- Pending | Approved | Rejected | Issued
);
CREATE TABLE IF NOT EXISTS lab_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES collections(id),
  hiv TEXT, hepb TEXT, hepc TEXT, malaria TEXT, syphilis TEXT,
  result TEXT, tested_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS blood_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT, patient_name TEXT NOT NULL, blood_group TEXT NOT NULL,
  units INTEGER DEFAULT 1, emergency INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Pending',                 -- Pending | Approved | Rejected | Issued
  requested_by TEXT, date TEXT
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES blood_requests(id),
  units INTEGER, issued_by TEXT, date TEXT
);
CREATE TABLE IF NOT EXISTS emergency_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_name TEXT NOT NULL, guardian_name TEXT NOT NULL, mobile TEXT NOT NULL,
  venue TEXT NOT NULL, blood_group TEXT NOT NULL, units INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emergency_id INTEGER NOT NULL REFERENCES emergency_requests(id),
  donor_id INTEGER NOT NULL REFERENCES donors(id),
  priority INTEGER,          -- 1 first-time, 2 eligible, 3 recent (cannot volunteer)
  blood_match INTEGER,       -- 1 if donor group equals group needed
  volunteered INTEGER DEFAULT 0, whatsapp_sent INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP, action TEXT, performed_by TEXT, role TEXT, details TEXT
);
