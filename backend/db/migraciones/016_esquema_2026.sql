-- Esquema y cuaderno SIGSA 5a vigentes desde enero 2026 (Programa de Inmunizaciones, MSPAS).
-- La hexavalente sustituye a la pentavalente y a la IPV (2, 4, 6 y 18 meses); se agrega la OPV de los 4 meses
-- junto con la hexavalente 2a; el R1 de los 18 meses es hexavalente + OPV y el R2 de los 4 años, DPT + OPV.

-- ---- OPV de los 4 meses ("2a. OPV" del cuaderno) ----
INSERT INTO serie (codigo, nombre, estacional, informativa) VALUES ('OPV_4M', 'Polio oral (OPV) 4 meses', false, false)
ON CONFLICT (codigo) DO NOTHING;

-- Va con la hexavalente 2a: un mes después de la 1a (de la polio de la hexavalente).
-- Solo para quienes empezaron con el esquema de la hexavalente: antes, la polio 2a y 3a ya eran OPV.
INSERT INTO esquema_dosis (serie_id, numero, etiqueta, edad_recomendada_dias, edad_minima_dias, edad_maxima_dias,
  intervalo_minimo_dias, intervalo_recomendado_dias, orden, dosis_previa_id, aplica_nacidos_desde)
SELECT s.id, 1, 'OPV 2a (4 meses)', 120, 70, NULL, 28, 60, 15, p.id, DATE '2025-07-01'
FROM serie s, esquema_dosis p JOIN serie sp ON sp.id = p.serie_id
WHERE s.codigo = 'OPV_4M' AND sp.codigo = 'POLIO' AND p.numero = 1
  AND NOT EXISTS (SELECT 1 FROM esquema_dosis d WHERE d.serie_id = s.id);

-- Una OPV cumple una sola dosis: la 2a de los 4 meses si le falta, si no la siguiente de la serie de polio
ALTER TABLE producto_serie ADD COLUMN IF NOT EXISTS exclusiva BOOLEAN NOT NULL DEFAULT false;
INSERT INTO producto_serie (producto_id, serie_id)
SELECT p.id, s.id FROM producto p, serie s WHERE p.codigo = 'OPV' AND s.codigo = 'OPV_4M'
ON CONFLICT DO NOTHING;
UPDATE producto_serie ps SET exclusiva = true FROM producto p, serie s
WHERE p.id = ps.producto_id AND s.id = ps.serie_id AND p.codigo = 'OPV' AND s.codigo IN ('OPV_4M', 'POLIO');

-- ---- Nombres como en el cuaderno 2026 ----
UPDATE serie SET nombre = 'Hexavalente / DPT' WHERE codigo = 'DPT_HIB_HB';
UPDATE esquema_dosis d SET etiqueta = v.etiqueta FROM serie s, (VALUES
  ('DPT_HIB_HB', 1, 'Hexavalente 1a'), ('DPT_HIB_HB', 2, 'Hexavalente 2a'), ('DPT_HIB_HB', 3, 'Hexavalente 3a'),
  ('DPT_HIB_HB', 4, 'Hexavalente R1'), ('DPT_HIB_HB', 5, 'DPT R2'),
  ('POLIO', 1, 'Polio 1a'), ('POLIO', 2, 'Polio 2a'), ('POLIO', 3, 'Polio 3a'), ('POLIO', 4, 'OPV R1'), ('POLIO', 5, 'OPV R2'),
  ('SPR', 1, 'SPR 1a'), ('SPR', 2, 'SPR 2a')
) v(serie, numero, etiqueta)
WHERE s.id = d.serie_id AND s.codigo = v.serie AND d.numero = v.numero;

-- La pentavalente y la IPV ya no se piden ni se ponen: quedan solo para registrar antecedentes
UPDATE producto SET activo = false WHERE codigo IN ('PENTA', 'IPV', 'FIPV');

