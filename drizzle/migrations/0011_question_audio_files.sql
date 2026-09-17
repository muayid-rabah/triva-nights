-- Optional direct audio-file URL for questions.  It lets the game play a
-- bundled or Storage-hosted recording before falling back to browser speech.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS audio_url text;

NOTIFY pgrst, 'reload schema';
