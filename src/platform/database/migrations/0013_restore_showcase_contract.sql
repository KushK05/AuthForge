-- Remove excluded rotating-token state without rewriting historical migrations.
ALTER TABLE showcase_sessions DROP COLUMN previous_token_digest;
ALTER TABLE showcase_user_sessions ADD CONSTRAINT showcase_user_session_expiry CHECK (expires_at > created_at);