-- ---- Columnas del cuaderno 5a 2026 (páginas 3 a 11) ----
-- Se quitan las de 2017 (Pentavalente, Polio IPV/OPV por separado, influenza Sur/Norte)
DELETE FROM columna_5a;
INSERT INTO columna_5a (pagina, grupo, etiqueta, orden, esquema_dosis_id, es_recuperacion, grupo_influenza)
SELECT v.pagina, v.grupo, v.etiqueta, v.orden, d.id, v.rec, v.gi
FROM (VALUES
 -- Menor de un año
 ('menor_1', 'Hep. "B"', 'Hep. "B"', 1, 'HB_RN', 1, false, NULL),
 ('menor_1', 'BCG', 'BCG', 2, 'BCG', 1, false, NULL),
 ('menor_1', 'OPV', '2a', 3, 'OPV_4M', 1, false, NULL),
 ('menor_1', 'Hexavalente', '1a', 4, 'DPT_HIB_HB', 1, false, NULL),
 ('menor_1', 'Hexavalente', '2a', 5, 'DPT_HIB_HB', 2, false, NULL),
 ('menor_1', 'Hexavalente', '3a', 6, 'DPT_HIB_HB', 3, false, NULL),
 ('menor_1', 'Rotavirus', '1a', 7, 'ROTA', 1, false, NULL),
 ('menor_1', 'Rotavirus', '2a', 8, 'ROTA', 2, false, NULL),
 ('menor_1', 'Neumococo', '1a', 9, 'NEUMO', 1, false, NULL),
 ('menor_1', 'Neumococo', '2a', 10, 'NEUMO', 2, false, NULL),
 ('menor_1', 'Influenza estacional', '1a', 11, 'INFLUENZA', 1, false, '6_11'),
 ('menor_1', 'Influenza estacional', '2a', 12, 'INFLUENZA', 2, false, '6_11'),
 -- 1 año a menor de 7
 ('uno_a_7', '12 meses', 'SPR 1a', 1, 'SPR', 1, false, NULL),
 ('uno_a_7', '12 meses', 'Neumococo R1', 2, 'NEUMO', 3, false, NULL),
 ('uno_a_7', '15 meses', 'Varicela 1a', 3, 'VARICELA', 1, false, NULL),
 ('uno_a_7', '1 a < 2 años', 'Influenza R1', 4, 'INFLUENZA', 1, false, '12_23'),
 ('uno_a_7', '18 meses', 'SPR 2a', 5, 'SPR', 2, false, NULL),
 ('uno_a_7', '18 meses', 'OPV R1', 6, 'POLIO', 4, false, NULL),
 ('uno_a_7', '18 meses', 'Hexavalente R1', 7, 'DPT_HIB_HB', 4, false, NULL),
 ('uno_a_7', '2 a < 3 años', 'Influenza R2', 8, 'INFLUENZA', 1, false, '24_35'),
 ('uno_a_7', '4 a < 5 años', 'OPV R2', 9, 'POLIO', 5, false, NULL),
 ('uno_a_7', '4 a < 5 años', 'DPT R2', 10, 'DPT_HIB_HB', 5, false, NULL),
 ('uno_a_7', '4 a < 5 años', 'Varicela refuerzo', 11, 'VARICELA', 2, false, NULL),
 -- Recuperación de 1 año a menor de 7
 ('recuperacion', 'Hexavalente', '1a', 1, 'DPT_HIB_HB', 1, true, NULL),
 ('recuperacion', 'Hexavalente', '2a', 2, 'DPT_HIB_HB', 2, true, NULL),
 ('recuperacion', 'Hexavalente', '3a', 3, 'DPT_HIB_HB', 3, true, NULL),
 ('recuperacion', 'Hexavalente', 'R1', 4, 'DPT_HIB_HB', 4, true, NULL),
 ('recuperacion', 'DPT', 'R2', 5, 'DPT_HIB_HB', 5, true, NULL),
 ('recuperacion', 'OPV', '2a', 6, 'OPV_4M', 1, true, NULL),
 ('recuperacion', 'OPV', 'R1', 7, 'POLIO', 4, true, NULL),
 ('recuperacion', 'OPV', 'R2', 8, 'POLIO', 5, true, NULL),
 ('recuperacion', 'Influenza 1 a < 3 años', '1a', 9, 'INFLUENZA', 1, true, NULL),
 ('recuperacion', 'Influenza 1 a < 3 años', '2a', 10, 'INFLUENZA', 2, true, NULL),
 ('recuperacion', 'SPR', '1a', 11, 'SPR', 1, true, NULL),
 ('recuperacion', 'SPR', '2a', 12, 'SPR', 2, true, NULL),
 ('recuperacion', 'Varicela', '1a', 13, 'VARICELA', 1, true, NULL),
 ('recuperacion', 'Varicela', 'R', 14, 'VARICELA', 2, true, NULL),
 ('recuperacion', 'Otras vacunas', 'SPR dosis cero', 15, 'SPR_CERO', 1, false, NULL)
) v(pagina, grupo, etiqueta, orden, serie, numero, rec, gi)
JOIN serie s ON s.codigo = v.serie
JOIN esquema_dosis d ON d.serie_id = s.id AND d.numero = v.numero;
