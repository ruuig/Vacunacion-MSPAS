-- Suplementación según el servicio:
--  · 6 a 11 meses: Vitamina A (dosis única) y Micronutrientes (2 cajas de 30 sobres, para dos meses).
--  · 1 a 4 años: Vitamina A, Micronutrientes y Desparasitante cada 6 meses (dos por año).
--  · 5 años: solo Desparasitante, cada 6 meses.
-- Cada dosis se da 6 meses después de la anterior del mismo insumo (aunque sea del grupo de edad anterior).
ALTER TABLE suplemento_dosis DROP CONSTRAINT IF EXISTS suplemento_dosis_grupo_check;
ALTER TABLE suplemento_dosis ADD CONSTRAINT suplemento_dosis_grupo_check
  CHECK (grupo IN ('6_11','12_23','24_35','36_47','48_59','60_71'));

INSERT INTO suplemento_dosis (insumo, grupo, numero, etiqueta, edad_desde_dias, edad_hasta_dias, intervalo_dias, orden) VALUES
 ('VIT_A','24_35',1,'Vitamina A 1a',730,1094,180,28),
 ('VIT_A','24_35',2,'Vitamina A 2a',730,1094,180,29),
 ('VIT_A','36_47',1,'Vitamina A 1a',1095,1459,180,40),
 ('VIT_A','36_47',2,'Vitamina A 2a',1095,1459,180,41),
 ('MICRO','36_47',1,'Micronutrientes 1a',1095,1459,180,42),
 ('MICRO','36_47',2,'Micronutrientes 2a',1095,1459,180,43),
 ('DESPARASITANTE','36_47',1,'Desparasitante 1a',1095,1459,180,44),
 ('DESPARASITANTE','36_47',2,'Desparasitante 2a',1095,1459,180,45),
 ('VIT_A','48_59',1,'Vitamina A 1a',1460,1825,180,50),
 ('VIT_A','48_59',2,'Vitamina A 2a',1460,1825,180,51),
 ('MICRO','48_59',1,'Micronutrientes 1a',1460,1825,180,52),
 ('MICRO','48_59',2,'Micronutrientes 2a',1460,1825,180,53),
 ('DESPARASITANTE','48_59',1,'Desparasitante 1a',1460,1825,180,54),
 ('DESPARASITANTE','48_59',2,'Desparasitante 2a',1460,1825,180,55),
 ('DESPARASITANTE','60_71',1,'Desparasitante 1a',1826,2190,180,60),
 ('DESPARASITANTE','60_71',2,'Desparasitante 2a',1826,2190,180,61)
ON CONFLICT (insumo, grupo, numero) DO NOTHING;

UPDATE suplemento_dosis SET etiqueta = 'Vitamina A (dosis única)' WHERE insumo = 'VIT_A' AND grupo = '6_11';
UPDATE suplemento_dosis SET etiqueta = 'Micronutrientes (2 cajas)' WHERE insumo = 'MICRO' AND grupo = '6_11';
-- 6 meses desde la anterior del mismo insumo; la primera de cada insumo no espera a nada
UPDATE suplemento_dosis SET intervalo_dias = 180
  WHERE NOT (grupo = '6_11' OR (insumo = 'DESPARASITANTE' AND grupo = '12_23' AND numero = 1));
