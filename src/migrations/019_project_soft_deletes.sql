-- Migration: 019_project_soft_deletes
-- Purpose: Convert project deletion from hard-delete to soft-delete.
-- (a) Add deleted_at and is_active columns to the projects table.
-- (b) Change ON DELETE CASCADE foreign keys on child tables that reference
--     projects(id) to ON DELETE RESTRICT, so the DB also enforces that a
--     hard delete cannot occur while child rows exist.

-- Step 1: Add soft-delete columns to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Step 2: Add index to speed up queries filtering soft-deleted rows
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects (deleted_at)
  WHERE deleted_at IS NULL;

-- Step 3: retirements — drop CASCADE, add RESTRICT
ALTER TABLE retirements
  DROP CONSTRAINT IF EXISTS retirements_project_id_fkey;

ALTER TABLE retirements
  ADD CONSTRAINT retirements_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- Step 4: sensor_readings — drop CASCADE, add RESTRICT
--         The original FK name may vary; we try both common patterns.
ALTER TABLE sensor_readings
  DROP CONSTRAINT IF EXISTS sensor_readings_project_id_fkey;

ALTER TABLE sensor_readings
  ADD CONSTRAINT sensor_readings_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- Step 5: reading_batches — drop CASCADE, add RESTRICT
ALTER TABLE reading_batches
  DROP CONSTRAINT IF EXISTS reading_batches_project_id_fkey;

ALTER TABLE reading_batches
  ADD CONSTRAINT reading_batches_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

-- Step 6: oracle_submissions — drop CASCADE, add RESTRICT
ALTER TABLE oracle_submissions
  DROP CONSTRAINT IF EXISTS oracle_submissions_project_id_fkey;

ALTER TABLE oracle_submissions
  ADD CONSTRAINT oracle_submissions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
