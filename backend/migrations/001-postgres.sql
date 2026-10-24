CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', created_at TEXT NOT NULL,
  access_status TEXT NOT NULL DEFAULT 'onboarded', is_enabled INTEGER NOT NULL DEFAULT 1,
  first_access_at TEXT, last_access_at TEXT, session_version INTEGER NOT NULL DEFAULT 0,
  invited_by TEXT, invited_at TEXT, invite_expires_at TEXT, delivery_status TEXT,
  password_fingerprint TEXT, business_slug TEXT, business_json TEXT, business_amendment_json TEXT
);
CREATE TABLE IF NOT EXISTS case_definitions (
  slug TEXT PRIMARY KEY, position INTEGER NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL, period TEXT NOT NULL, sector TEXT NOT NULL, seed_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_case_state (
  user_id TEXT NOT NULL REFERENCES users(id), case_slug TEXT NOT NULL REFERENCES case_definitions(slug),
  is_active INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, case_slug)
);
CREATE TABLE IF NOT EXISTS access_audit (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL UNIQUE, email TEXT NOT NULL, binding TEXT NOT NULL,
  code_hash TEXT NOT NULL, salt TEXT NOT NULL, expires_at BIGINT NOT NULL, sent_at BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS otp_delivery_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, sent_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_delivery_email_time ON otp_delivery_log(email, sent_at);
CREATE INDEX IF NOT EXISTS otp_delivery_user_time ON otp_delivery_log(user_id, sent_at);
CREATE INDEX IF NOT EXISTS case_state_user_active ON user_case_state(user_id, is_active);
