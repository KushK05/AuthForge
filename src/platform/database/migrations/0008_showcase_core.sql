CREATE TABLE showcase_console_sessions (
  id uuid PRIMARY KEY,
  token_digest bytea NOT NULL UNIQUE,
  csrf_digest bytea NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX showcase_console_sessions_active_idx
  ON showcase_console_sessions (token_digest)
  WHERE revoked_at IS NULL;

CREATE TABLE showcase_api_keys (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  prefix text NOT NULL CHECK (char_length(prefix) BETWEEN 4 AND 32),
  secret_digest bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX showcase_api_keys_active_idx
  ON showcase_api_keys (secret_digest)
  WHERE revoked_at IS NULL;

CREATE TABLE showcase_sessions (
  id uuid PRIMARY KEY,
  api_key_id uuid NOT NULL REFERENCES showcase_api_keys(id),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 256),
  token_digest bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX showcase_sessions_owner_idx ON showcase_sessions (api_key_id, created_at DESC);
CREATE INDEX showcase_sessions_active_token_idx
  ON showcase_sessions (api_key_id, token_digest)
  WHERE revoked_at IS NULL;

CREATE TABLE showcase_outbox_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  event_version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  published_at timestamptz
);

CREATE INDEX showcase_outbox_pending_idx
  ON showcase_outbox_events (created_at)
  WHERE published_at IS NULL;

CREATE TABLE showcase_worker_inbox (
  event_id uuid NOT NULL,
  consumer_name text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, consumer_name)
);
