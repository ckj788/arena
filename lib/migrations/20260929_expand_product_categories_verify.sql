-- Read-only: inspect the installed constraint and existing category data.
SELECT conname AS constraint_name, convalidated AS validated,
       pg_get_constraintdef(oid) AS allowed_categories
FROM pg_constraint
WHERE conrelid = 'public.shipandbattle_products'::regclass
  AND conname = 'shipandbattle_products_category_valid';

SELECT shipandbattle_category AS category, count(*) AS products
FROM public.shipandbattle_products
GROUP BY shipandbattle_category ORDER BY products DESC;
