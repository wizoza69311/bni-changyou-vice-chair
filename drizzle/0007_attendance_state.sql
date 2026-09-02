CREATE TABLE IF NOT EXISTS attendance_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  records TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
