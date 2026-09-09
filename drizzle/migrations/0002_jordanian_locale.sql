-- Make the live catalogue and checkout currency Jordan-first.
ALTER TABLE public.packages ALTER COLUMN currency SET DEFAULT 'JOD';
UPDATE public.packages
SET currency = 'JOD',
    price = CASE slug
      WHEN 'single' THEN 5
      WHEN 'triple' THEN 12
      WHEN 'monthly' THEN 20
      WHEN 'tournament' THEN 30
      ELSE price
    END;

-- Replace the legacy Gulf-only group with Jordanian and Palestinian content.
UPDATE public.categories
SET slug = 'jordan-palestine',
    name = 'الأردن وفلسطين',
    description = 'تاريخ ومكان وأكل من بلادنا',
    emoji = '🇯🇴'
WHERE slug = 'kuwait';

DELETE FROM public.questions
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'jordan-palestine');

INSERT INTO public.questions (category_id, points, kind, text, answer)
SELECT c.id, v.points, 'open'::public.question_kind, v.text, v.answer
FROM public.categories c
CROSS JOIN (VALUES
  (100,'ما عاصمة الأردن؟','عمّان'),
  (200,'ما اسم المدينة الوردية المنحوتة بالصخر في الأردن؟','البتراء'),
  (300,'ما الطبق الأردني الشعبي المصنوع من الأرز واللبن؟','المنسف'),
  (400,'ما اسم أقدم مدينة مأهولة باستمرار في العالم وتوجد في فلسطين؟','أريحا'),
  (500,'ما الطبق الفلسطيني المصنوع من الدجاج والبصل والسماق؟','المسخن'),
  (600,'ما اسم أعلى قمة جبلية في الأردن؟','جبل أم الدامي')
) AS v(points, text, answer)
WHERE c.slug = 'jordan-palestine';

UPDATE public.categories
SET slug = 'jordanian-phrases',
    name = 'حكي أردني',
    description = 'كلمات وعبارات من حكي أهل الأردن',
    emoji = '🗣️'
WHERE slug = 'madawish';

DELETE FROM public.questions
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'jordanian-phrases');

INSERT INTO public.questions (category_id, points, kind, text, answer)
SELECT c.id, v.points, 'open'::public.question_kind, v.text, v.answer
FROM public.categories c
CROSS JOIN (VALUES
  (100,'شو معنى كلمة هسّه بالحكي الأردني؟','الآن'),
  (200,'شو بنحكي للي بده يروح: الله معك ولا ...؟','مع السلامة'),
  (300,'شو معنى كلمة زلمة بالأردني؟','رجل'),
  (400,'شو معنى كلمة بكير؟','مبكراً'),
  (500,'شو بنحكي لما الواحد بده يهدّي الثاني؟','روّق'),
  (600,'شو معنى كلمة طخّ بالأردني؟','أطلق أو أصاب')
) AS v(points, text, answer)
WHERE c.slug = 'jordanian-phrases';
