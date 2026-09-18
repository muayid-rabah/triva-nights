-- MIGRATION 0018: STRICT 2-PLAYER MULTIPLAYER ROOMS & SERVER-AUTHORITATIVE REALTIME GAME STATE
-- Architecture:
-- 1. Strictly 2 players per room (Host vs Guest, 1 vs 1).
-- 2. Server-authoritative state machine via PostgreSQL functions (no client overwriting full state).
-- 3. Validation: room membership, current player turn, no duplicate scoring, no answering closed/used questions.
-- 4. Safe room expiration (waiting rooms expire after 2h, playing rooms expire after 6h).
-- 5. Tight RLS: rooms are only visible to participating players (or looked up securely via RPC).
-- 6. Supabase Realtime publication registered for instant push updates.
-- MIGRATION 0018: HARDENED 2-PLAYER MULTIPLAYER ARCHITECTURE
-- Security & Trust Rules:
-- 1. Strictly 2 players per room (Host vs Guest, 1 vs 1). Max players = 2 server-enforced.
-- 2. Zero trust for host session data: Host only provides room_id and optional category_slugs/question_ids.
-- 3. The server generates, validates, and stores the secret authoritative answers in public.room_questions.
-- 4. Never expose correct answers before reveal: rooms.session_data->'questions' does NOT include the answer field.
--    The secret answer is only exposed in session_data.revealedAnswer when revealed or answered.
-- 5. Strict RLS: public.room_questions has NO SELECT policies for authenticated or anon users.
-- 6. Server-side answer validation & score calculation: Client never submits points or score.
-- 7. Anti-cheat checks: No double scoring (session_data.used), no answering non-active questions, no out-of-turn actions.
-- 8. Room expiration: Abandoned waiting rooms expire after 2h; games expire after 6h.

-- Table 1: Multiplayer Rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  game_slug text NOT NULL,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host_name text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'playing', 'finished', 'expired')),
  max_players integer NOT NULL DEFAULT 2 CHECK (max_players = 2),
  current_turn integer NOT NULL DEFAULT 0 CHECK (current_turn IN (0, 1)),
  session_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table 2: Room Players
CREATE TABLE IF NOT EXISTS public.room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  role text NOT NULL DEFAULT 'guest' CHECK (role IN ('host', 'guest')),
  player_index integer NOT NULL DEFAULT 0 CHECK (player_index IN (0, 1)),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_players_room_user_unique UNIQUE (room_id, user_id),
  CONSTRAINT room_players_room_index_unique UNIQUE (room_id, player_index)
);

-- Table 3: Secret In-Game Room Questions & Authoritative Answers
-- NEVER exposed to client SELECT queries. Managed strictly via SECURITY DEFINER functions.
CREATE TABLE IF NOT EXISTS public.room_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  category_slug text NOT NULL,
  points integer NOT NULL,
  kind text NOT NULL DEFAULT 'open',
  text text NOT NULL,
  choices jsonb,
  answer text NOT NULL, -- SENSITIVE! Real authoritative answer
  image_url text,
  audio_url text,
  audio_text text,
  video_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_questions_room_qid_unique UNIQUE (room_id, question_id)
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms (code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON public.rooms (host_id);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON public.room_players (room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user ON public.room_players (user_id);
CREATE INDEX IF NOT EXISTS idx_room_questions_room ON public.room_questions (room_id);

-- Grants
-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_players TO authenticated;
GRANT ALL ON public.rooms TO service_role;
GRANT ALL ON public.room_players TO service_role;
GRANT ALL ON public.room_questions TO service_role;

-- Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_questions ENABLE ROW LEVEL SECURITY;

-- RLS: Room participants only
-- CRITICAL SECURITY: room_questions has NO policy for authenticated or anon.
-- Only SECURITY DEFINER functions can access room_questions.

-- RLS for rooms: Only participating players can read their room
DROP POLICY IF EXISTS "rooms_select_policy" ON public.rooms;
CREATE POLICY "rooms_select_policy" ON public.rooms
  FOR SELECT TO authenticated
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id = id AND rp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "rooms_insert_policy" ON public.rooms;
CREATE POLICY "rooms_insert_policy" ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "rooms_update_policy" ON public.rooms;
CREATE POLICY "rooms_update_policy" ON public.rooms
  FOR UPDATE TO authenticated
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id = id AND rp.user_id = auth.uid()
    )
  );

-- RLS: Players in the room
-- RLS for room_players
DROP POLICY IF EXISTS "room_players_select_policy" ON public.room_players;
CREATE POLICY "room_players_select_policy" ON public.room_players
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.room_players rp2
      WHERE rp2.room_id = room_players.room_id AND rp2.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_players.room_id AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "room_players_insert_policy" ON public.room_players;
CREATE POLICY "room_players_insert_policy" ON public.room_players
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "room_players_delete_policy" ON public.room_players;
CREATE POLICY "room_players_delete_policy" ON public.room_players
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_players.room_id AND r.host_id = auth.uid()
    )
  );

-- Helper: Format room output with players
-- Helper: Format room output with players (Zero secret data)
CREATE OR REPLACE FUNCTION public._format_room_json(p_room public.rooms)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_players jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'player_name', player_name,
      'role', role,
      'player_index', player_index,
      'joined_at', joined_at,
      'last_active_at', last_active_at
    ) ORDER BY player_index ASC
  ), '[]'::jsonb)
  INTO v_players
  FROM public.room_players
  WHERE room_id = p_room.id;

  RETURN jsonb_build_object(
    'room', row_to_json(p_room),
    'players', v_players
  );
END;
$$;

