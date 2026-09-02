CREATE TABLE IF NOT EXISTS quality_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cases TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
