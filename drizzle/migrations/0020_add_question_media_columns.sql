-- MIGRATION 0020: ADD MISSING QUESTION MEDIA COLUMNS
-- Ensures public.questions has all required optional media columns:
-- image_url, audio_url, audio_text, video_url.
-- Also ensures public.room_questions contains these columns for full compatibility.

-- 1. Ensure public.questions has all media columns (nullable, without modifying existing rows)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_text text,
  ADD COLUMN IF NOT EXISTS video_url text;

-- 2. Ensure public.room_questions has all media columns (nullable, without dropping/recreating table)
ALTER TABLE public.room_questions
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_text text,
  ADD COLUMN IF NOT EXISTS video_url text;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