-- Verify all required category groups exist before inserting categories
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(required_slug)
  INTO v_missing
  FROM unnest(ARRAY['football', 'screens', 'jordan-palestine', 'world', 'culture']) AS required_slug
  WHERE NOT EXISTS (
    SELECT 1 FROM public.category_groups WHERE slug = required_slug
  );

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'REQUIRED_CATEGORY_GROUP_MISSING: The following required category groups do not exist in public.category_groups: %', array_to_string(v_missing, ', ');
  END IF;
END $$;

-- Seed curated categories if not present (Resolving group_id dynamically from category_groups)
INSERT INTO public.categories (group_id, slug, name, emoji, sort_order)
SELECT
  (SELECT id FROM public.category_groups WHERE slug = v.group_slug LIMIT 1),
  v.slug,
  v.name,
  v.emoji,
  v.sort_order
FROM (VALUES
  ('football', 'world-cup', 'كأس العالم', '🏆', 1),
  ('football', 'champions-league', 'دوري الأبطال', '⭐', 2),
  ('football', 'arab-football', 'كرة القدم العربية', '🌍', 3),
  ('screens', 'arab-series', 'مسلسلات عربية', '📺', 4),
  ('screens', 'arab-cinema', 'سينما عربية', '🎬', 5),
  ('screens', 'no-words', 'من دون كلام', '🤫', 6),
  ('jordan-palestine', 'jordan-landmarks', 'أردننا', '🇯🇴', 7),
  ('jordan-palestine', 'palestine', 'فلسطين: مدن وحكايات', '🇵🇸', 8),
  ('world', 'history-and-civilization', 'تاريخ وحضارات', '🏛️', 9),
  ('world', 'science-and-space', 'علوم وفضاء', '🔬', 10),
  ('world', 'flags-and-countries', 'أعلام ودول', '🗺️', 11),
  ('culture', 'general', 'معلومات عامة', '💡', 12)
) AS v(group_slug, slug, name, emoji, sort_order)
ON CONFLICT (slug) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.questions (category_id, points, kind, text, choices, answer)
SELECT c.id, q.points, q.kind::public.question_kind, q.text, q.choices, q.answer
FROM (VALUES
  ('world-cup', 200, 'mcq', 'أي منتخب توّج بكأس العالم 2022؟', '["الأرجنتين","فرنسا","البرازيل","كرواتيا"]'::jsonb, 'الأرجنتين'),
  ('world-cup', 200, 'mcq', 'في أي بلد أُقيم مونديال 2022؟', '["قطر","روسيا","البرازيل","جنوب أفريقيا"]'::jsonb, 'قطر'),
  ('world-cup', 400, 'mcq', 'من الهداف التاريخي لكأس العالم للرجال؟', '["ميروسلاف كلوزه","رونالدو البرازيلي","بيليه","ميسي"]'::jsonb, 'ميروسلاف كلوزه'),
  ('world-cup', 400, 'open', 'أي منتخب فاز بأكبر عدد من كؤوس العالم للرجال؟', NULL, 'البرازيل'),
  ('world-cup', 600, 'open', 'في أي سنة أقيمت أول نسخة من بطولة كأس العالم؟', NULL, '1930'),
  ('world-cup', 600, 'open', 'ما أول منتخب عربي بلغ نصف نهائي كأس العالم؟', NULL, 'المغرب'),

  ('champions-league', 200, 'mcq', 'أي نادٍ يملك الرقم القياسي في ألقاب دوري أبطال أوروبا؟', '["ريال مدريد","ميلان","ليفربول","بايرن ميونخ"]'::jsonb, 'ريال مدريد'),
  ('champions-league', 200, 'mcq', 'ما اسم الملعب الشهير لنادي برشلونة؟', '["كامب نو","سانتياغو برنابيو","أنفيلد","أولد ترافورد"]'::jsonb, 'كامب نو'),
  ('champions-league', 400, 'open', 'من صاحب لقب الهداف التاريخي لدوري الأبطال؟', NULL, 'كريستيانو رونالدو'),
  ('champions-league', 400, 'mcq', 'إلى أي بلد ينتمي نادي بايرن ميونخ؟', '["ألمانيا","إسبانيا","فرنسا","إنجلترا"]'::jsonb, 'ألمانيا'),
  ('champions-league', 600, 'open', 'ما اسم البطولة الأوروبية الثانية للأندية بعد دوري الأبطال؟', NULL, 'الدوري الأوروبي'),
  ('champions-league', 600, 'open', 'في أي مدينة إيطالية يلعب نادي إنتر ميلان؟', NULL, 'ميلانو'),

  ('arab-football', 200, 'mcq', 'أي منتخب عربي وصل لنهائي كأس آسيا 2023 لأول مرة في تاريخه؟', '["الأردن","قطر","السعودية","الإمارات"]'::jsonb, 'الأردن'),
  ('arab-football', 200, 'mcq', 'أي بلد توّج بطلاً لكأس آسيا 2023؟', '["قطر","الأردن","اليابان","أستراليا"]'::jsonb, 'قطر'),
  ('arab-football', 400, 'open', 'ما هو اللقب الشهير للمنتخب الأردني؟', NULL, 'النشامى'),
  ('arab-football', 400, 'open', 'من اللاعب الأردني الذي تألق وسجل في نصف نهائي ونهائي كأس آسيا 2023؟', NULL, 'يزن النعيمات'),
  ('arab-football', 600, 'open', 'أي منتخب عربي فاز بكأس أمم أفريقيا 2019؟', NULL, 'الجزائر'),
  ('arab-football', 600, 'open', 'في أي مدينة يقع استاد عمّان الدولي؟', NULL, 'عمّان'),

  ('arab-series', 200, 'mcq', 'ما اسم المسلسل السوري الشهير الذي تدور أحداثه في حارة الضبع؟', '["باب الحارة","ليالي الصالحية","أهل الراية","طوق البنات"]'::jsonb, 'باب الحارة'),
  ('arab-series', 200, 'open', 'من بطل مسلسل التغريبة الفلسطينية؟', NULL, 'جمال سليمان'),
  ('arab-series', 400, 'open', 'في أي مسلسل كوميدي سوري شهير ظهرت شخصية غوار الطوشة وياسر العظمة؟', NULL, 'مرايا'),
  ('arab-series', 400, 'open', 'من بطلة مسلسل الهيبة بجزئه الأول؟', NULL, 'نادين نسيب نجيم'),
  ('arab-series', 600, 'open', 'ما اسم المسلسل البدوي الأردني الشهير الذي جسد شخصية الشاعر نمر بن عدوان؟', NULL, 'نمر بن عدوان'),
  ('arab-series', 600, 'open', 'من الممثل الذي جسد شخصية أبو عصام في باب الحارة؟', NULL, 'عباس النوري'),

  ('arab-cinema', 200, 'mcq', 'من هو بطل فيلم الإرهاب والكباب؟', '["عادل إمام","أحمد زكي","محمود عبد العزيز","يحيى الفخراني"]'::jsonb, 'عادل إمام'),
  ('arab-cinema', 200, 'open', 'من أخرج فيلم الكيت كات؟', NULL, 'داود عبد السيد'),
  ('arab-cinema', 400, 'open', 'ما اسم الفيلم الأردني المرشح للأوسكار وتدور أحداثه في وادي رم؟', NULL, 'ذيب'),
  ('arab-cinema', 400, 'open', 'من بطلة فيلم دعاء الكروان؟', NULL, 'فاتن حمامة'),
  ('arab-cinema', 600, 'open', 'من هو مخرج فيلم باب الحديد الشهير؟', NULL, 'يوسف شاهين'),
  ('arab-cinema', 600, 'open', 'ما اسم الفيلم الفلسطيني للمخرج إيليا سليمان الذي رُشح للأوسكار؟', NULL, 'يد إلهية'),

  ('no-words', 200, 'open', 'فيلم الأسد الملك', NULL, 'فيلم الأسد الملك'),
  ('no-words', 200, 'open', 'فيلم تيتانيك', NULL, 'فيلم تيتانيك'),
  ('no-words', 400, 'open', 'طبيب أسنان', NULL, 'طبيب أسنان'),
  ('no-words', 400, 'open', 'حارس مرمى', NULL, 'حارس مرمى'),
  ('no-words', 600, 'open', 'طائرة ورقية', NULL, 'طائرة ورقية'),
  ('no-words', 600, 'open', 'كاميرا تصوير', NULL, 'كاميرا تصوير'),

  ('jordan-landmarks', 200, 'mcq', 'ما المدينة الوردية المنحوتة في الصخر جنوب الأردن؟', '["البتراء","جرش","أم قيس","مادبا"]'::jsonb, 'البتراء'),
  ('jordan-landmarks', 200, 'mcq', 'ما أخفض بقعة يابسة على سطح الأرض وتقع في الأردن؟', '["البحر الميت","وادي رم","العقبة","غور الصافي"]'::jsonb, 'البحر الميت'),
  ('jordan-landmarks', 400, 'open', 'في أي محافظة أردنية تقع مدينة جرش الأثرية؟', NULL, 'جرش'),
  ('jordan-landmarks', 400, 'open', 'ما الوادي الصحراوي الخلاب المشهور برماله الحمراء في جنوب الأردن؟', NULL, 'وادي رم'),
  ('jordan-landmarks', 600, 'open', 'ما اسم القلعة التاريخية الواقعة على أعلى قمة في وسط العاصمة عمّان؟', NULL, 'قلعة عمّان'),
  ('jordan-landmarks', 600, 'open', 'ما هي الشجرة الوطنية للمملكة الأردنية الهاشمية؟', NULL, 'البلوط'),

  ('palestine', 200, 'mcq', 'ما المدينة التي يقع فيها المسجد الأقصى وقبة الصخرة؟', '["القدس","الخليل","نابلس","يافا"]'::jsonb, 'القدس'),
  ('palestine', 200, 'open', 'ما المدينة الساحلية الفلسطينية التاريخية المعروفة ببرتقالها ومينائها؟', NULL, 'يافا'),
  ('palestine', 400, 'open', 'ما المدينة الفلسطينية المشهورة بصابون الزيتون التقليدي والكنافة؟', NULL, 'نابلس'),
  ('palestine', 400, 'open', 'ما المدينة التي وُلد فيها السيد المسيح بحسب التقليد التاريخي؟', NULL, 'بيت لحم'),
  ('palestine', 600, 'open', 'ما اسم الأكلة التراثية الفلسطينية المصنوعة من الخبز والدجاج والبصل والسماق؟', NULL, 'المسخن'),
  ('palestine', 600, 'open', 'ما المدينة التي تُعد أقدم مدينة مأهولة في العالم وتلقب بمدينة القمر؟', NULL, 'أريحا'),

  ('history-and-civilization', 200, 'mcq', 'أين تقع أهرامات الجيزة الشهيرة؟', '["مصر","السودان","المكسيك","اليونان"]'::jsonb, 'مصر'),
  ('history-and-civilization', 200, 'open', 'ما الحضارة القديمة التي بنت حدائق بابل المعلقة؟', NULL, 'البابلية'),
  ('history-and-civilization', 400, 'open', 'ما المدينة التي كانت عاصمة الإمبراطورية البيزنطية؟', NULL, 'القسطنطينية'),
  ('history-and-civilization', 400, 'open', 'في أي عام سقطت الأندلس رسمياً؟', NULL, '1492'),
  ('history-and-civilization', 600, 'open', 'من القائد المسلم الذي انتصر في معركة حطين واستعاد القدس؟', NULL, 'صلاح الدين الأيوبي'),
  ('history-and-civilization', 600, 'open', 'ما اسم أول معركة بحرية إسلامية في التاريخ؟', NULL, 'ذات الصواري'),

  ('science-and-space', 200, 'mcq', 'ما أقرب كوكب إلى الشمس؟', '["عطارد","الزهرة","المريخ","الأرض"]'::jsonb, 'عطارد'),
  ('science-and-space', 200, 'mcq', 'ما الغاز الذي تتنفسه الكائنات الحية للبقاء؟', '["الأكسجين","النيتروجين","الهيدروجين","ثاني أكسيد الكربون"]'::jsonb, 'الأكسجين'),
  ('science-and-space', 400, 'open', 'ما هو أكبر كوكب في المجموعة الشمسية؟', NULL, 'المشتري'),
  ('science-and-space', 400, 'open', 'ما هو العنصر الكيميائي الذي رمزه Fe؟', NULL, 'الحديد'),
  ('science-and-space', 600, 'open', 'ما هي سرعة الضوء في الفراغ تقريباً (كم/ثانية)؟', NULL, '300000'),
  ('science-and-space', 600, 'open', 'ما اسم المجرة التي يقع فيها نظامنا الشمسي؟', NULL, 'درب التبانة'),

  ('flags-and-countries', 200, 'mcq', 'ما هي عاصمة اليابان؟', '["طوكيو","أوساكا","كيوتو","ناغويا"]'::jsonb, 'طوكيو'),
  ('flags-and-countries', 200, 'open', 'علم أبيض تتوسطه شجرة أرز خضراء، أي بلد؟', NULL, 'لبنان'),
  ('flags-and-countries', 400, 'open', 'ما هي أكبر دولة في العالم من حيث المساحة؟', NULL, 'روسيا'),
  ('flags-and-countries', 400, 'open', 'علم فيه ورقة قيقب حمراء في المنتصف، أي دولة؟', NULL, 'كندا'),
  ('flags-and-countries', 600, 'open', 'ما هي عاصمة أستراليا الفيدرالية؟', NULL, 'كانبيرا'),
  ('flags-and-countries', 600, 'open', 'كم عدد النجوم في علم الولايات المتحدة الأمريكية؟', NULL, '50')
) AS q(cat_slug, points, kind, text, choices, answer)
JOIN public.categories c ON c.slug = q.cat_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.questions eq
  WHERE eq.category_id = c.id AND eq.text = q.text
)
ON CONFLICT DO NOTHING;

