-- =============================================================================
-- Seed product-specs module from product.metadata
-- Run: psql ... -f seed-product-specs.sql
-- =============================================================================

BEGIN;

-- Clean up existing data (idempotent re-run)
DELETE FROM product_product_productspecs_product_spec_value;
DELETE FROM "product_category_productspecs_category_spec_attribd3fe2b5b";
DELETE FROM product_spec_value;
DELETE FROM category_spec_attribute;
DELETE FROM spec_attribute;

-- =============================================================================
-- Phase 1: SpecAttribute records
-- =============================================================================

INSERT INTO spec_attribute (id, slug, label, type, unit, is_filterable, sort_order, created_at, updated_at) VALUES
-- ── Filterable text specs ─────────────────────────────────────────────────────
(gen_random_uuid()::text, 'engine_type',         'Тип двигуна',                  'text',   NULL,     true,  1,   NOW(), NOW()),
(gen_random_uuid()::text, 'type',                'Тип',                          'text',   NULL,     true,  2,   NOW(), NOW()),
(gen_random_uuid()::text, 'kind',                'Вид',                          'text',   NULL,     true,  3,   NOW(), NOW()),
(gen_random_uuid()::text, 'engine',              'Двигун',                       'text',   NULL,     true,  4,   NOW(), NOW()),
(gen_random_uuid()::text, 'body_material',       'Матеріал корпусу',             'text',   NULL,     true,  5,   NOW(), NOW()),
(gen_random_uuid()::text, 'material',            'Матеріал',                     'text',   NULL,     true,  6,   NOW(), NOW()),
(gen_random_uuid()::text, 'cutting_system',      'Ріжуча система',               'text',   NULL,     true,  7,   NOW(), NOW()),
(gen_random_uuid()::text, 'purpose',             'Призначення',                  'text',   NULL,     true,  8,   NOW(), NOW()),
(gen_random_uuid()::text, 'model',               'Модель',                       'text',   NULL,     true,  9,   NOW(), NOW()),
(gen_random_uuid()::text, 'battery_type',        'Тип акумулятора',              'text',   NULL,     true,  10,  NOW(), NOW()),
(gen_random_uuid()::text, 'brand',               'Виробник',                     'text',   NULL,     true,  11,  NOW(), NOW()),
(gen_random_uuid()::text, 'brand_country',       'Країна реєстрації бренду',     'text',   NULL,     true,  12,  NOW(), NOW()),
(gen_random_uuid()::text, 'made_in',             'Країна-виробник',              'text',   NULL,     true,  13,  NOW(), NOW()),
(gen_random_uuid()::text, 'series',              'Серія',                        'text',   NULL,     true,  14,  NOW(), NOW()),
(gen_random_uuid()::text, 'grass_catcher',       'Травозбірник',                 'text',   NULL,     true,  15,  NOW(), NOW()),
(gen_random_uuid()::text, 'movement_type',       'Тип переміщення',              'text',   NULL,     true,  16,  NOW(), NOW()),
(gen_random_uuid()::text, 'start_system',        'Система запуску',              'text',   NULL,     true,  17,  NOW(), NOW()),
(gen_random_uuid()::text, 'start_type',          'Тип запуску',                  'text',   NULL,     true,  18,  NOW(), NOW()),
(gen_random_uuid()::text, 'fuel_type',           'Тип палива',                   'text',   NULL,     true,  19,  NOW(), NOW()),
(gen_random_uuid()::text, 'fuel_kind',           'Вид палива',                   'text',   NULL,     true,  20,  NOW(), NOW()),
(gen_random_uuid()::text, 'drive_shaft',         'Привідний вал',                'text',   NULL,     true,  21,  NOW(), NOW()),
(gen_random_uuid()::text, 'power_source',        'Живлення',                     'text',   NULL,     true,  22,  NOW(), NOW()),
(gen_random_uuid()::text, 'power_source_type',   'Джерело живлення',             'text',   NULL,     true,  23,  NOW(), NOW()),
(gen_random_uuid()::text, 'battery_included',    'Акумулятор в комплекті',       'text',   NULL,     true,  24,  NOW(), NOW()),
(gen_random_uuid()::text, 'color',               'Колір',                        'text',   NULL,     true,  25,  NOW(), NOW()),
(gen_random_uuid()::text, 'class',               'Клас',                         'text',   NULL,     true,  26,  NOW(), NOW()),
(gen_random_uuid()::text, 'construction',        'Конструкція',                  'text',   NULL,     true,  27,  NOW(), NOW()),
(gen_random_uuid()::text, 'installation_type',   'Тип установки',                'text',   NULL,     true,  28,  NOW(), NOW()),
(gen_random_uuid()::text, 'vehicle_type',        'Тип авто',                     'text',   NULL,     true,  29,  NOW(), NOW()),
(gen_random_uuid()::text, 'parts_type',          'Тип запчастини',               'text',   NULL,     true,  30,  NOW(), NOW()),
(gen_random_uuid()::text, 'protection',          'Система захисту',              'text',   NULL,     true,  31,  NOW(), NOW()),
(gen_random_uuid()::text, 'compatible_model',    'Сумісна модель',               'text',   NULL,     true,  32,  NOW(), NOW()),
(gen_random_uuid()::text, 'compatible_brand',    'Сумісний бренд',               'text',   NULL,     true,  33,  NOW(), NOW()),
(gen_random_uuid()::text, 'compatibility',       'Сумісність',                   'text',   NULL,     true,  34,  NOW(), NOW()),
(gen_random_uuid()::text, 'application',         'Застосування',                 'text',   NULL,     true,  35,  NOW(), NOW()),
(gen_random_uuid()::text, 'engine_position',     'Розміщення двигуна',           'text',   NULL,     true,  36,  NOW(), NOW()),
-- ── Non-filterable text specs ─────────────────────────────────────────────────
(gen_random_uuid()::text, 'warranty',            'Гарантія',                     'text',   NULL,     false, 37,  NOW(), NOW()),
(gen_random_uuid()::text, 'warranty_terms',      'Гарантійні умови',             'text',   NULL,     false, 38,  NOW(), NOW()),
(gen_random_uuid()::text, 'features',            'Особливості',                  'text',   NULL,     false, 39,  NOW(), NOW()),
(gen_random_uuid()::text, 'equipment',           'Комплектація',                 'text',   NULL,     false, 40,  NOW(), NOW()),
(gen_random_uuid()::text, 'delivery_set',        'Комплект поставки',            'text',   NULL,     false, 41,  NOW(), NOW()),
(gen_random_uuid()::text, 'dimensions',          'Розміри',                      'text',   NULL,     false, 42,  NOW(), NOW()),
(gen_random_uuid()::text, 'productivity',        'Продуктивність',               'text',   NULL,     false, 43,  NOW(), NOW()),
-- ── Filterable number specs ───────────────────────────────────────────────────
(gen_random_uuid()::text, 'cutting_width',        'Ширина захвату',              'number', 'см',     true,  50,  NOW(), NOW()),
(gen_random_uuid()::text, 'recommended_area',     'Рекомендована площа',         'number', 'м²',     true,  51,  NOW(), NOW()),
(gen_random_uuid()::text, 'voltage',              'Напруга',                     'number', 'В',      true,  52,  NOW(), NOW()),
(gen_random_uuid()::text, 'power_hp',             'Потужність двигуна',          'number', 'к.с.',   true,  53,  NOW(), NOW()),
(gen_random_uuid()::text, 'power_kw',             'Потужність двигуна',          'number', 'кВт',    true,  54,  NOW(), NOW()),
(gen_random_uuid()::text, 'power_watts',          'Потужність двигуна',          'number', 'Вт',     true,  55,  NOW(), NOW()),
(gen_random_uuid()::text, 'power',                'Потужність',                  'number', NULL,     true,  56,  NOW(), NOW()),
(gen_random_uuid()::text, 'noise_db',             'Рівень шуму',                 'number', 'дБ',     true,  57,  NOW(), NOW()),
(gen_random_uuid()::text, 'working_width',        'Робоча ширина',               'number', 'см',     true,  58,  NOW(), NOW()),
(gen_random_uuid()::text, 'working_depth',        'Робоча глибина',              'number', 'см',     true,  59,  NOW(), NOW()),
(gen_random_uuid()::text, 'battery_ah',           'Ємність акумулятора',         'number', 'Аг',     true,  60,  NOW(), NOW()),
(gen_random_uuid()::text, 'battery_voltage',      'Напруга акумулятора',         'number', 'В',      true,  61,  NOW(), NOW()),
(gen_random_uuid()::text, 'max_pressure',         'Максимальний тиск',           'number', 'бар',    true,  62,  NOW(), NOW()),
(gen_random_uuid()::text, 'working_pressure',     'Робочий тиск',                'number', NULL,     true,  63,  NOW(), NOW()),
(gen_random_uuid()::text, 'pressure',             'Тиск',                        'number', NULL,     true,  64,  NOW(), NOW()),
(gen_random_uuid()::text, 'engine_cc',            'Об''єм двигуна',              'number', 'куб.см', true,  65,  NOW(), NOW()),
(gen_random_uuid()::text, 'engine_displacement',  'Об''єм двигуна',              'number', 'см³',    true,  66,  NOW(), NOW()),
(gen_random_uuid()::text, 'engine_volume',        'Об''єм двигуна',              'number', NULL,     true,  67,  NOW(), NOW()),
(gen_random_uuid()::text, 'cylinder_volume',      'Об''єм циліндру',             'number', NULL,     true,  68,  NOW(), NOW()),
(gen_random_uuid()::text, 'tank_volume',          'Об''єм бака',                 'number', 'л',      true,  69,  NOW(), NOW()),
(gen_random_uuid()::text, 'fuel_tank',            'Об''єм паливного баку',       'number', NULL,     true,  70,  NOW(), NOW()),
(gen_random_uuid()::text, 'grass_catcher_volume', 'Об''єм травозбірника',        'number', 'л',      true,  71,  NOW(), NOW()),
(gen_random_uuid()::text, 'grass_collector',      'Травозбірник (об''єм)',       'number', 'л',      true,  72,  NOW(), NOW()),
(gen_random_uuid()::text, 'cutting_height',       'Висота зрізу',                'number', 'мм',     true,  73,  NOW(), NOW()),
(gen_random_uuid()::text, 'cutting_levels',       'Кількість рівнів висоти зрізу','number', NULL,    true,  74,  NOW(), NOW()),
(gen_random_uuid()::text, 'cut_diameter',         'Діаметр різання',             'number', 'мм',     true,  75,  NOW(), NOW()),
(gen_random_uuid()::text, 'diameter',             'Діаметр',                     'number', NULL,     true,  76,  NOW(), NOW()),
(gen_random_uuid()::text, 'outlet_diameter',      'Діаметр вихідного отвору',    'number', NULL,     true,  77,  NOW(), NOW()),
(gen_random_uuid()::text, 'inlet_diameter',       'Діаметр вхідного отвору',     'number', NULL,     true,  78,  NOW(), NOW()),
(gen_random_uuid()::text, 'wheel_diameter',       'Діаметр колес',               'number', NULL,     true,  79,  NOW(), NOW()),
(gen_random_uuid()::text, 'tire_diameter',        'Діаметр покришки',            'number', 'дюйм',   true,  80,  NOW(), NOW()),
(gen_random_uuid()::text, 'bar_length',           'Довжина шини',                'number', 'мм',     true,  81,  NOW(), NOW()),
(gen_random_uuid()::text, 'chain_pitch',          'Крок ланцюга',                'number', 'дюйм',   true,  82,  NOW(), NOW()),
(gen_random_uuid()::text, 'chain_links',          'Кількість ланок ланцюга',     'number', 'шт',     true,  83,  NOW(), NOW()),
(gen_random_uuid()::text, 'max_rpm',              'Макс. число обертів',         'number', 'об/хв',  true,  84,  NOW(), NOW()),
(gen_random_uuid()::text, 'cable_length',         'Довжина кабелю',              'number', 'м',      true,  85,  NOW(), NOW()),
(gen_random_uuid()::text, 'max_particle_size',    'Максимальний розмір частинок','number', NULL,     true,  86,  NOW(), NOW()),
(gen_random_uuid()::text, 'immersion_depth',      'Глибина занурення',           'number', NULL,     true,  87,  NOW(), NOW()),
(gen_random_uuid()::text, 'delivery_height',      'Висота подачі',               'number', NULL,     true,  88,  NOW(), NOW()),
(gen_random_uuid()::text, 'air_speed',            'Швидкість потоку повітря',    'number', NULL,     true,  89,  NOW(), NOW()),
(gen_random_uuid()::text, 'snow_width',           'Ширина захвату снігу',        'number', 'см',     true,  90,  NOW(), NOW()),
(gen_random_uuid()::text, 'snow_height',          'Висота захвату снігу',        'number', 'см',     true,  91,  NOW(), NOW()),
(gen_random_uuid()::text, 'snow_throw',           'Дальність викиду снігу',      'number', 'м',      true,  92,  NOW(), NOW()),
(gen_random_uuid()::text, 'length',               'Довжина',                     'number', NULL,     true,  93,  NOW(), NOW()),
-- ── Non-filterable logistics specs ───────────────────────────────────────────
(gen_random_uuid()::text, 'ukt_zed',              'Код УКТ ЗЕД',                'text',   NULL,     false, 100, NOW(), NOW()),
(gen_random_uuid()::text, 'vat_rate',             'Ставка ПДВ',                 'text',   NULL,     false, 101, NOW(), NOW()),
(gen_random_uuid()::text, 'cargo_places',         'Кількість вантажних місць',  'number', 'шт',     false, 102, NOW(), NOW()),
(gen_random_uuid()::text, 'pack_qty',             'Кількість в упаковці',       'number', 'шт',     false, 103, NOW(), NOW()),
(gen_random_uuid()::text, 'package_weight',       'Вага в упаковці',            'number', 'кг',     false, 104, NOW(), NOW());

