ALTER TABLE showcase_sessions
  ADD COLUMN previous_token_digest bytea;

CREATE UNIQUE INDEX showcase_sessions_previous_token_idx
  ON showcase_sessions (previous_token_digest)
  WHERE previous_token_digest IS NOT NULL;