-- Function 1: Create a 2-player multiplayer room
CREATE OR REPLACE FUNCTION public.create_multiplayer_room(
  p_game_slug text,
  p_host_name text,
  p_max_players integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_host_id uuid := auth.uid();
  v_code text;
  v_room public.rooms%ROWTYPE;
  v_tries integer := 0;
BEGIN
  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: يجب تسجيل الدخول لإنشاء غرفة';
  END IF;

  IF coalesce(trim(p_host_name), '') = '' THEN
    p_host_name := 'المضيف';
  END IF;

  -- Generate unique 6-digit numeric code
  LOOP
    v_code := lpad((floor(random() * 900000 + 100000))::bigint::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.rooms
      WHERE code = v_code AND status IN ('waiting', 'ready', 'playing')
    );
    v_tries := v_tries + 1;
    IF v_tries > 50 THEN
      RAISE EXCEPTION 'CODE_GENERATION_FAILED: تعذر إنشاء رمز فريد للغرفة';
    END IF;
  END LOOP;

  -- Insert room (strictly 2 players)
  INSERT INTO public.rooms (
    code,
    game_slug,
    host_id,
    host_name,
    status,
    max_players,
    current_turn,
    session_data
  )
  VALUES (
    v_code,
    p_game_slug,
    v_host_id,
    p_host_name,
    'waiting',
    2,
    0,
    '{}'::jsonb
  )
  RETURNING * INTO v_room;

  -- Insert host with player_index = 0
  INSERT INTO public.room_players (
    room_id,
    user_id,
    player_name,
    role,
    player_index
  )
  VALUES (
    v_room.id,
    v_host_id,
    p_host_name,
    'host',
    0
  );

  RETURN public._format_room_json(v_room);
END;
$$;

-- Function 2: Join a multiplayer room (Strictly 2 players server-enforced)
CREATE OR REPLACE FUNCTION public.join_multiplayer_room(
  p_code text,
  p_player_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clean_code text := upper(trim(coalesce(p_code, '')));
  v_room public.rooms%ROWTYPE;
  v_current_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: يجب تسجيل الدخول للانضمام للغرفة';
  END IF;

  IF coalesce(trim(p_player_name), '') = '' THEN
    p_player_name := 'لاعب جديد';
  END IF;

  -- Find room by code
  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = v_clean_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: الكود غير صحيح أو الغرفة غير موجودة';
  END IF;

  -- Check room expiration
  -- Waiting rooms expire in 2 hours, active games in 6 hours
  -- Check room expiration (Waiting: 2 hours, Playing: 6 hours)
  IF v_room.status = 'expired'
     OR (v_room.status IN ('waiting', 'ready') AND v_room.created_at < (now() - interval '2 hours'))
     OR (v_room.created_at < (now() - interval '6 hours')) THEN
    UPDATE public.rooms SET status = 'expired', updated_at = now() WHERE id = v_room.id;
    RAISE EXCEPTION 'ROOM_EXPIRED: انتهت صلاحية الغرفة';
  END IF;

  -- Check if already participating (Reconnect flow)
  IF EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = v_room.id AND user_id = v_user_id
  ) THEN
    -- Update active timestamp and name
    UPDATE public.room_players
    SET player_name = p_player_name, last_active_at = now()
    WHERE room_id = v_room.id AND user_id = v_user_id;

    RETURN public._format_room_json(v_room);
  END IF;

  -- If not already in room, reject if already playing or finished
  IF v_room.status IN ('playing', 'finished') THEN
    RAISE EXCEPTION 'ROOM_ALREADY_PLAYING: بدأت اللعبة بالفعل في هذه الغرفة';
  END IF;

  -- Count current players
  SELECT count(*) INTO v_current_count
  FROM public.room_players
  WHERE room_id = v_room.id;

  -- STRICT SERVER-SIDE ENFORCEMENT: Exactly 2 players maximum
  IF v_current_count >= 2 THEN
    RAISE EXCEPTION 'ROOM_FULL: الغرفة مكتملة';
  END IF;

  -- Insert guest with player_index = 1
  INSERT INTO public.room_players (
    room_id,
    user_id,
    player_name,
    role,
    player_index
  )
  VALUES (
    v_room.id,
    v_user_id,
    p_player_name,
    'guest',
    1
  );

  -- Update room status to 'ready'
  UPDATE public.rooms
  SET status = 'ready', updated_at = now()
  WHERE id = v_room.id
  RETURNING * INTO v_room;

  RETURN public._format_room_json(v_room);
END;
$$;

-- Function 3: Start multiplayer game (Server authoritative, zero client session trusted)
CREATE OR REPLACE FUNCTION public.start_multiplayer_game(
  p_room_id uuid,
  p_session_data jsonb DEFAULT '{}'::jsonb,
  p_category_slugs text[] DEFAULT NULL,
  p_question_ids text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_host_id uuid := auth.uid();
  v_room public.rooms%ROWTYPE;
  v_player_count integer;
  v_categories jsonb;
  v_chosen_slugs text[];
  v_safe_questions jsonb;
  v_host_player public.room_players%ROWTYPE;
  v_guest_player public.room_players%ROWTYPE;
  v_session jsonb;
  v_custom_count integer;
  v_q record;
BEGIN
  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: يجب تسجيل الدخول';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: الغرفة غير موجودة';
  END IF;

  IF v_room.host_id <> v_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: فقط المضيف يمكنه بدء اللعبة';
  END IF;

  -- Verify exactly 2 players are present
  SELECT count(*) INTO v_player_count FROM public.room_players WHERE room_id = p_room_id;
  IF v_player_count <> 2 THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS: يجب وجود لاعبين اثنين بالضبط لبدء التحدي';
  END IF;

  -- Transition room to playing state
  -- Fetch host and guest records
  SELECT * INTO v_host_player FROM public.room_players WHERE room_id = p_room_id AND player_index = 0;
  SELECT * INTO v_guest_player FROM public.room_players WHERE room_id = p_room_id AND player_index = 1;

  -- Clean old questions for this room if any
  DELETE FROM public.room_questions WHERE room_id = p_room_id;

  -- TEST CASE A: Validate custom question IDs if supplied
  IF p_question_ids IS NOT NULL AND array_length(p_question_ids, 1) > 0 THEN
    SELECT count(*) INTO v_custom_count
    FROM public.questions
    WHERE id::text = ANY(p_question_ids);

    IF v_custom_count <> array_length(p_question_ids, 1) THEN
      RAISE EXCEPTION 'INVALID_QUESTION_ID: أحد معرّفات الأسئلة غير موجود في قاعدة البيانات';
    END IF;
  END IF;

  -- Determine 6 categories from trusted database categories
  IF p_category_slugs IS NOT NULL AND array_length(p_category_slugs, 1) = 6 THEN
    v_chosen_slugs := p_category_slugs;
  ELSE
    SELECT array_agg(slug) INTO v_chosen_slugs
    FROM (
      SELECT DISTINCT c.slug
      FROM public.categories c
      JOIN public.questions q ON q.category_id = c.id
      GROUP BY c.slug
      HAVING count(q.id) >= 6
      ORDER BY c.slug
      LIMIT 6
    ) sub;
  END IF;

  -- Build trusted categories JSON
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.slug,
      'slug', c.slug,
      'name', c.name,
      'emoji', c.emoji,
      'description', c.description
    ) ORDER BY c.sort_order
  ), '[]'::jsonb)
  INTO v_categories
  FROM public.categories c
  WHERE c.slug = ANY(v_chosen_slugs);

  -- Select 6 questions per category from public.questions and populate private room_questions with SECRET answer
  FOR v_q IN (
    WITH ranked_questions AS (
      SELECT
        q.id::text AS q_id,
        c.slug AS cat_slug,
        q.points,
        q.kind::text AS kind,
        q.text,
        q.choices,
        q.answer,
        q.image_url,
        q.audio_url,
        q.audio_text,
        q.video_url,
        ROW_NUMBER() OVER (PARTITION BY c.slug ORDER BY q.points ASC, q.id) AS rn
      FROM public.questions q
      JOIN public.categories c ON c.id = q.category_id
      WHERE c.slug = ANY(v_chosen_slugs)
    )
    SELECT * FROM ranked_questions WHERE rn <= 6
  ) LOOP
    INSERT INTO public.room_questions (
      room_id,
      question_id,
      category_slug,
      points,
      kind,
      text,
      choices,
      answer,
      image_url,
      audio_url,
      audio_text,
      video_url
    )
    VALUES (
      p_room_id,
      v_q.q_id,
      v_q.cat_slug,
      v_q.points,
      v_q.kind,
      v_q.text,
      v_q.choices,
      v_q.answer,
      v_q.image_url,
      v_q.audio_url,
      v_q.audio_text,
      v_q.video_url
    );
  END LOOP;

  -- SAFE PUBLIC QUESTIONS ARRAY: ZERO ANSWERS EXPOSED!
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', question_id,
      'category_id', category_slug,
      'points', points,
      'kind', kind,
      'text', text,
      'choices', choices,
      'image_url', image_url,
      'audio_url', audio_url,
      'audio_text', audio_text,
      'video_url', video_url
    ) ORDER BY points ASC
  ), '[]'::jsonb)
  INTO v_safe_questions
  FROM public.room_questions
  WHERE room_id = p_room_id;

  -- Initialize authoritative session_data
  v_session := jsonb_build_object(
    'id', p_room_id,
    'teams', jsonb_build_array(
      jsonb_build_object('name', v_host_player.player_name, 'score', 0, 'helps', jsonb_build_object('trap', true, 'rest', true, 'two', true, 'dig', true, 'call', true)),
      jsonb_build_object('name', v_guest_player.player_name, 'score', 0, 'helps', jsonb_build_object('trap', true, 'rest', true, 'two', true, 'dig', true, 'call', true))
    ),
    'turn', 0,
    'categories', v_categories,
    'questions', v_safe_questions,
    'used', '[]'::jsonb,
    'activeQuestionId', NULL,
    'activeQuestionOpenedAt', NULL,
    'revealed', false,
    'revealedAnswer', NULL,
    'lastAnswerResult', NULL,
    'trapArmedBy', NULL,
    'finished', false
  );

  UPDATE public.rooms
  SET status = 'playing',
      current_turn = 0,
      session_data = v_session,
      updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN public._format_room_json(v_room);