-- =============================================================================
-- Phase 2: CategorySpecAttribute — category to attribute links
-- Each category section selects the relevant attribute IDs by slug.
-- =============================================================================

INSERT INTO category_spec_attribute (id, category_id, attribute_id, sort_order, created_at, updated_at)
SELECT gen_random_uuid()::text, c.id, sa.id,
       row_number() OVER (PARTITION BY c.handle ORDER BY sa.sort_order)::int,
       NOW(), NOW()
FROM (VALUES
  -- hazonokosarky
  ('hazonokosarky', ARRAY['engine_type','cutting_width','recommended_area','voltage','power_hp','grass_catcher','body_material','cutting_height']),
  -- trymery-ta-motokosy
  ('trymery-ta-motokosy', ARRAY['engine_type','type','kind','voltage','cutting_system','power_kw']),
  -- kushchorizy
  ('kushchorizy', ARRAY['kind','engine_type','voltage','cutting_system']),
  -- povitroduvky
  ('povitroduvky', ARRAY['engine_type','type','voltage']),
  -- aeratory
  ('aeratory', ARRAY['engine_type','working_width','power_kw','body_material']),
  -- pyly
  ('pyly', ARRAY['type','kind','engine_type','power_hp']),
  -- snihoprybyralna-tekhnika
  ('snihoprybyralna-tekhnika', ARRAY['type']),
  -- vysotorizy
  ('vysotorizy', ARRAY['type','kind']),
  -- myyky
  ('myyky', ARRAY['engine_type','type']),
  -- kultyvatory-ta-motobloky
  ('kultyvatory-ta-motobloky', ARRAY['engine','type','power_kw']),
  -- heneratory
  ('heneratory', ARRAY['engine','kind']),
  -- podribnyuvachi
  ('podribnyuvachi', ARRAY['engine_type','type']),
  -- motopompy
  ('motopompy', ARRAY['engine','purpose']),
  -- poverkhnevi-nasosy
  ('poverkhnevi-nasosy', ARRAY['type','purpose','power_kw']),
  -- zahlyblyuvalni-nasosy
  ('zahlyblyuvalni-nasosy', ARRAY['type','purpose','voltage']),
  -- opryskuvachi
  ('opryskuvachi', ARRAY['type']),
  -- hryli
  ('hryli', ARRAY['kind','material']),
  -- manhaly-barbekyu-hryl
  ('manhaly-barbekyu-hryl', ARRAY['kind','material']),
  -- kompostery-sadovi
  ('kompostery-sadovi', ARRAY['material']),
  -- aksesuary-dlya-sadovoyi-tekhniky
  ('aksesuary-dlya-sadovoyi-tekhniky', ARRAY['type','kind','purpose','voltage']),
  -- akkumulyatory-ta-zaryadni-prystroyi
  ('akkumulyatory-ta-zaryadni-prystroyi-dlya-instrumenta-ta-sadovoyi-tekhniky', ARRAY['type','voltage','battery_type']),
  -- dvyhuny
  ('dvyhuny', ARRAY['type','power_hp']),
  -- motorni-olyvy
  ('motorni-olyvy', ARRAY['engine_type','model']),
  -- shlanhy
  ('shlanhy', ARRAY['type','kind']),
  -- navisne-obladnannya
  ('navisne-obladnannya', ARRAY['type','cutting_width']),
  -- lantsyuhy-ta-shyny
  ('lantsyuhy-ta-shyny-dlya-lantsyuhovykh-pyl', ARRAY['type','kind','material']),
  -- likhtari-ta-aksesuary
  ('likhtari-ta-aksesuary', ARRAY['type','kind']),
  -- vytratni-materialy-dlya-motokos
  ('vytratni-materialy-dlya-motokos', ARRAY['type','kind','cutting_system','purpose']),
  -- komplektuyuchi-do-nasosiv
  ('komplektuyuchi-do-nasosiv', ARRAY['type','purpose']),
  -- aksesuary-dlya-manhaliv-barbekyu-hryliv
  ('aksesuary-dlya-manhaliv-barbekyu-hryliv', ARRAY['type','kind']),
  -- sadovyy-dekor
  ('sadovyy-dekor', ARRAY['type','kind']),
  -- prystroyi-protyskolzinnya-dlya-koles
  ('prystroyi-protyskolzinnya-dlya-koles', ARRAY['type']),
  -- spetsializovana-khimiya
  ('spetsializovana-khimiya', ARRAY['type','purpose']),
  -- kanistry-avtomobilni
  ('kanistry-avtomobilni', ARRAY['type']),
  -- hidravlichni-masla
  ('hidravlichni-masla', ARRAY['type'])
) AS mapping(cat_handle, slugs)
CROSS JOIN LATERAL unnest(mapping.slugs) AS s(slug)
JOIN product_category c ON c.handle = mapping.cat_handle
JOIN spec_attribute sa ON sa.slug = s.slug;

