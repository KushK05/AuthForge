CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IN ('sign_out', 'refresh_replay', 'password_reset', 'disabled')),
  FOREIGN KEY (user_id, project_id) REFERENCES users(id, project_id),
  UNIQUE (id, project_id),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX sessions_active_user_idx ON sessions (project_id, user_id, revoked_at);

CREATE TABLE refresh_token_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replay_detected_at timestamptz,
  FOREIGN KEY (user_id, project_id) REFERENCES users(id, project_id),
  FOREIGN KEY (session_id, project_id) REFERENCES sessions(id, project_id),
  UNIQUE (id, project_id),
  CHECK (absolute_expires_at > created_at)
);

CREATE INDEX refresh_token_families_active_session_idx
  ON refresh_token_families (project_id, session_id, revoked_at);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  family_id uuid NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  replaced_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (family_id, project_id) REFERENCES refresh_token_families(id, project_id),
  CHECK (expires_at > created_at)
);

CREATE INDEX refresh_tokens_active_lookup_idx
  ON refresh_tokens (project_id, token_hash)
  WHERE consumed_at IS NULL;

CREATE TABLE consumer_inbox (
  event_id uuid NOT NULL REFERENCES outbox_events(id),
  consumer_name text NOT NULL CHECK (char_length(consumer_name) BETWEEN 1 AND 120),
  lease_owner text,
  lease_expires_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, consumer_name)
);

CREATE INDEX consumer_inbox_pending_idx
  ON consumer_inbox (lease_expires_at)
  WHERE processed_at IS NULL;