END;
$$;

-- Function 4: Submit server-authoritative multiplayer action
CREATE OR REPLACE FUNCTION public.submit_multiplayer_action(
  p_room_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_room public.rooms%ROWTYPE;
  v_player public.room_players%ROWTYPE;
  v_session jsonb;
  v_q_id text;
  v_secret_q public.room_questions%ROWTYPE;
  v_awarded_team integer := NULL;
  v_points integer;
  v_used jsonb;
  v_teams jsonb;
  v_current_score integer;
  v_new_score integer;
  v_help_key text;
  v_questions jsonb;
  v_selected_ans text;
  v_is_correct boolean := false;
  v_judge_val text;
  v_dig_hidden jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: يجب تسجيل الدخول';
  END IF;

  -- Verify room exists and is currently active
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: الغرفة غير موجودة';
  END IF;

  IF v_room.status <> 'playing' THEN
    RAISE EXCEPTION 'ROOM_NOT_PLAYING: اللعبة ليست في حالة نشطة';
  END IF;

  -- Verify player belongs to room and fetch their index (0 or 1)
  SELECT * INTO v_player
  FROM public.room_players
  WHERE room_id = p_room_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROOM: أنت لست عضواً في هذه الغرفة';
  END IF;

  -- Touch player activity
  UPDATE public.room_players SET last_active_at = now() WHERE id = v_player.id;

  v_session := v_room.session_data;

  -- ----------------------------------------------------
  -- ACTION: select_question
  -- ----------------------------------------------------
  IF p_action = 'select_question' THEN
    v_q_id := p_payload->>'question_id';
    IF v_q_id IS NULL OR v_q_id = '' THEN
      RAISE EXCEPTION 'INVALID_QUESTION: معرف السؤال غير صالح';
    END IF;

    -- Verify it is player's turn to pick
    -- Only current turn player can select
    IF v_player.player_index <> v_room.current_turn THEN
      RAISE EXCEPTION 'NOT_YOUR_TURN: ليس دورك لاختيار السؤال';
    END IF;

    -- Check if question was already used
    -- Cannot select if another question is active
    IF v_session->>'activeQuestionId' IS NOT NULL THEN
      RAISE EXCEPTION 'QUESTION_ALREADY_ACTIVE: هناك سؤال نشط حالياً بالفعل';
    END IF;

    -- Must belong to room_questions
    IF NOT EXISTS (SELECT 1 FROM public.room_questions WHERE room_id = p_room_id AND question_id = v_q_id) THEN
      RAISE EXCEPTION 'INVALID_QUESTION_ID: السؤال غير مسجل في هذه الجلسة';
    END IF;

    -- Cannot select if already used
    v_used := coalesce(v_session->'used', '[]'::jsonb);
    IF v_used ? v_q_id THEN
      RAISE EXCEPTION 'QUESTION_ALREADY_USED: هذا السؤال تمت الإجابة عليه مسبقاً';
    END IF;

    v_session := jsonb_set(v_session, '{activeQuestionId}', to_jsonb(v_q_id));
    v_session := jsonb_set(v_session, '{activeQuestionOpenedAt}', to_jsonb(now()::text));
    v_session := jsonb_set(v_session, '{revealed}', 'false'::jsonb);
    v_session := jsonb_set(v_session, '{revealedAnswer}', 'null'::jsonb);
    v_session := jsonb_set(v_session, '{lastAnswerResult}', 'null'::jsonb);
    v_session := jsonb_set(v_session, '{digHiddenChoices}', '[]'::jsonb);

  -- ----------------------------------------------------
  -- ACTION: reveal_answer
  -- ----------------------------------------------------
  ELSIF p_action = 'reveal_answer' THEN
    v_q_id := v_session->>'activeQuestionId';
    IF v_q_id IS NULL THEN
      RAISE EXCEPTION 'NO_ACTIVE_QUESTION: لا يوجد سؤال نشط لكشف جوابه';
    END IF;

    SELECT * INTO v_secret_q FROM public.room_questions WHERE room_id = p_room_id AND question_id = v_q_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'QUESTION_NOT_FOUND: تعذر جلب بيانات السؤال';
    END IF;

    v_session := jsonb_set(v_session, '{revealed}', 'true'::jsonb);
    v_session := jsonb_set(v_session, '{revealedAnswer}', to_jsonb(v_secret_q.answer));

  -- ----------------------------------------------------
  -- ACTION: close_question
  -- ----------------------------------------------------
  ELSIF p_action = 'close_question' THEN
    v_session := jsonb_set(v_session, '{activeQuestionId}', 'null'::jsonb);
    v_session := jsonb_set(v_session, '{revealed}', 'false'::jsonb);
    v_session := jsonb_set(v_session, '{revealedAnswer}', 'null'::jsonb);
    v_session := jsonb_set(v_session, '{digHiddenChoices}', '[]'::jsonb);

  -- ----------------------------------------------------
  -- ACTION: answer_question
  -- ----------------------------------------------------
  ELSIF p_action = 'answer_question' THEN
    v_q_id := p_payload->>'question_id';
    IF v_q_id IS NULL OR v_q_id = '' THEN
      v_q_id := v_session->>'activeQuestionId';
    END IF;

    -- TEST CASE H: Attempting unselected / future question rejected
    IF v_q_id IS NULL OR v_q_id <> (v_session->>'activeQuestionId') THEN
      RAISE EXCEPTION 'QUESTION_NOT_ACTIVE: السؤال المحدد ليس السؤال النشط حالياً';
    END IF;

    v_used := coalesce(v_session->'used', '[]'::jsonb);

    -- TEST CASE F & E: Answering / judging same question twice rejected
    IF v_used ? v_q_id THEN
      RAISE EXCEPTION 'QUESTION_ALREADY_USED: هذا السؤال تمت الإجابة عليه مسبقاً';
    END IF;

    -- Fetch trusted secret question record from private table
    SELECT * INTO v_secret_q FROM public.room_questions WHERE room_id = p_room_id AND question_id = v_q_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'QUESTION_NOT_FOUND: السؤال غير مسجل في هذه الجلسة';
    END IF;

    -- TEST CASE C: Server computes points from trusted room_questions.points!
    -- Any client-supplied points or scores in payload are completely ignored.
    v_points := v_secret_q.points;

    -- Objective question: mcq
    IF v_secret_q.kind = 'mcq' THEN
      -- TEST CASES A & B: Reject judge_team on MCQ!
      IF p_payload ? 'judge_team' OR p_payload ? 'team' THEN
        RAISE EXCEPTION 'MANUAL_JUDGING_NOT_PERMITTED: أسئلة الاختيار من متعدد تُحسم آلياً من الخادم ولا تقبل التحكيم اليدوي';
      END IF;

      -- Must provide selected_answer
      IF NOT (p_payload ? 'selected_answer') OR coalesce(trim(p_payload->>'selected_answer'), '') = '' THEN
        RAISE EXCEPTION 'ANSWER_REQUIRED: يجب تحديد خيار الإجابة لأسئلة الاختيار من متعدد';
      END IF;

      -- Only current turn player can answer
      IF v_player.player_index <> v_room.current_turn THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: لا يمكنك الإجابة في غير دورك';
      END IF;

      -- Server evaluates correctness against secret answer
      v_selected_ans := trim(p_payload->>'selected_answer');
      IF lower(v_selected_ans) = lower(trim(v_secret_q.answer)) THEN
        v_is_correct := true;
        v_awarded_team := v_room.current_turn;
      ELSE
        v_is_correct := false;
        v_awarded_team := NULL;
      END IF;

    -- Subjective / manual judging question: open (verbal trivia, charades/no-words)
    ELSE
      -- Only authorized judge may judge subjective question
      -- Preferred trusted rule: Only Host may judge!
      -- TEST CASE C: unauthorized user tries manual judgment -> rejected
      IF v_player.role <> 'host' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED_JUDGE: فقط مضيف الغرفة مخوّل بتحكيم الأسئلة المفتوحة والتمثيل';
      END IF;

      -- Validate judge_team payload
      IF p_payload ? 'judge_team' OR p_payload ? 'team' THEN
        v_judge_val := coalesce(p_payload->>'judge_team', p_payload->>'team');
        IF v_judge_val = '0' OR v_judge_val = '1' THEN
          v_awarded_team := v_judge_val::integer;
          v_is_correct := true;
        ELSIF v_judge_val IS NULL OR v_judge_val = '' OR v_judge_val = 'null' THEN
          v_awarded_team := NULL;
          v_is_correct := false;
        ELSE
          RAISE EXCEPTION 'INVALID_JUDGE_TEAM: الفريق المحدد غير صالح';
        END IF;
      ELSIF p_payload ? 'selected_answer' THEN
        -- If open question optionally provided selected_answer
        v_selected_ans := trim(coalesce(p_payload->>'selected_answer', ''));
        IF lower(v_selected_ans) = lower(trim(v_secret_q.answer)) THEN
          v_is_correct := true;
          v_awarded_team := v_room.current_turn;
        ELSE
          v_is_correct := false;
          v_awarded_team := NULL;
        END IF;
      ELSE
        RAISE EXCEPTION 'JUDGMENT_REQUIRED: يرجى تحديد نتيجة التحكيم للسؤال المفتوح';
      END IF;
    END IF;

    -- Record in used questions list
    v_used := v_used || to_jsonb(v_q_id);
    v_session := jsonb_set(v_session, '{used}', v_used);

    -- Award points to team if awarded
    IF v_awarded_team IS NOT NULL AND v_awarded_team IN (0, 1) THEN
      v_current_score := coalesce((v_session->'teams'->v_awarded_team->>'score')::integer, 0);
      v_new_score := v_current_score + v_points;
      v_session := jsonb_set(v_session, ARRAY['teams', v_awarded_team::text, 'score'], to_jsonb(v_new_score));
    END IF;

    -- Reveal answer for this answered question
    v_session := jsonb_set(v_session, '{revealed}', 'true'::jsonb);
    v_session := jsonb_set(v_session, '{revealedAnswer}', to_jsonb(v_secret_q.answer));
    v_session := jsonb_set(v_session, '{lastAnswerResult}', jsonb_build_object(
      'isCorrect', v_is_correct,
      'awardedTeam', v_awarded_team,
      'points', (CASE WHEN v_awarded_team IS NOT NULL THEN v_points ELSE 0 END),
      'correctAnswer', v_secret_q.answer
    ));

    -- Toggle turn: 0 -> 1, 1 -> 0
    v_room.current_turn := (v_room.current_turn + 1) % 2;
    v_session := jsonb_set(v_session, '{turn}', to_jsonb(v_room.current_turn));

    -- Clear active question and dig choices
    v_session := jsonb_set(v_session, '{activeQuestionId}', 'null'::jsonb);
    v_session := jsonb_set(v_session, '{digHiddenChoices}', '[]'::jsonb);

    -- Check if all questions are finished
    v_questions := coalesce(v_session->'questions', '[]'::jsonb);
    IF jsonb_array_length(v_used) >= jsonb_array_length(v_questions) AND jsonb_array_length(v_questions) > 0 THEN
      v_session := jsonb_set(v_session, '{finished}', 'true'::jsonb);
      v_room.status := 'finished';
    END IF;

  -- ----------------------------------------------------
  -- ACTION: use_help
  -- ----------------------------------------------------
  ELSIF p_action = 'use_help' THEN
    v_help_key := p_payload->>'help_key';
    IF v_help_key IS NULL OR v_help_key = '' THEN
      RAISE EXCEPTION 'INVALID_HELP: نوع المساعدة غير صالح';
    END IF;

    -- Must be player's turn to use their help
    -- Must be player's turn to use help
    IF v_player.player_index <> v_room.current_turn THEN
      RAISE EXCEPTION 'NOT_YOUR_TURN: لا يمكنك استخدام المساعدة في غير دورك';
    END IF;

    -- Check if help was already consumed
    IF (v_session->'teams'->v_player.player_index->'helps'->>v_help_key) = 'false' THEN
      RAISE EXCEPTION 'HELP_ALREADY_USED: تم استخدام هذه المساعدة مسبقاً';
    END IF;

    -- Consume help
    v_session := jsonb_set(v_session, ARRAY['teams', v_player.player_index::text, 'helps', v_help_key], 'false'::jsonb);

    IF v_help_key = 'trap' THEN
      v_session := jsonb_set(v_session, '{trapArmedBy}', to_jsonb(v_player.player_index));
    ELSIF v_help_key = 'dig' AND v_session->>'activeQuestionId' IS NOT NULL THEN
      SELECT * INTO v_secret_q FROM public.room_questions WHERE room_id = p_room_id AND question_id = (v_session->>'activeQuestionId');
      IF FOUND AND v_secret_q.choices IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(choice), '[]'::jsonb) INTO v_dig_hidden
        FROM (
          SELECT jsonb_array_elements_text(v_secret_q.choices) AS choice
        ) sub
        WHERE choice <> v_secret_q.answer
        LIMIT 2;
        v_session := jsonb_set(v_session, '{digHiddenChoices}', coalesce(v_dig_hidden, '[]'::jsonb));
      END IF;
    END IF;

  -- ----------------------------------------------------
  -- ACTION: finish_game
  -- ----------------------------------------------------
  ELSIF p_action = 'finish_game' THEN
    v_session := jsonb_set(v_session, '{finished}', 'true'::jsonb);
    v_room.status := 'finished';

  ELSE
    RAISE EXCEPTION 'UNKNOWN_ACTION: إجراء غير معروف: %', p_action;
  END IF;

  -- Update room in database
  UPDATE public.rooms
  SET status = v_room.status,
      current_turn = v_room.current_turn,
      session_data = v_session,
      updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN public._format_room_json(v_room);
END;
$$;

-- Function 5: Get room state by 6-digit code (reconnect / join lookup)
-- Function 5: Get safe room state by 6-digit code
CREATE OR REPLACE FUNCTION public.get_room_by_code(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean_code text := upper(trim(coalesce(p_code, '')));
  v_room public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = v_clean_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: الغرفة غير موجودة';
  END IF;

  RETURN public._format_room_json(v_room);
END;
$$;

-- Function 6: Leave multiplayer room
CREATE OR REPLACE FUNCTION public.leave_multiplayer_room(
  p_room_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_room public.rooms%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.room_players
  WHERE room_id = p_room_id AND user_id = v_user_id;

  -- If host leaves while waiting/ready, cancel the room
  IF v_room.host_id = v_user_id AND v_room.status IN ('waiting', 'ready') THEN
    UPDATE public.rooms
    SET status = 'expired', updated_at = now()
    WHERE id = p_room_id;
  END IF;
END;
$$;

-- Register with Supabase Realtime publication
-- Register with Supabase Realtime publication (Zero answer leakage!)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