-- =============================================================================
-- Phase 3: ProductSpecValue — migrate spec_* from product.metadata
--
-- Key insight: metadata key = 'spec_' || sa.slug for all attributes.
-- Number parsing: replace comma with period, strip non-numeric chars, cast.
-- =============================================================================

INSERT INTO product_spec_value (id, product_id, attribute_id, text_value, numeric_value, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  p.id,
  sa.id,
  raw_val,
  CASE
    WHEN sa.type = 'number' THEN
      -- 1. Replace Ukrainian decimal comma (between digits) with period
      -- 2. Extract first continuous numeric token via regexp_match
      -- This correctly handles: "0,75" → 0.75, "20-60 мм" → 20, "1.77, 2x1.09" → 1.77
      (regexp_match(
        regexp_replace(raw_val, '([0-9]),([0-9])', '\1.\2', 'g'),
        '[0-9]+\.?[0-9]*'
      ))[1]::float
    ELSE NULL
  END,
  NOW(), NOW()
FROM product p
CROSS JOIN spec_attribute sa
CROSS JOIN LATERAL (
  SELECT p.metadata->>(CONCAT('spec_', sa.slug)) AS raw_val
) v
WHERE p.metadata IS NOT NULL
  AND p.metadata != '{}'::jsonb
  AND v.raw_val IS NOT NULL
  AND v.raw_val != '';

-- =============================================================================
-- Phase 4: Link table records
-- =============================================================================

-- Product <-> ProductSpecValue
INSERT INTO product_product_productspecs_product_spec_value
  (product_id, product_spec_value_id, id, created_at, updated_at, deleted_at)
SELECT psv.product_id, psv.id, gen_random_uuid()::text, NOW(), NOW(), NULL
FROM product_spec_value psv
WHERE psv.deleted_at IS NULL;

-- Category <-> CategorySpecAttribute
INSERT INTO "product_category_productspecs_category_spec_attribd3fe2b5b"
  (product_category_id, category_spec_attribute_id, id, created_at, updated_at, deleted_at)
SELECT csa.category_id, csa.id, gen_random_uuid()::text, NOW(), NOW(), NULL
FROM category_spec_attribute csa
WHERE csa.deleted_at IS NULL;

COMMIT;

-- =============================================================================
-- Summary report
-- =============================================================================

SELECT table_name, count FROM (
  SELECT 1 AS ord, 'spec_attribute'                                             AS table_name, COUNT(*)::int AS count FROM spec_attribute
  UNION ALL
  SELECT 2, 'category_spec_attribute',                                                         COUNT(*)::int FROM category_spec_attribute
  UNION ALL
  SELECT 3, 'product_spec_value',                                                              COUNT(*)::int FROM product_spec_value
  UNION ALL
  SELECT 4, 'product_product_productspecs_product_spec_value (links)',                         COUNT(*)::int FROM product_product_productspecs_product_spec_value
  UNION ALL
  SELECT 5, 'product_category_productspecs_category_spec_attribd3fe2b5b (links)',              COUNT(*)::int FROM "product_category_productspecs_category_spec_attribd3fe2b5b"
) t ORDER BY ord;
