ALTER TABLE showcase_users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE showcase_user_email_actions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES showcase_users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz
);

CREATE INDEX showcase_user_email_actions_active_idx
  ON showcase_user_email_actions (user_id, purpose, expires_at)
  WHERE consumed_at IS NULL;
