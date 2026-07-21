ALTER TABLE tasks ADD COLUMN do_time TEXT;
ALTER TABLE tasks ADD COLUMN duration_minutes INTEGER;
ALTER TABLE tasks ADD COLUMN rollover_from TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_do_date ON tasks(do_date);
