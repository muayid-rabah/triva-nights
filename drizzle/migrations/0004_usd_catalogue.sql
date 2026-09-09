-- Present every paid package in US dollars consistently across the catalogue.
ALTER TABLE public.packages ALTER COLUMN currency SET DEFAULT 'USD';
UPDATE public.packages
SET currency = 'USD',
    price = CASE slug
      WHEN 'single' THEN 5
      WHEN 'triple' THEN 12
      WHEN 'monthly' THEN 20
      WHEN 'tournament' THEN 30
      ELSE price
    END;
