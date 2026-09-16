-- Optional media for rich trivia questions. Existing text-only questions stay
-- valid; the columns let the same board render images, sound clues, and video.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS audio_text text,
  ADD COLUMN IF NOT EXISTS video_url text;

NOTIFY pgrst, 'reload schema';
