-- MIGRATION 0021: SERVER-AUTHORITATIVE SHARED ONLINE MULTIPLAYER FOR ARCADE GAMES
-- Games: Huroof (حروف), Auction (مزاد الأسئلة), Auction-Billion (مزاد المليار)
-- Strict 2-Player, Real-Time Synchronized 1v1 Sessions
-- Security & Concurrency: SELECT ... FOR UPDATE row locks, zero client trust for scoring/budgets/cards.

-- 1. Helper: Huroof Hex BFS Winning Path Finder
CREATE OR REPLACE FUNCTION public._huroof_find_winning_path(
  p_owners jsonb,
  p_size integer,
  p_owner text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_queue integer[] := '{}';
  v_head integer := 1;
  v_current integer;
  v_row integer;
  v_col integer;
  v_next_row integer;
  v_next_col integer;
  v_next_idx integer;
  v_parent integer[];
  v_visited boolean[];
  v_path integer[] := '{}';
  v_step integer;
  v_reached boolean := false;
  v_target_end integer;
  -- Offsets for row % 2 == 0: [0,-1], [0,1], [-1,-1], [-1,0], [1,-1], [1,0]
  v_even_dr integer[] := ARRAY[0,  0, -1, -1, 1, 1];
  v_even_dc integer[] := ARRAY[-1, 1, -1,  0, -1, 0];
  -- Offsets for row % 2 != 0: [0,-1], [0,1], [-1,0], [-1,1], [1,0], [1,1]
  v_odd_dr integer[]  := ARRAY[0,  0, -1, -1, 1, 1];
  v_odd_dc integer[]  := ARRAY[-1, 1,  0,  1,  0, 1];
  v_dr integer[];
  v_dc integer[];
  v_i integer;
  v_total_cells integer := p_size * p_size;
BEGIN
  IF p_owners IS NULL OR jsonb_array_length(p_owners) <> v_total_cells THEN
    RETURN '[]'::jsonb;
  END IF;

  v_parent := array_fill(-1, ARRAY[v_total_cells]);
  v_visited := array_fill(false, ARRAY[v_total_cells]);

  -- Starting cells:
  -- Owner 'A' (Host/Green): Connect Top (row 0) to Bottom (row size-1)
  -- Owner 'B' (Guest/Maroon): Connect Right (col size-1) to Left (col 0)
  IF p_owner = 'A' THEN
    FOR v_col IN 0..(p_size - 1) LOOP
      IF (p_owners->>v_col) = 'A' THEN
        v_queue := v_queue || v_col;
        v_visited[v_col + 1] := true;
        v_parent[v_col + 1] := -1;
      END IF;
    END LOOP;
  ELSE
    FOR v_row IN 0..(p_size - 1) LOOP
      v_current := v_row * p_size + (p_size - 1);
      IF (p_owners->>v_current) = 'B' THEN
        v_queue := v_queue || v_current;
        v_visited[v_current + 1] := true;
        v_parent[v_current + 1] := -1;
      END IF;
    END LOOP;
  END IF;

  -- BFS Queue Traversal
  WHILE v_head <= array_length(v_queue, 1) LOOP
    v_current := v_queue[v_head];
    v_head := v_head + 1;

    v_row := v_current / p_size;
    v_col := v_current % p_size;

    -- Check win condition reached
    IF p_owner = 'A' AND v_row = (p_size - 1) THEN
      v_reached := true;
      v_target_end := v_current;
      EXIT;
    ELSIF p_owner = 'B' AND v_col = 0 THEN
      v_reached := true;
      v_target_end := v_current;
      EXIT;
    END IF;

    -- Select appropriate neighbor offsets based on row parity
    IF v_row % 2 = 0 THEN
      v_dr := v_even_dr;
      v_dc := v_even_dc;
    ELSE
      v_dr := v_odd_dr;
      v_dc := v_odd_dc;
    END IF;

    FOR v_i IN 1..6 LOOP
      v_next_row := v_row + v_dr[v_i];
      v_next_col := v_col + v_dc[v_i];

      IF v_next_row >= 0 AND v_next_row < p_size AND v_next_col >= 0 AND v_next_col < p_size THEN
        v_next_idx := v_next_row * p_size + v_next_col;
        IF NOT v_visited[v_next_idx + 1] AND (p_owners->>v_next_idx) = p_owner THEN
          v_visited[v_next_idx + 1] := true;
          v_parent[v_next_idx + 1] := v_current;
          v_queue := v_queue || v_next_idx;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT v_reached THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Backtrack path
  v_step := v_target_end;
  WHILE v_step <> -1 LOOP
    v_path := array_prepend(v_step, v_path);
    v_step := v_parent[v_step + 1];
  END LOOP;

  RETURN to_jsonb(v_path);
END;
$$;


-- 2. Function: Start Authoritative Arcade Game (Huroof, Auction, Auction-Billion)
CREATE OR REPLACE FUNCTION public.start_arcade_multiplayer_game(
  p_room_id uuid,
  p_config jsonb DEFAULT '{}'::jsonb
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
  v_host_player public.room_players%ROWTYPE;
  v_guest_player public.room_players%ROWTYPE;
  v_session jsonb;
  
  -- Huroof vars
  v_huroof_size integer := 5;
  v_huroof_rounds integer := 1;
  v_huroof_letters text[] := ARRAY[
    'ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'
  ];
  v_board text[];
  v_owners jsonb;
  v_cell_count integer;
  v_i integer;
  v_rand_idx integer;
  v_temp text;

  -- Auction vars
  v_auction_rounds integer := 3;
  v_auction_q_list jsonb;

  -- Billion Auction vars
  v_billion_budget integer := 200;
  v_billion_pairs jsonb;
BEGIN
  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: يجب تسجيل الدخول';
  END IF;

  -- Lock room row for atomic start
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: الغرفة غير موجودة';
  END IF;

  IF v_room.host_id <> v_host_id THEN
    RAISE EXCEPTION 'NOT_HOST: فقط المضيف يمكنه بدء اللعبة';
  END IF;

  SELECT count(*) INTO v_player_count
  FROM public.room_players
  WHERE room_id = p_room_id;

  IF v_player_count <> 2 THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS: يجب وجود لاعبين اثنين بالضبط لبدء التحدي';
  END IF;

  SELECT * INTO v_host_player FROM public.room_players WHERE room_id = p_room_id AND player_index = 0;
  SELECT * INTO v_guest_player FROM public.room_players WHERE room_id = p_room_id AND player_index = 1;

  -- Clean old room questions if any
  DELETE FROM public.room_questions WHERE room_id = p_room_id;

  -- =========================================================================
  -- GAME 1: HUROOF (حروف)
  -- =========================================================================
  IF v_room.game_slug = 'huroof' THEN
    IF p_config ? 'size' THEN
      v_huroof_size := greatest(4, least(6, (p_config->>'size')::int));
    END IF;
    IF p_config ? 'rounds' THEN
      v_huroof_rounds := greatest(1, least(3, (p_config->>'rounds')::int));
    END IF;

    v_cell_count := v_huroof_size * v_huroof_size;
    v_board := '{}';

    -- Fill board with letters
    FOR v_i IN 0..(v_cell_count - 1) LOOP
      v_board := v_board || v_huroof_letters[(v_i % array_length(v_huroof_letters, 1)) + 1];
    END LOOP;

    -- Fisher-Yates shuffle
    FOR v_i REVERSE (v_cell_count)..2 LOOP
      v_rand_idx := 1 + floor(random() * v_i)::int;
      v_temp := v_board[v_i];
      v_board[v_i] := v_board[v_rand_idx];
      v_board[v_rand_idx] := v_temp;
    END LOOP;

    -- Empty owners array of size cell_count
    v_owners := '[]'::jsonb;
    FOR v_i IN 1..v_cell_count LOOP
      v_owners := v_owners || 'null'::jsonb;
    END LOOP;

    v_session := jsonb_build_object(
      'game', 'huroof',
      'size', v_huroof_size,
      'rounds', v_huroof_rounds,
      'currentRound', 1,
      'roundWins', jsonb_build_array(0, 0),
      'turn', 0,
      'teams', jsonb_build_array(v_host_player.player_name, v_guest_player.player_name),
      'letters', to_jsonb(v_board),
      'owners', v_owners,
      'selected', NULL,
      'winningPath', '[]'::jsonb,
      'roundWinner', NULL,
      'gameWinner', NULL,
      'finished', false
    );

  -- =========================================================================
  -- GAME 2: AUCTION (مزاد الأسئلة)
  -- =========================================================================
  ELSIF v_room.game_slug = 'auction' THEN
    IF p_config ? 'rounds' THEN
      v_auction_rounds := greatest(1, least(5, (p_config->>'rounds')::int));
    END IF;

    -- Curated bank of questions
    v_auction_q_list := jsonb_build_array(
      jsonb_build_object(
        'prompt', 'اذكر دول تبدأ بحرف الألف',
        'suggestedBid', 3,
        'answers', jsonb_build_array('الأردن', 'الإمارات', 'ألمانيا', 'إيطاليا', 'إسبانيا', 'الأرجنتين', 'أستراليا', 'إندونيسيا', 'إيران', 'العراق', 'أمريكا')
      ),
      jsonb_build_object(
        'prompt', 'اذكر عناصر في الجدول الدوري',
        'suggestedBid', 4,
        'answers', jsonb_build_array('هيدروجين', 'هيليوم', 'كربون', 'أكسجين', 'نيتروجين', 'ذهب', 'فضة', 'حديد', 'نحاس', 'كالسيوم', 'صوديوم', 'بوتاسيوم', 'رصاص')
      ),
      jsonb_build_object(
        'prompt', 'اذكر أندية فازت بدوري أبطال أوروبا',
        'suggestedBid', 3,
        'answers', jsonb_build_array('ريال مدريد', 'ميلان', 'بايرن ميونخ', 'ليفربول', 'برشلونة', 'أياكس', 'مانشستر يونايتد', 'تشيلسي', 'يوفنتوس', 'إنتر ميلان', 'مانشستر سيتي')
      ),
      jsonb_build_object(
        'prompt', 'اذكر عواصم عربية',
        'suggestedBid', 4,
        'answers', jsonb_build_array('عمّان', 'الرياض', 'القاهرة', 'دمشق', 'بغداد', 'بيروت', 'القدس', 'أبوظبي', 'الدوحة', 'الكويت', 'مسقط', 'المنامة', 'تونس', 'الرباط')
      ),
      jsonb_build_object(
        'prompt', 'اذكر حيوانات ثديية تعيش في البحر',
        'suggestedBid', 2,
        'answers', jsonb_build_array('حوت أزرق', 'دلفين', 'فقمة', 'أسد البحر', 'فرس البحر (خنزير البحر)', 'ثعلب الماء البحري', 'أوركا')
      )
    );

    v_session := jsonb_build_object(
      'game', 'auction',
      'kind', 'categories',
      'rounds', v_auction_rounds,
      'currentRound', 1,
      'scores', jsonb_build_array(0, 0),
      'phase', 'pick',
      'questionIndex', 0,
      'questions', v_auction_q_list,
      'question', v_auction_q_list->0,
      'bid', 3,
      'bidder', 0,
      'lastBidder', NULL,
      'winner', NULL,
      'correct', 0,
      'markedAnswers', '[]'::jsonb,
      'lastAward', 0,
      'teams', jsonb_build_array(v_host_player.player_name, v_guest_player.player_name),
      'finished', false
    );

  -- =========================================================================
  -- GAME 3: AUCTION-BILLION (مزاد المليار)
  -- =========================================================================
  ELSIF v_room.game_slug = 'auction-billion' THEN
    IF p_config ? 'budget' THEN
      v_billion_budget := greatest(100, least(300, (p_config->>'budget')::int));
    END IF;

    -- Curate 7 pairs: GK, DEF, DEF, MID, MID, ATT, ATT
    v_billion_pairs := jsonb_build_array(
      -- Round 1: GK
      jsonb_build_object(
        'role', 'GK',
        'publicPlayer', jsonb_build_object('id', 'courtois', 'name', 'تيبو كورتوا', 'role', 'GK', 'position', 'حارس', 'price', 92, 'rating', 90, 'asset', 'Thibaut Courtois.webp'),
        'hiddenPlayer', jsonb_build_object('id', 'neuer', 'name', 'مانويل نوير', 'role', 'GK', 'position', 'حارس', 'price', 80, 'rating', 89, 'asset', 'Manuel Neuer.webp')
      ),
      -- Round 2: DEF
      jsonb_build_object(
        'role', 'DEF',
        'publicPlayer', jsonb_build_object('id', 'van-dijk', 'name', 'فيرجيل فان دايك', 'role', 'DEF', 'position', 'قلب دفاع', 'price', 110, 'rating', 91, 'asset', 'Virgil van Dijk.webp'),
        'hiddenPlayer', jsonb_build_object('id', 'hakimi', 'name', 'أشرف حكيمي', 'role', 'DEF', 'position', 'ظهير أيمن', 'price', 95, 'rating', 89, 'asset', 'Achraf Hakimi.webp')
      ),
      -- Round 3: DEF
      jsonb_build_object(
        'role', 'DEF',
        'publicPlayer', jsonb_build_object('id', 'maldini', 'name', 'باولو مالديني', 'role', 'DEF', 'position', 'أسطورة · دفاع', 'price', 155, 'rating', 97, 'asset', 'Paolo Maldini.jpg'),
        'hiddenPlayer', jsonb_build_object('id', 'ramos', 'name', 'سيرخيو راموس', 'role', 'DEF', 'position', 'أسطورة · قلب دفاع', 'price', 112, 'rating', 93, 'asset', 'Sergio Ramos.jpg')
      ),
      -- Round 4: MID
      jsonb_build_object(
        'role', 'MID',
        'publicPlayer', jsonb_build_object('id', 'de-bruyne', 'name', 'كيفن دي بروين', 'role', 'MID', 'position', 'صانع لعب', 'price', 130, 'rating', 92, 'asset', 'Kevin De Bruyne.webp'),
        'hiddenPlayer', jsonb_build_object('id', 'modric', 'name', 'لوكا مودريتش', 'role', 'MID', 'position', 'وسط', 'price', 105, 'rating', 91, 'asset', 'Luka Modrić.webp')
      ),
      -- Round 5: MID
      jsonb_build_object(
        'role', 'MID',
        'publicPlayer', jsonb_build_object('id', 'zidane', 'name', 'زين الدين زيدان', 'role', 'MID', 'position', 'أسطورة · وسط', 'price', 165, 'rating', 97, 'asset', 'Zinedine Zidane.jpg'),
        'hiddenPlayer', jsonb_build_object('id', 'ronaldinho', 'name', 'رونالدينيو', 'role', 'MID', 'position', 'أسطورة · صانع لعب', 'price', 150, 'rating', 96, 'asset', 'Ronaldinho.jpg')
      ),
      -- Round 6: ATT
      jsonb_build_object(
        'role', 'ATT',
        'publicPlayer', jsonb_build_object('id', 'mbappe', 'name', 'كيليان مبابي', 'role', 'ATT', 'position', 'جناح', 'price', 175, 'rating', 95, 'asset', 'Kylian Mbappé.webp'),
        'hiddenPlayer', jsonb_build_object('id', 'haaland', 'name', 'إيرلينغ هالاند', 'role', 'ATT', 'position', 'رأس حربة', 'price', 165, 'rating', 94, 'asset', 'Erling Haaland.webp')
      ),
      -- Round 7: ATT
      jsonb_build_object(
        'role', 'ATT',
        'publicPlayer', jsonb_build_object('id', 'messi', 'name', 'ليونيل ميسي', 'role', 'ATT', 'position', 'جناح / صانع لعب', 'price', 190, 'rating', 97, 'asset', 'Lionel Messi.webp'),
        'hiddenPlayer', jsonb_build_object('id', 'cristiano', 'name', 'كريستيانو رونالدو', 'role', 'ATT', 'position', 'مهاجم', 'price', 180, 'rating', 96, 'asset', 'Cristiano Ronaldo.webp')
      )
    );

    v_session := jsonb_build_object(
      'game', 'auction-billion',
      'rounds', 7,
      'currentRound', 0,
      'budgets', jsonb_build_array(v_billion_budget, v_billion_budget),
      'squads', jsonb_build_array('[]'::jsonb, '[]'::jsonb),
      'bid', 0,
      'bidder', 0,
      'lastBidder', NULL,
      'passes', 0,
      'pairs', v_billion_pairs,
      'resolution', NULL,
      'finished', false,
      'matchResult', NULL,
      'teams', jsonb_build_array(v_host_player.player_name, v_guest_player.player_name)
    );

  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_ARCADE_GAME: اللعبة غير مدعومة في نظام الغرف الثنائية';
  END IF;

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


-- 3. Function: Submit Authoritative Arcade Multiplayer Action
CREATE OR REPLACE FUNCTION public.submit_arcade_multiplayer_action(
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

  -- Huroof action vars
  v_h_index integer;
  v_h_size integer;
  v_h_owners jsonb;
  v_h_owner_char text;
  v_h_path jsonb;
  v_h_round_wins integer[];
  v_h_rounds integer;

  -- Auction action vars
  v_a_amount integer;
  v_a_winner integer;
  v_a_award integer;
  v_a_ans_text text;
  v_a_marked jsonb;
  v_a_q_idx integer;

  -- Billion Auction vars
  v_b_round integer;
  v_b_pair jsonb;
  v_b_min integer;
  v_b_amount integer;
  v_b_winner integer;
  v_b_loser integer;
  v_b_paid integer;
  v_b_budget integer;
  v_b_squad_a jsonb;
  v_b_squad_b jsonb;
  v_b_rate_a numeric := 0;
  v_b_rate_b numeric := 0;
  v_b_len_a integer;
  v_b_len_b integer;
  v_b_score_a integer := 1;
  v_b_score_b integer := 1;
  v_b_events jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: يجب تسجيل الدخول';
  END IF;

  -- Concurrency control: Row lock
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: الغرفة غير موجودة';
  END IF;

  IF v_room.status <> 'playing' THEN
    RAISE EXCEPTION 'ROOM_NOT_PLAYING: اللعبة غير نشطة حالياً في هذه الغرفة';
  END IF;

  SELECT * INTO v_player
  FROM public.room_players
  WHERE room_id = p_room_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROOM: غير مصرح لك بالمشاركة في هذه الغرفة';
  END IF;

  v_session := v_room.session_data;

  -- =========================================================================
  -- ACTIONS: HUROOF (حروف)
  -- =========================================================================
  IF v_room.game_slug = 'huroof' THEN
    v_h_size := (v_session->>'size')::int;
    v_h_owners := v_session->'owners';

    IF p_action = 'huroof_select_cell' THEN
      IF v_player.player_index <> v_room.current_turn THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: ليس دورك لاختيار الخلية';
      END IF;
      IF v_session->>'selected' IS NOT NULL THEN
        RAISE EXCEPTION 'CELL_ALREADY_SELECTED: هناك خلية مختارة بالفعل';
      END IF;

      v_h_index := (p_payload->>'index')::int;
      IF v_h_index < 0 OR v_h_index >= (v_h_size * v_h_size) THEN
        RAISE EXCEPTION 'INVALID_CELL_INDEX: مؤشر الخلية غير صحيح';
      END IF;

      IF (v_h_owners->>v_h_index) IS NOT NULL THEN
        RAISE EXCEPTION 'CELL_ALREADY_OWNED: هذه الخلية مأخوذة مسبقاً';
      END IF;

      v_session := jsonb_set(v_session, '{selected}', to_jsonb(v_h_index));

    ELSIF p_action = 'huroof_claim_cell' THEN
      IF v_session->>'selected' IS NULL THEN
        RAISE EXCEPTION 'NO_CELL_SELECTED: لم يتم اختيار أي خلية بعد';
      END IF;
      -- Host or active turn player can claim
      IF v_player.player_index <> v_room.current_turn AND v_player.role <> 'host' THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: لست مخوّلاً بتثبيت نتيجة السؤال';
      END IF;

      v_h_index := (v_session->>'selected')::int;
      v_h_owner_char := CASE WHEN v_room.current_turn = 0 THEN 'A' ELSE 'B' END;

      -- Set cell owner
      v_h_owners := jsonb_set(v_h_owners, ARRAY[v_h_index::text], to_jsonb(v_h_owner_char));
      v_session := jsonb_set(v_session, '{owners}', v_h_owners);

      -- Check winning path via BFS
      v_h_path := public._huroof_find_winning_path(v_h_owners, v_h_size, v_h_owner_char);

      IF jsonb_array_length(v_h_path) > 0 THEN
        v_session := jsonb_set(v_session, '{winningPath}', v_h_path);
        v_session := jsonb_set(v_session, '{roundWinner}', to_jsonb(v_room.current_turn));

        -- Update round wins
        v_h_rounds := (v_session->>'rounds')::int;
        v_h_round_wins := ARRAY[(v_session->'roundWins'->0)::int, (v_session->'roundWins'->1)::int];
        v_h_round_wins[v_room.current_turn + 1] := v_h_round_wins[v_room.current_turn + 1] + 1;
        v_session := jsonb_set(v_session, '{roundWins}', to_jsonb(v_h_round_wins));

        IF v_h_round_wins[v_room.current_turn + 1] >= v_h_rounds THEN
          v_session := jsonb_set(v_session, '{gameWinner}', to_jsonb(v_room.current_turn));
          v_session := jsonb_set(v_session, '{finished}', 'true'::jsonb);
          v_room.status := 'finished';
        END IF;
      ELSE
        -- No win, toggle turn
        v_room.current_turn := 1 - v_room.current_turn;
        v_session := jsonb_set(v_session, '{turn}', to_jsonb(v_room.current_turn));
      END IF;

      v_session := jsonb_set(v_session, '{selected}', 'null'::jsonb);

    ELSIF p_action = 'huroof_miss_cell' THEN
      IF v_session->>'selected' IS NULL THEN
        RAISE EXCEPTION 'NO_CELL_SELECTED: لم يتم اختيار أي خلية بعد';
      END IF;
      IF v_player.player_index <> v_room.current_turn AND v_player.role <> 'host' THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: لست مخوّلاً بتخطي السؤال';
      END IF;

      v_session := jsonb_set(v_session, '{selected}', 'null'::jsonb);
      v_room.current_turn := 1 - v_room.current_turn;
      v_session := jsonb_set(v_session, '{turn}', to_jsonb(v_room.current_turn));

    ELSE
      RAISE EXCEPTION 'UNKNOWN_ACTION: الإجراء المطلوب غير مدعوم لحروف';
    END IF;

  -- =========================================================================
  -- ACTIONS: AUCTION (مزاد الأسئلة)
  -- =========================================================================
  ELSIF v_room.game_slug = 'auction' THEN
    IF p_action = 'auction_begin_bid' THEN
      IF (v_session->>'phase') <> 'pick' THEN
        RAISE EXCEPTION 'INVALID_PHASE: المزايدة مفتوحة بالفعل';
      END IF;
      v_session := jsonb_set(v_session, '{phase}', '"bid"'::jsonb);
      v_session := jsonb_set(v_session, '{bidder}', '0'::jsonb);
      v_session := jsonb_set(v_session, '{lastBidder}', 'null'::jsonb);

    ELSIF p_action = 'auction_place_bid' THEN
      IF (v_session->>'phase') <> 'bid' THEN
        RAISE EXCEPTION 'INVALID_PHASE: مرحلة المزايدة ليست نشطة حالياً';
      END IF;
      IF v_player.player_index <> (v_session->>'bidder')::int THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: ليس دورك للمزايدة الآن';
      END IF;

      v_a_amount := (p_payload->>'amount')::int;
      IF v_a_amount <= (v_session->>'bid')::int THEN
        RAISE EXCEPTION 'BID_TOO_LOW: يجب أن تكون المزايدة أكبر من العرض الحالي';
      END IF;
      IF v_a_amount > jsonb_array_length(v_session->'question'->'answers') THEN
        RAISE EXCEPTION 'BID_EXCEEDS_LIMIT: لا يمكنك المزايدة برقم أكبر من إجمالي الإجابات المتاحة';
      END IF;

      v_session := jsonb_set(v_session, '{bid}', to_jsonb(v_a_amount));
      v_session := jsonb_set(v_session, '{lastBidder}', to_jsonb(v_player.player_index));
      v_session := jsonb_set(v_session, '{bidder}', to_jsonb(1 - v_player.player_index));

    ELSIF p_action = 'auction_pass' THEN
      IF (v_session->>'phase') <> 'bid' THEN
        RAISE EXCEPTION 'INVALID_PHASE: مرحلة المزايدة ليست نشطة حالياً';
      END IF;
      IF v_player.player_index <> (v_session->>'bidder')::int THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: ليس دورك في المزايدة';
      END IF;

      IF (v_session->>'lastBidder') IS NOT NULL THEN
        v_a_winner := (v_session->>'lastBidder')::int;
      ELSE
        -- Default to round-based starter
        v_a_winner := ((v_session->>'currentRound')::int - 1) % 2;
      END IF;

      v_session := jsonb_set(v_session, '{winner}', to_jsonb(v_a_winner));
      v_session := jsonb_set(v_session, '{phase}', '"challenge"'::jsonb);
      v_session := jsonb_set(v_session, '{markedAnswers}', '[]'::jsonb);
      v_session := jsonb_set(v_session, '{correct}', '0'::jsonb);

    ELSIF p_action = 'auction_toggle_answer' THEN
      IF (v_session->>'phase') <> 'challenge' THEN
        RAISE EXCEPTION 'INVALID_PHASE: مرحلة التحدي ليست نشطة';
      END IF;
      v_a_ans_text := p_payload->>'answer';
      v_a_marked := v_session->'markedAnswers';

      -- Toggle presence
      IF v_a_marked ? v_a_ans_text THEN
        v_a_marked := v_a_marked - v_a_ans_text;
      ELSE
        v_a_marked := v_a_marked || to_jsonb(v_a_ans_text);
      END IF;

      v_session := jsonb_set(v_session, '{markedAnswers}', v_a_marked);
      v_session := jsonb_set(v_session, '{correct}', to_jsonb(jsonb_array_length(v_a_marked)));

    ELSIF p_action = 'auction_finish_challenge' THEN
      IF (v_session->>'phase') <> 'challenge' THEN
        RAISE EXCEPTION 'INVALID_PHASE: مرحلة التحدي ليست نشطة';
      END IF;

      v_a_winner := (v_session->>'winner')::int;
      -- Award calculation: 10 answers = 1 point
      IF (v_session->>'correct')::int >= (v_session->>'bid')::int THEN
        v_a_award := floor((v_session->>'correct')::int / 10)::int;
        IF v_a_award = 0 THEN v_a_award := 1; END IF;
      ELSE
        v_a_award := floor((v_session->>'bid')::int / 10)::int;
        IF v_a_award = 0 THEN v_a_award := 1; END IF;
        -- If failed, points go to opponent
        v_a_winner := 1 - v_a_winner;
      END IF;

      v_session := jsonb_set(
        v_session,
        ARRAY['scores', v_a_winner::text],
        to_jsonb(((v_session->'scores'->v_a_winner)::int + v_a_award))
      );
      v_session := jsonb_set(v_session, '{lastAward}', to_jsonb(v_a_award));
      v_session := jsonb_set(v_session, '{phase}', '"result"'::jsonb);

      IF (v_session->>'currentRound')::int >= (v_session->>'rounds')::int THEN
        v_session := jsonb_set(v_session, '{finished}', 'true'::jsonb);
        v_room.status := 'finished';
      END IF;

    ELSIF p_action = 'auction_next_round' THEN
      IF (v_session->>'phase') <> 'result' THEN
        RAISE EXCEPTION 'INVALID_PHASE: يجب إنهاء الجولة الحالية أولاً';
      END IF;
      IF (v_session->>'currentRound')::int >= (v_session->>'rounds')::int THEN
        RAISE EXCEPTION 'GAME_ALREADY_FINISHED: اكتملت جميع الجولات';
      END IF;

      v_a_q_idx := (v_session->>'questionIndex')::int + 1;
      v_session := jsonb_set(v_session, '{currentRound}', to_jsonb((v_session->>'currentRound')::int + 1));
      v_session := jsonb_set(v_session, '{questionIndex}', to_jsonb(v_a_q_idx));
      v_session := jsonb_set(v_session, '{question}', v_session->'questions'->(v_a_q_idx % jsonb_array_length(v_session->'questions')));
      v_session := jsonb_set(v_session, '{phase}', '"pick"'::jsonb);
      v_session := jsonb_set(v_session, '{bid}', to_jsonb(coalesce((v_session->'question'->>'suggestedBid')::int, 3)));
      v_session := jsonb_set(v_session, '{bidder}', '0'::jsonb);
      v_session := jsonb_set(v_session, '{lastBidder}', 'null'::jsonb);
      v_session := jsonb_set(v_session, '{winner}', 'null'::jsonb);
      v_session := jsonb_set(v_session, '{correct}', '0'::jsonb);
      v_session := jsonb_set(v_session, '{markedAnswers}', '[]'::jsonb);

    ELSE
      RAISE EXCEPTION 'UNKNOWN_ACTION: الإجراء المطلوب غير مدعوم لمزاد الأسئلة';
    END IF;

  -- =========================================================================
  -- ACTIONS: AUCTION-BILLION (مزاد المليار)
  -- =========================================================================
  ELSIF v_room.game_slug = 'auction-billion' THEN
    v_b_round := (v_session->>'currentRound')::int;
    v_b_pair := v_session->'pairs'->v_b_round;

    IF p_action = 'billion_bid' THEN
      IF v_session->>'resolution' IS NOT NULL THEN
        RAISE EXCEPTION 'ROUND_RESOLVED: تمت تصفية الجولة الحالية بالفعل';
      END IF;
      IF v_player.player_index <> (v_session->>'bidder')::int THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: ليس دورك في المزايدة الآن';
      END IF;

      v_b_min := greatest(1, ceil((v_b_pair->'publicPlayer'->>'price')::numeric / 10));
      v_b_amount := (p_payload->>'amount')::int;

      IF v_b_amount < v_b_min OR v_b_amount <= (v_session->>'bid')::int THEN
        RAISE EXCEPTION 'BID_TOO_LOW: يجب أن تكون المزايدة أعلى من الحد الأدنى والعرض الحالي';
      END IF;

      v_b_budget := (v_session->'budgets'->v_player.player_index)::int;
      IF v_b_amount > v_b_budget THEN
        RAISE EXCEPTION 'BUDGET_EXCEEDED: رصيد ميزانيتك لا يكفي لهذه المزايدة';
      END IF;

      v_session := jsonb_set(v_session, '{bid}', to_jsonb(v_b_amount));
      v_session := jsonb_set(v_session, '{lastBidder}', to_jsonb(v_player.player_index));
      v_session := jsonb_set(v_session, '{bidder}', to_jsonb(1 - v_player.player_index));
      v_session := jsonb_set(v_session, '{passes}', '0'::jsonb);

    ELSIF p_action = 'billion_pass' THEN
      IF v_session->>'resolution' IS NOT NULL THEN
        RAISE EXCEPTION 'ROUND_RESOLVED: تمت تصفية الجولة الحالية بالفعل';
      END IF;
      IF v_player.player_index <> (v_session->>'bidder')::int THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN: ليس دورك في المزايدة';
      END IF;

      IF (v_session->>'lastBidder') IS NOT NULL THEN
        -- Last bidder wins public player; opponent gets hidden player
        v_b_winner := (v_session->>'lastBidder')::int;
        v_b_loser := 1 - v_b_winner;
        v_b_paid := (v_session->>'bid')::int;

        -- Deduct budget
        v_session := jsonb_set(
          v_session,
          ARRAY['budgets', v_b_winner::text],
          to_jsonb(((v_session->'budgets'->v_b_winner)::int - v_b_paid))
        );

        -- Award squads
        v_session := jsonb_set(
          v_session,
          ARRAY['squads', v_b_winner::text],
          (v_session->'squads'->v_b_winner) || (v_b_pair->'publicPlayer')
        );
        v_session := jsonb_set(
          v_session,
          ARRAY['squads', v_b_loser::text],
          (v_session->'squads'->v_b_loser) || (v_b_pair->'hiddenPlayer')
        );

        v_session := jsonb_set(
          v_session,
          '{resolution}',
          jsonb_build_object(
            'winner', v_b_winner,
            'loser', v_b_loser,
            'paid', v_b_paid,
            'hiddenPlayer', v_b_pair->'hiddenPlayer'
          )
        );

      ELSE
        -- No bids yet
        IF (v_session->>'passes')::int = 0 THEN
          v_session := jsonb_set(v_session, '{passes}', '1'::jsonb);
          v_session := jsonb_set(v_session, '{bidder}', to_jsonb(1 - v_player.player_index));
        ELSE
          -- Both passed: default resolution for 0M
          v_b_winner := v_b_round % 2;
          v_b_loser := 1 - v_b_winner;
          v_b_paid := 0;

          v_session := jsonb_set(
            v_session,
            ARRAY['squads', v_b_winner::text],
            (v_session->'squads'->v_b_winner) || (v_b_pair->'publicPlayer')
          );
          v_session := jsonb_set(
            v_session,
            ARRAY['squads', v_b_loser::text],
            (v_session->'squads'->v_b_loser) || (v_b_pair->'hiddenPlayer')
          );

          v_session := jsonb_set(
            v_session,
            '{resolution}',
            jsonb_build_object(
              'winner', v_b_winner,
              'loser', v_b_loser,
              'paid', 0,
              'hiddenPlayer', v_b_pair->'hiddenPlayer'
            )
          );
        END IF;
      END IF;

    ELSIF p_action = 'billion_next_round' THEN
      IF v_session->>'resolution' IS NULL THEN
        RAISE EXCEPTION 'ROUND_NOT_RESOLVED: يجب تصفية الجولة الحالية قبل الانتقال للجولة التالية';
      END IF;

      IF v_b_round >= 6 THEN
        -- All 7 rounds finished! Simulate match
        v_b_squad_a := v_session->'squads'->0;
        v_b_squad_b := v_session->'squads'->1;
        v_b_len_a := jsonb_array_length(v_b_squad_a);
        v_b_len_b := jsonb_array_length(v_b_squad_b);

        -- Average ratings
        SELECT coalesce(avg((elem->>'rating')::numeric), 85) INTO v_b_rate_a
        FROM jsonb_array_elements(v_b_squad_a) AS elem;

        SELECT coalesce(avg((elem->>'rating')::numeric), 85) INTO v_b_rate_b
        FROM jsonb_array_elements(v_b_squad_b) AS elem;

        IF v_b_rate_a > v_b_rate_b THEN
          v_b_score_a := 2;
          v_b_score_b := 1;
        ELSIF v_b_rate_b > v_b_rate_a THEN
          v_b_score_a := 1;
          v_b_score_b := 2;
        ELSE
          v_b_score_a := 2;
          v_b_score_b := 2;
        END IF;

        v_b_events := jsonb_build_array(
          jsonb_build_object('minute', 1, 'team', 0, 'text', 'انطلاق قمة المزاد بين الفريقين!'),
          jsonb_build_object('minute', 28, 'team', 0, 'goal', true, 'text', 'هدف أول رائع يهز الشباك!'),
          jsonb_build_object('minute', 64, 'team', 1, 'goal', true, 'text', 'تسديدة قوية تعانق الشباك وتعدل الكفة!'),
          jsonb_build_object('minute', 87, 'team', CASE WHEN v_b_score_a >= v_b_score_b THEN 0 ELSE 1 END, 'goal', true, 'text', 'هدف الحسم في الدقائق الأخيرة يلهب المدرجات!')
        );

        v_session := jsonb_set(
          v_session,
          '{matchResult}',
          jsonb_build_object(
            'score', jsonb_build_array(v_b_score_a, v_b_score_b),
            'events', v_b_events
          )
        );
        v_session := jsonb_set(v_session, '{finished}', 'true'::jsonb);
        v_room.status := 'finished';

      ELSE
        -- Next round (0..6)
        v_session := jsonb_set(v_session, '{currentRound}', to_jsonb(v_b_round + 1));
        v_session := jsonb_set(v_session, '{bidder}', to_jsonb((v_b_round + 1) % 2));
        v_session := jsonb_set(v_session, '{lastBidder}', 'null'::jsonb);
        v_session := jsonb_set(v_session, '{bid}', '0'::jsonb);
        v_session := jsonb_set(v_session, '{passes}', '0'::jsonb);
        v_session := jsonb_set(v_session, '{resolution}', 'null'::jsonb);
      END IF;

    ELSE
      RAISE EXCEPTION 'UNKNOWN_ACTION: الإجراء المطلوب غير مدعوم لمزاد المليار';
    END IF;

  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_ARCADE_GAME: اللعبة غير مدعومة';
  END IF;

  -- Save state
  UPDATE public.rooms
  SET session_data = v_session,
      current_turn = v_room.current_turn,
      status = v_room.status,
      updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN public._format_room_json(v_room);
END;
$$;

-- 4. Grants
GRANT EXECUTE ON FUNCTION public._huroof_find_winning_path(jsonb, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_arcade_multiplayer_game(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_arcade_multiplayer_action(uuid, text, jsonb) TO authenticated, service_role;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';

