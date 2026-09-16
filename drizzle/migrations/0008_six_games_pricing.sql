-- Six-game catalogue pricing in USD. Safe to run after the original seeds.
ALTER TABLE public.packages ALTER COLUMN currency SET DEFAULT 'USD';
UPDATE public.packages SET
  currency = 'USD',
  games_count = CASE slug WHEN 'single' THEN 1 WHEN 'triple' THEN 3 WHEN 'monthly' THEN 999 WHEN 'tournament' THEN 6 ELSE games_count END,
  price = CASE slug WHEN 'single' THEN 4.99 WHEN 'triple' THEN 10.99 WHEN 'monthly' THEN 16.99 WHEN 'tournament' THEN 19.99 ELSE price END,
  description = CASE slug
    WHEN 'single' THEN 'لعبة واحدة كاملة من أي لعبة من ألعاب قدّ التحدي الست'
    WHEN 'triple' THEN 'ثلاث ألعاب كاملة تختاروها من الألعاب الست'
    WHEN 'monthly' THEN 'وصول غير محدود إلى الألعاب الست لمدة شهر'
    WHEN 'tournament' THEN 'باقة القعدة الكاملة: الألعاب الست ببطولة بين الفرق'
    ELSE description
  END;
