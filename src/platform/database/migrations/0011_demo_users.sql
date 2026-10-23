CREATE TABLE showcase_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email ~ '^[a-z0-9._%+-]+@authforge\\.demo$'),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  disabled_at timestamptz
);

CREATE TABLE showcase_user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES showcase_users(id) ON DELETE CASCADE,
  token_digest bytea NOT NULL UNIQUE,
  csrf_digest bytea NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX showcase_user_sessions_lookup_idx ON showcase_user_sessions(token_digest, expires_at) WHERE revoked_at IS NULL;
