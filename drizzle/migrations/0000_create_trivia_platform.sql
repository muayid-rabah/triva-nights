-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.question_kind AS ENUM ('mcq','open');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  country_code text DEFAULT '+965',
  phone text,
  birth_date date,
  avatar_url text,
  games_left integer NOT NULL DEFAULT 1,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- PROFILE AUTO-CREATE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(COALESCE(NEW.raw_user_meta_data->>'full_name',''), ' ', 1)),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CATEGORY GROUPS
CREATE TABLE public.category_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.category_groups TO anon, authenticated;
GRANT ALL ON public.category_groups TO service_role;
ALTER TABLE public.category_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups public read" ON public.category_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "groups admin write" ON public.category_groups FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.category_groups(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  image_key text,
  emoji text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories admin write" ON public.categories FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- QUESTIONS
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  points integer NOT NULL,
  kind public.question_kind NOT NULL DEFAULT 'open',
  text text NOT NULL,
  choices jsonb,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.questions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions public read" ON public.questions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "questions admin write" ON public.questions FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PACKAGES
CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  games_count integer NOT NULL DEFAULT 1,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'JOD',
  badge text,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.packages TO anon, authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages public read" ON public.packages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "packages admin write" ON public.packages FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PURCHASES
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own purchases select" ON public.purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own purchases insert" ON public.purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- GAMES
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_a text NOT NULL,
  team_b text NOT NULL,
  category_ids uuid[] NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own games all" ON public.games FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SEED: PACKAGES
INSERT INTO public.packages (slug,name,description,games_count,price,currency,badge,sort_order) VALUES
('single','لعبة وحدة','باقة لعبة واحدة كاملة بـ ٦ فئات و ٣٦ سؤال',1,5,'JOD',NULL,1),
('triple','٣ ألعاب','ثلاث ألعاب كاملة بسعر مخفض للتجمعات',3,12,'JOD','الأكثر مبيعاً',2),
('monthly','اشتراك شهري','ألعاب غير محدودة لمدة شهر كامل',999,20,'JOD','وفر أكثر',3),
('tournament','باقة بطولة','٨ ألعاب بنظام بطولة بين الفرق',8,30,'JOD',NULL,4);

-- SEED: GROUPS
INSERT INTO public.category_groups (slug,name,sort_order) VALUES
('g1','ثقافة عامة وألغاز',1),
('g2','جغرافيا وعواصم',2),
('g3','دين وتاريخ إسلامي',3),
('g4','رياضة',4),
('g5','أفلام ومسلسلات',5),
('g6','مشاهير وفن',6),
('g7','فئات الأطفال',7),
('g8','فئات خاصة وموسمية',8);

-- SEED: CATEGORIES
INSERT INTO public.categories (group_id,slug,name,description,image_key,emoji,sort_order)
SELECT g.id, v.slug, v.name, v.description, v.image_key, v.emoji, v.sort_order
FROM (VALUES
('g1','general','معلومات عامة','أسئلة ثقافية متنوعة','general','🧠',1),
('g1','riddles','ألغاز','ألغاز تحتاج تفكير سريع',NULL,'🧩',2),
('g1','proverbs','أمثال شعبية','كمّل المثل الشعبي',NULL,'🗣️',3),
('g2','capitals','دول وعواصم','عواصم العالم','geo','🌍',1),
('g2','flags','أعلام الدول','خمن الدولة من علمها',NULL,'🚩',2),
('g2','landmarks','معالم عالمية','أشهر المعالم السياحية',NULL,'🗼',3),
('g3','quran','سور القرآن','معلومات عن سور القرآن الكريم','islam','📖',1),
('g3','prophets','الأنبياء','قصص الأنبياء عليهم السلام',NULL,'🕌',2),
('g3','sahaba','الصحابة','سير الصحابة رضوان الله عليهم',NULL,'⭐',3),
('g4','football','كرة قدم عالمية','نجوم وأرقام كرة القدم','sport','⚽',1),
('g4','worldcup','كأس العالم','تاريخ بطولات كأس العالم',NULL,'🏆',2),
('g4','clubs','أندية وشعارات','أندية العالم وشعاراتها',NULL,'🛡️',3),
('g5','movies','أفلام عالمية','أشهر أفلام هوليوود',NULL,'🎬',1),
('g5','cartoon','كرتون وأنمي','كرتون الطفولة والأنمي',NULL,'🎨',2),
('g5','series','مسلسلات خليجية','مسلسلات رمضانية وخليجية',NULL,'📺',3),
('g6','singers','مطربين عرب','نجوم الغناء العربي',NULL,'🎤',1),
('g6','actors','ممثلين','نجوم الشاشة العربية والعالمية',NULL,'🎭',2),
('g6','influencers','مشاهير السوشال','نجوم السوشال ميديا',NULL,'📱',3),
('g7','animals','حيوانات','عالم الحيوان للأطفال',NULL,'🦁',1),
('g7','colors','ألوان وأشكال','أسئلة سهلة وممتعة',NULL,'🎈',2),
('g7','math','أرقام وحساب','حساب سريع للأطفال',NULL,'🔢',3),
('g8','ramadan','رمضان','عادات وأجواء رمضان',NULL,'🌙',1),
('g8','kuwait','الكويت والخليج','فئة محلية خليجية',NULL,'🇰🇼',2),
('g8','madawish','مضاويش','فئة كوميدية محلية',NULL,'😂',3)
) AS v(gslug,slug,name,description,image_key,emoji,sort_order)
JOIN public.category_groups g ON g.slug = v.gslug;

