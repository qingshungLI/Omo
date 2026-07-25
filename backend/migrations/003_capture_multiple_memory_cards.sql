ALTER TABLE memory_cards
  DROP CONSTRAINT IF EXISTS memory_cards_capture_id_key;

CREATE INDEX IF NOT EXISTS memory_cards_capture_active_idx
  ON memory_cards(capture_id, created_at ASC)
  WHERE deleted_at IS NULL;
