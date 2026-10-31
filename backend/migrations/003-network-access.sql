CREATE TABLE IF NOT EXISTS network_devices (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', requested_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL, approved_at BIGINT, approved_by TEXT, last_seen_at BIGINT,
 requested_ip TEXT NOT NULL
);
