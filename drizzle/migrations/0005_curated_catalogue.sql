-- Curated Jordanian/Palestinian catalogue.  Versioning lets the application
-- show the current catalogue without deleting any questions a future editor
-- may have added to the older import.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS catalogue_version integer NOT NULL DEFAULT 1;

INSERT INTO public.category_groups (slug, name, sort_order) VALUES
  ('football', 'كرة القدم', 1),
  ('screens', 'شاشة وترفيه', 2),
  ('jordan-palestine', 'الأردن وفلسطين', 3),
  ('world', 'العالم والمعرفة', 4),
  ('culture', 'ثقافة وتحدّي', 5),
  ('jordan-palestine-plus', 'الأردن وفلسطين — موسّع', 6),
  ('world-lifestyle', 'عالمنا اليوم', 7),
  ('culture-plus', 'أدب وفنون', 8)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

INSERT INTO public.categories (group_id, slug, name, description, emoji, sort_order, catalogue_version)
SELECT g.id, v.slug, v.name, v.description, v.emoji, v.sort_order, 2
FROM (VALUES
  ('football','world-cup','كأس العالم','بطولات، منتخبات، وأرقام ثقيلة','🏆',1),
  ('football','champions-league','دوري الأبطال','أوروبا وأنديتها الكبيرة','⭐',2),
  ('football','premier-league','الدوري الإنجليزي','أندية، ملاعب، ومواسم','🏴',3),
  ('football','arab-football','كرة القدم العربية','النشامى والكرة العربية','🌍',4),
  ('football','players-by-photo','مين هاض اللاعب؟','جولة صور لاعبين','📸',5),
  ('football','kits-and-crests','شو هالقميص؟','قمصان وشعارات منتخبات وأندية','👕',6),
  ('screens','arab-series','مسلسلات عربية','شخصيات وأحداث من الشاشة العربية','📺',1),
  ('screens','arab-cinema','سينما عربية','أفلام، مخرجون، ونجوم','🎬',2),
  ('screens','animation-anime','أنمي وكرتون','عالم الأنمي والرسوم','🎨',3),
  ('screens','no-words','من دون كلام','خمن الفكرة من الإشارة','🤫',4),
  ('screens','gaming','ألعاب فيديو','ألعاب، عوالم، وشخصيات','🎮',5),
  ('jordan-palestine','jordan-landmarks','أردننا','معالم وتاريخ الأردن','🇯🇴',1),
  ('jordan-palestine','palestine','فلسطين: مدن وحكايات','مدن، تراث، ومعالم فلسطين','🇵🇸',2),
  ('jordan-palestine','heritage','تراث القعدة','تطريز، عادات، وحكايات','🧵',3),
  ('world','flags-and-countries','أعلام ودول','أعلام، عواصم، وجغرافيا','🗺️',1),
  ('world','science-and-space','علوم وفضاء','أسئلة علمية دقيقة','🔬',2),
  ('world','history-and-civilization','تاريخ وحضارات','محطات تاريخية مؤثرة','🏛️',3),
  ('world','islamic-knowledge','معرفة إسلامية','معلومات موثوقة ومتدرجة','☪️',4),
  ('culture','arabic-literature','أدب عربي','لغة، كتب، وكتّاب','📚',1),
  ('culture','music-and-art','فن وموسيقى','فنانون وآلات ومدارس فنية','🎼',2),
  ('culture','technology','تقنية اليوم','تقنية مفيدة وحديثة','💻',3),
  ('culture','brain-challenge','تحدّي المخ','منطق وألغاز غير مكررة','🧠',4),
  ('jordan-palestine-plus','jordan-cities','مدن الأردن','مدن، معالم، وجغرافيا','🏛️',1),
  ('jordan-palestine-plus','jordan-sport','النشامى والرياضة','كرة أردنية ورياضات وطنية','⚽',2),
  ('jordan-palestine-plus','palestine-landmarks','فلسطين: مدن ومعالم','معرفة محلية دقيقة','🕊️',3),
  ('world-lifestyle','cities-by-clue','من المعلم للمدينة','اكتشف المدينة من معلمها','🗺️',1),
  ('world-lifestyle','cars-and-brands','سيارات وشعارات','علامات وسيارات عالمية','🚗',2),
  ('world-lifestyle','arabic-kitchen','مطبخ عربي','أطباق ومكونات من المنطقة','🍽️',3),
  ('culture-plus','arabic-poetry','شعر عربي','شعراء وبحور ومصطلحات','🪶',1),
  ('culture-plus','arabic-media','مسلسلات وسينما عربية','شاشة عربية منتقاة','🎬',2),
  ('culture-plus','religion-depth','معرفة إسلامية','معلومات موثوقة غير سطحية','📖',3)
) AS v(group_slug, slug, name, description, emoji, sort_order)
JOIN public.category_groups g ON g.slug = v.group_slug
ON CONFLICT (slug) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  emoji = EXCLUDED.emoji,
  sort_order = EXCLUDED.sort_order,
  catalogue_version = EXCLUDED.catalogue_version;