-- SEED: QUESTIONS
INSERT INTO public.questions (category_id, points, kind, text, choices, answer)
SELECT c.id, v.points, v.kind::public.question_kind, v.text, NULLIF(v.choices,'')::jsonb, v.answer
FROM (VALUES
-- general
('general',100,'mcq','كم عدد أيام السنة الميلادية؟','["365","360","370","350"]','365'),
('general',200,'mcq','ما هو أكبر محيط في العالم؟','["الهادئ","الأطلسي","الهندي","المتجمد"]','الهادئ'),
('general',300,'open','ما هو المعدن السائل في درجة حرارة الغرفة؟','','الزئبق'),
('general',400,'mcq','كم عدد عظام جسم الإنسان البالغ؟','["206","201","210","195"]','206'),
('general',500,'open','من هو مخترع المصباح الكهربائي؟','','توماس إديسون'),
('general',600,'open','ما هي أصغر دولة في العالم من حيث المساحة؟','','الفاتيكان'),
-- riddles
('riddles',100,'open','شيء كلما أخذت منه كبر، ما هو؟','','الحفرة'),
('riddles',200,'open','له أسنان ولا يعض، ما هو؟','','المشط'),
('riddles',300,'open','يمشي بلا رجلين ويبكي بلا عينين، ما هو؟','','السحاب'),
('riddles',400,'open','ما الشيء الذي يكتب ولا يقرأ؟','','القلم'),
('riddles',500,'open','بيت بلا أبواب ولا نوافذ، ما هو؟','','بيت الشعر'),
('riddles',600,'open','ما هو الشيء الذي يرتفع ولا ينزل أبداً؟','','العمر'),
-- proverbs
('proverbs',100,'open','كمّل المثل: الطيور على أشكالها ...','','تقع'),
('proverbs',200,'open','كمّل المثل: من جد ...','','وجد'),
('proverbs',300,'open','كمّل المثل: الجار قبل ...','','الدار'),
('proverbs',400,'open','كمّل المثل: يد وحدة ما ...','','تصفق'),
('proverbs',500,'open','كمّل المثل: اللي ما يعرف الصقر ...','','يشويه'),
('proverbs',600,'open','كمّل المثل: القرد بعين أمه ...','','غزال'),
-- capitals
('capitals',100,'mcq','ما هي عاصمة الكويت؟','["مدينة الكويت","حولي","الجهراء","الفروانية"]','مدينة الكويت'),
('capitals',200,'mcq','ما هي عاصمة اليابان؟','["طوكيو","أوساكا","كيوتو","ناغويا"]','طوكيو'),
('capitals',300,'open','ما هي عاصمة المغرب؟','','الرباط'),
('capitals',400,'open','ما هي عاصمة كندا؟','','أوتاوا'),
('capitals',500,'open','ما هي عاصمة أستراليا؟','','كانبيرا'),
('capitals',600,'open','ما هي عاصمة كازاخستان؟','','أستانا'),
-- flags
('flags',100,'mcq','علم أبيض وفيه دائرة حمراء، أي دولة؟','["اليابان","الصين","كوريا","فيتنام"]','اليابان'),
('flags',200,'open','علم فيه شجرة أرز في المنتصف، أي دولة؟','','لبنان'),
('flags',300,'open','علم أخضر بالكامل مع سيف وشهادة، أي دولة؟','','السعودية'),
('flags',400,'open','علم فيه ورقة قيقب حمراء، أي دولة؟','','كندا'),
('flags',500,'open','كم نجمة في علم الولايات المتحدة؟','','50 نجمة'),
('flags',600,'open','علم فيه تنين أحمر، أي إقليم؟','','ويلز'),
-- landmarks
('landmarks',100,'mcq','برج إيفل يقع في أي مدينة؟','["باريس","لندن","روما","برلين"]','باريس'),
('landmarks',200,'open','في أي دولة يقع تاج محل؟','','الهند'),
('landmarks',300,'open','في أي مدينة يقع برج خليفة؟','','دبي'),
('landmarks',400,'open','أبراج الكويت تقع على أي طريق؟','','الخليج العربي'),
('landmarks',500,'open','في أي دولة يقع معلم البتراء؟','','الأردن'),
('landmarks',600,'open','في أي دولة تقع ماتشو بيتشو؟','','بيرو'),
-- quran
('quran',100,'mcq','كم عدد سور القرآن الكريم؟','["114","110","120","104"]','114'),
('quran',200,'open','ما هي أطول سورة في القرآن؟','','سورة البقرة'),
('quran',300,'open','ما هي السورة التي تسمى قلب القرآن؟','','سورة يس'),
('quran',400,'open','ما هي السورة التي لا تبدأ بالبسملة؟','','سورة التوبة'),
('quran',500,'open','في أي سورة توجد آية الكرسي؟','','سورة البقرة'),
('quran',600,'open','ما هي أقصر سورة في القرآن؟','','سورة الكوثر'),
-- prophets
('prophets',100,'open','من هو أبو الأنبياء؟','','إبراهيم عليه السلام'),
('prophets',200,'open','أي نبي ابتلعه الحوت؟','','يونس عليه السلام'),
('prophets',300,'open','أي نبي كان يفهم لغة الطير والحيوان؟','','سليمان عليه السلام'),
('prophets',400,'open','من هو النبي الذي صنع السفينة؟','','نوح عليه السلام'),
('prophets',500,'open','أي نبي أُلقي في النار فكانت برداً وسلاماً؟','','إبراهيم عليه السلام'),
('prophets',600,'open','من هو النبي الذي لُقب بكليم الله؟','','موسى عليه السلام'),
-- sahaba
('sahaba',100,'open','من هو أول الخلفاء الراشدين؟','','أبو بكر الصديق'),
('sahaba',200,'open','من هو الصحابي الملقب بالفاروق؟','','عمر بن الخطاب'),
('sahaba',300,'open','من هو الصحابي الملقب بسيف الله المسلول؟','','خالد بن الوليد'),
('sahaba',400,'open','من هو مؤذن الرسول ﷺ؟','','بلال بن رباح'),
('sahaba',500,'open','من هو الصحابي الملقب بذي النورين؟','','عثمان بن عفان'),
('sahaba',600,'open','من هو أصغر الصحابة الذين رووا الحديث كثيراً؟','','عبدالله بن عباس'),
-- football
('football',100,'mcq','كم لاعب في فريق كرة القدم داخل الملعب؟','["11","10","12","9"]','11'),
('football',200,'open','من هو صاحب لقب الظاهرة البرازيلي؟','','رونالدو نازاريو'),
('football',300,'open','أي لاعب فاز بأكبر عدد من الكرات الذهبية؟','','ليونيل ميسي'),
('football',400,'open','كم مدة الشوط الواحد في كرة القدم؟','','45 دقيقة'),
('football',500,'open','في أي نادٍ بدأ ميسي مسيرته الاحترافية؟','','برشلونة'),
('football',600,'open','من هو هداف الدوري الإنجليزي التاريخي؟','','آلان شيرر'),
-- worldcup
('worldcup',100,'mcq','من فاز بكأس العالم 2022؟','["الأرجنتين","فرنسا","البرازيل","كرواتيا"]','الأرجنتين'),
('worldcup',200,'open','في أي دولة أقيمت كأس العالم 2022؟','','قطر'),
('worldcup',300,'open','كم مرة فازت البرازيل بكأس العالم؟','','5 مرات'),
('worldcup',400,'open','أول دولة عربية تصل لنصف نهائي كأس العالم؟','','المغرب'),
('worldcup',500,'open','كل كم سنة تقام بطولة كأس العالم؟','','كل 4 سنوات'),
('worldcup',600,'open','من هو هداف كأس العالم التاريخي؟','','ميروسلاف كلوزه'),
-- clubs
('clubs',100,'open','ما لون قميص نادي ريال مدريد الأساسي؟','','الأبيض'),
('clubs',200,'open','في أي مدينة يوجد ملعب أولد ترافورد؟','','مانشستر'),
('clubs',300,'open','ما اسم ملعب نادي برشلونة؟','','كامب نو'),
('clubs',400,'open','أي نادٍ يلقب بالسيدة العجوز؟','','يوفنتوس'),
('clubs',500,'open','أي نادٍ كويتي يلقب بالأخضر؟','','العربي'),
('clubs',600,'open','أي نادٍ فاز بأكبر عدد من ألقاب دوري الأبطال؟','','ريال مدريد'),
-- movies
('movies',100,'mcq','من هو بطل فيلم Titanic؟','["ليوناردو دي كابريو","براد بيت","توم كروز","مات ديمون"]','ليوناردو دي كابريو'),
('movies',200,'open','ما اسم البطل في سلسلة أفلام Iron Man؟','','توني ستارك'),
('movies',300,'open','في أي فيلم شهير ظهرت جملة I am your father؟','','حرب النجوم'),
('movies',400,'open','ما اسم المخرج الشهير لفيلم Inception؟','','كريستوفر نولان'),
('movies',500,'open','في فيلم The Matrix، ما اسم بطل الفيلم؟','','نيو'),
('movies',600,'open','أي فيلم حاز على أول أوسكار لأفضل فيلم أجنبي كوري؟','','باراسايت'),
-- cartoon
('cartoon',100,'mcq','من صديق سبونج بوب المقرب؟','["باتريك","سلطعون","سنجاب","أخطبوط"]','باتريك'),
('cartoon',200,'open','ما لون شخصية شريك؟','','الأخضر'),
('cartoon',300,'open','ما اسم القط في توم وجيري الذي يطارد الفأر؟','','توم'),
('cartoon',400,'open','في أنمي ناروتو، ما اسم قرية البطل؟','','قرية الورق'),
('cartoon',500,'open','ما اسم بطل مسلسل كابتن ماجد؟','','ماجد'),
('cartoon',600,'open','ما اسم التنين في أنمي دراغون بول الذي يحقق الأمنيات؟','','شنرون'),
-- series
('series',100,'open','في أي شهر تعرض أغلب المسلسلات الخليجية؟','','رمضان'),
('series',200,'open','من هي الفنانة الكويتية الملقبة بفنانة العرب؟','','حياة الفهد'),
('series',300,'open','ما اسم المسلسل الكويتي الشهير درب الزلق بطولة من؟','','عبدالحسين عبدالرضا'),
('series',400,'open','ما جنسية مسلسل طاش ما طاش؟','','السعودية'),
('series',500,'open','ما اسم المسلسل الخليجي الكوميدي الشهير خالتي قماشة بطولة من؟','','حياة الفهد'),
('series',600,'open','ما اسم المسلسل الكويتي الشهير الذي يتناول قصة سيف الليل؟','','سيف الليل'),
-- singers
('singers',100,'open','من هو الملقب بكوكب الشرق أنثى؟','','أم كلثوم'),
('singers',200,'open','من هو الفنان الملقب بأبو وديع؟','','محمد عبده'),
('singers',300,'open','من هو الفنان الكويتي الملقب بفنان العرب؟','','عبدالله الرويشد'),
('singers',400,'open','من هي الفنانة الملقبة بالسفيرة؟','','وردة الجزائرية'),
('singers',500,'open','من هو صاحب أغنية العيون السود الشهيرة؟','','كاظم الساهر'),
('singers',600,'open','من هو الملقب بقيصر الأغنية العربية؟','','كاظم الساهر'),
-- actors
('actors',100,'open','من هو الممثل المصري الملقب بالزعيم؟','','عادل إمام'),
('actors',200,'open','من هو الممثل الملقب بفارس السينما العربية؟','','عمر الشريف'),
('actors',300,'open','من هو بطل سلسلة أفلام Mission Impossible؟','','توم كروز'),
('actors',400,'open','من هو الممثل الذي جسد شخصية الجوكر ونال أوسكار؟','','واكين فينيكس'),
('actors',500,'open','من هي الممثلة المصرية الملقبة بسندريلا الشاشة؟','','سعاد حسني'),
('actors',600,'open','من هو الممثل الكويتي الملقب بأبو عدنان؟','','عبدالحسين عبدالرضا'),
-- influencers
('influencers',100,'open','ما اسم أشهر منصة فيديوهات قصيرة؟','','تيك توك'),
('influencers',200,'open','ما اسم المنصة التي كانت تسمى تويتر سابقاً؟','','إكس'),
('influencers',300,'open','ما اللون الأساسي لشعار سناب شات؟','','الأصفر'),
('influencers',400,'open','ما اسم صاحب أكبر قناة يوتيوب في العالم من حيث المشتركين (فردي)؟','','مستر بيست'),
('influencers',500,'open','كم عدد الأحرف المسموحة أصلاً في تغريدة تويتر القديمة؟','','140 حرف'),
('influencers',600,'open','ما اسم الشركة المالكة لإنستغرام وواتساب؟','','ميتا'),
-- animals
('animals',100,'mcq','ما هو ملك الغابة؟','["الأسد","النمر","الفيل","الدب"]','الأسد'),
('animals',200,'open','ما هو أسرع حيوان بري؟','','الفهد'),
('animals',300,'open','ما هو أكبر حيوان في العالم؟','','الحوت الأزرق'),
('animals',400,'open','كم رجل للعنكبوت؟','','8'),
('animals',500,'open','ما اسم صغير القطة؟','','الهريرة'),
('animals',600,'open','أي حيوان ينام واقفاً؟','','الحصان'),
-- colors
('colors',100,'mcq','ما لون السماء في النهار الصافي؟','["أزرق","أحمر","أخضر","أصفر"]','أزرق'),
('colors',200,'open','خلط الأزرق مع الأصفر يعطي أي لون؟','','الأخضر'),
('colors',300,'open','كم ضلع في المثلث؟','','3'),
('colors',400,'open','كم ضلع في المربع؟','','4'),
('colors',500,'open','ما لون الموزة الناضجة؟','','الأصفر'),
('colors',600,'open','كم لون في قوس قزح؟','','7'),
-- math
('math',100,'open','كم يساوي ٥ + ٣؟','','8'),
('math',200,'open','كم يساوي ٧ × ٦؟','','42'),
('math',300,'open','كم يساوي ١٠٠ ÷ ٤؟','','25'),
('math',400,'open','كم يساوي ١٢ × ١٢؟','','144'),
('math',500,'open','كم دقيقة في ساعتين ونصف؟','','150 دقيقة'),
('math',600,'open','ما هو الجذر التربيعي للعدد ١٤٤؟','','12'),
-- ramadan
('ramadan',100,'open','في أي شهر هجري يصوم المسلمون؟','','رمضان'),
('ramadan',200,'open','ما اسم وجبة ما قبل الفجر في رمضان؟','','السحور'),
('ramadan',300,'open','ما اسم صلاة الليل الخاصة برمضان؟','','التراويح'),
('ramadan',400,'open','ما اسم الليلة التي هي خير من ألف شهر؟','','ليلة القدر'),
('ramadan',500,'open','ما اسم الاحتفال الشعبي في منتصف رمضان بالخليج؟','','القرقيعان'),
('ramadan',600,'open','ما اسم زكاة نهاية رمضان؟','','زكاة الفطر'),
-- kuwait
('kuwait',100,'open','ما هي عملة الكويت؟','','الدينار الكويتي'),
('kuwait',200,'open','في أي يوم يصادف العيد الوطني الكويتي؟','','25 فبراير'),
('kuwait',300,'open','ما اسم أشهر معلم سياحي في الكويت؟','','أبراج الكويت'),
('kuwait',400,'open','ما اسم أكبر جزيرة كويتية؟','','بوبيان'),
('kuwait',500,'open','ما اسم السوق التراثي الشهير في مدينة الكويت؟','','سوق المباركية'),
('kuwait',600,'open','ما اسم الأكلة الكويتية الشعبية الشهيرة بالسمك والرز؟','','مچبوس زبيدي'),
-- madawish
('madawish',100,'open','وش يقول الكويتي إذا استغرب بشدة؟','','يا سلام'),
('madawish',200,'open','وش معنى كلمة زين بالخليجي؟','','جيد'),
('madawish',300,'open','وش معنى كلمة يبيلة؟','','يحتاج / يريد'),
('madawish',400,'open','وش معنى شفيك؟','','ما بك / ما خطبك'),
('madawish',500,'open','وش معنى كلمة تنياب بالكويتي؟','','مزاح ثقيل'),
('madawish',600,'open','وش معنى عبالك؟','','تظن / تعتقد')
) AS v(slug,points,kind,text,choices,answer)
JOIN public.categories c ON c.slug = v.slug;
