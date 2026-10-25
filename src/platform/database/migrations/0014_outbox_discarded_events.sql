-- Unsupported events stay local as terminal records, never as published events.
ALTER TABLE showcase_outbox_events ADD COLUMN discarded_at timestamptz;
UPDATE showcase_outbox_events SET discarded_at = now()
WHERE published_at IS NULL
  AND event_type IN ('showcase.session.refreshed', 'showcase.session.replay_detected');
DROP INDEX showcase_outbox_pending_idx;
CREATE INDEX showcase_outbox_pending_idx ON showcase_outbox_events (created_at)
  WHERE published_at IS NULL AND discarded_at IS NULL;
