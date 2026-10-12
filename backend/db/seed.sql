-- Datos iniciales: parámetros, establecimientos, comunidades, esquema y columnas del cuaderno SIGSA 5a (2017)

INSERT INTO parametro (clave, valor, descripcion) VALUES
 ('dias_ventana_aviso','7','Cuándo una dosis pasa a Próxima'),
 ('dias_tolerancia_atraso','28','Cuándo una dosis pasa a Atrasada'),
 ('dias_abandono','90','Cuándo el atraso se considera abandono'),
 ('porcentaje_reserva_jornada','10','Biológicos extra por jornada'),
 ('edad_egreso_meses','84','Fin del seguimiento: el 5a cubre de 0 a menores de 7 años'),
 ('hora_calculo_diario','05:00','Proceso programado del motor'),
 ('influenza_inicio','2025-10-15','Inicio de la temporada de influenza vigente'),
 ('influenza_fin','2026-02-15','Fin de la temporada de influenza vigente'),
 ('influenza_formulacion','norte','Formulación vigente (sur o norte)'),
 ('area_salud','Jalapa','Encabezado del informe'),
 ('distrito','San Luis Jilotepeque','Encabezado del informe');

INSERT INTO establecimiento (nombre, tipo, es_local) VALUES
 ('Centro de Salud San Luis Jilotepeque','centro',true),
 ('Puesto de Salud Chagüitón','puesto',true),
 ('Puesto de Salud Trapichitos','puesto',true),
 ('Puesto de Salud Valencia','puesto',true),
 ('Puesto de Salud Los Olivos','puesto',true),
 ('Externo','otro_municipio',false);

-- TODO: completar las 23 aldeas y 12 caseríos y asignar territorio y sector (confirmar con el distrito)
INSERT INTO comunidad (nombre, tipo) VALUES
 ('Casco urbano','casco_urbano'),
 ('Chagüitón','aldea'), ('Trapichitos','aldea'), ('Valencia','aldea'), ('Los Olivos','aldea'),
 ('Tempiscón','caserio'), ('Las Mesonas','caserio'), ('San Marcos','caserio'),
 ('Chiquirín','caserio'), ('Cerro Redondo','caserio'), ('El Flor','caserio');

INSERT INTO serie (codigo, nombre, estacional, informativa) VALUES
 ('HB_RN','Hepatitis B',false,false),
 ('BCG','BCG',false,false),
 ('POLIO','Polio',false,false),
 ('DPT_HIB_HB','Pentavalente / DPT',false,false),
 ('ROTA','Rotavirus',false,false),
 ('NEUMO','Neumococo',false,false),
 ('SPR','SPR',false,false),
 ('INFLUENZA','Influenza pediátrica',true,false),
 ('VARICELA','Varicela',false,false),
 ('SPR_CERO','SPR dosis cero',false,true);

INSERT INTO producto (codigo, nombre, via, activo) VALUES
 ('HB_PED','Hepatitis B pediátrica','IM',true),
 ('BCG','BCG','ID',true),
 ('HEXA','Hexavalente','IM',true),
 ('PENTA','Pentavalente','IM',true),
 ('FIPV','fIPV','ID',false),
 ('IPV','IPV','IM',true),
 ('OPV','OPV','oral',true),
 ('DPT','DPT','IM',true),
 ('ROTA','Rotavirus','oral',true),
 ('NEUMO','Neumococo','IM',true),
 ('SPR','SPR','SC',true),
 ('INFL_PED','Influenza pediátrica','IM',true),
 ('VARICELA','Varicela','SC',true);

INSERT INTO producto_serie (producto_id, serie_id)
SELECT p.id, s.id FROM (VALUES
 ('HB_PED','HB_RN'), ('BCG','BCG'),
 ('HEXA','DPT_HIB_HB'), ('HEXA','POLIO'),
 ('PENTA','DPT_HIB_HB'), ('FIPV','POLIO'), ('IPV','POLIO'), ('OPV','POLIO'), ('DPT','DPT_HIB_HB'),
 ('ROTA','ROTA'), ('NEUMO','NEUMO'), ('INFL_PED','INFLUENZA'),
 ('SPR','SPR'), ('SPR','SPR_CERO'), ('VARICELA','VARICELA')
) v(prod, ser)
JOIN producto p ON p.codigo = v.prod JOIN serie s ON s.codigo = v.ser;

-- Días: 6 sem=42, 2m=60, 4m=120, 6m=180, 8m=243, 12m=365, 15m=456, 18m=548, 4a=1461, 35m=1094
INSERT INTO esquema_dosis (serie_id, numero, etiqueta, edad_recomendada_dias, edad_minima_dias, edad_maxima_dias, intervalo_minimo_dias, intervalo_recomendado_dias, orden)
SELECT s.id, v.numero, v.etiqueta, v.rec, v.min, v.max, v.imin, v.irec, v.orden FROM (VALUES
 ('HB_RN',1,'Hepatitis B',0,0,NULL::int,NULL::int,NULL::int,1),
 ('BCG',1,'BCG',0,0,364,NULL,NULL,2),
 ('POLIO',1,'Polio 1a',60,42,NULL,NULL,NULL,10),
 ('POLIO',2,'Polio 2a',120,70,NULL,28,60,11),
 ('POLIO',3,'Polio 3a',180,98,NULL,28,60,12),
 ('POLIO',4,'Polio R1',548,278,NULL,180,368,13),
 ('POLIO',5,'Polio R2',1461,458,NULL,180,913,14),
 ('DPT_HIB_HB',1,'Pentavalente 1a',60,42,NULL,NULL,NULL,20),
 ('DPT_HIB_HB',2,'Pentavalente 2a',120,70,NULL,28,60,21),
 ('DPT_HIB_HB',3,'Pentavalente 3a',180,98,NULL,28,60,22),
 ('DPT_HIB_HB',4,'DPT R1',548,278,NULL,180,368,23),
 ('DPT_HIB_HB',5,'DPT R2',1461,458,NULL,180,913,24),
 ('ROTA',1,'Rotavirus 1a',60,42,243,NULL,NULL,30),
 ('ROTA',2,'Rotavirus 2a',120,70,243,28,60,31),
 ('NEUMO',1,'Neumococo 1a',60,42,NULL,NULL,NULL,40),
 ('NEUMO',2,'Neumococo 2a',120,70,NULL,28,60,41),
 ('NEUMO',3,'Neumococo R1',365,126,NULL,56,245,42),
 ('SPR',1,'SPR 1',365,365,NULL,NULL,NULL,50),
 ('SPR',2,'SPR 2',548,395,NULL,30,183,51),
 ('INFLUENZA',1,'Influenza 1a',180,180,1094,NULL,NULL,60),
 ('INFLUENZA',2,'Influenza 2a',210,208,1094,28,30,61),
 ('VARICELA',1,'Varicela 1a',456,365,NULL,NULL,NULL,70),
 ('VARICELA',2,'Varicela refuerzo',1461,455,NULL,90,1005,71),
 ('SPR_CERO',1,'SPR dosis cero',180,180,364,NULL,NULL,80)
) v(serie, numero, etiqueta, rec, min, max, imin, irec, orden)
JOIN serie s ON s.codigo = v.serie;

UPDATE esquema_dosis d SET dosis_previa_id = p.id
FROM esquema_dosis p WHERE p.serie_id = d.serie_id AND p.numero = d.numero - 1;

-- Columnas impresas del cuaderno (páginas 3, 4 y 5)
INSERT INTO columna_5a (pagina, grupo, etiqueta, orden, esquema_dosis_id, producto_id, es_recuperacion, grupo_influenza, formulacion, sombreada)
SELECT v.pagina, v.grupo, v.etiqueta, v.orden, d.id, p.id, v.rec, v.gi, v.fo, v.sombra
FROM (VALUES
 -- P. 3 Menor de un año
 ('menor_1','Hep. "B"','Hep. "B"',1,'HB_RN',1,NULL,false,NULL,NULL,false),
 ('menor_1','BCG','BCG',2,'BCG',1,NULL,false,NULL,NULL,false),
 ('menor_1','Polio','1a (fIPV)',3,'POLIO',1,'FIPV',false,NULL,NULL,true),
 ('menor_1','Polio','2a (fIPV)',4,'POLIO',2,'FIPV',false,NULL,NULL,true),
 ('menor_1','Polio','1a (IPV)',5,'POLIO',1,NULL,false,NULL,NULL,false),
 ('menor_1','Polio','2a (OPV)',6,'POLIO',2,NULL,false,NULL,NULL,false),
 ('menor_1','Polio','3a (OPV)',7,'POLIO',3,NULL,false,NULL,NULL,false),
 ('menor_1','Pentavalente','1a',8,'DPT_HIB_HB',1,NULL,false,NULL,NULL,false),
 ('menor_1','Pentavalente','2a',9,'DPT_HIB_HB',2,NULL,false,NULL,NULL,false),
 ('menor_1','Pentavalente','3a',10,'DPT_HIB_HB',3,NULL,false,NULL,NULL,false),
 ('menor_1','Rotavirus','1a',11,'ROTA',1,NULL,false,NULL,NULL,false),
 ('menor_1','Rotavirus','2a',12,'ROTA',2,NULL,false,NULL,NULL,false),
 ('menor_1','Neumococo','1a',13,'NEUMO',1,NULL,false,NULL,NULL,false),
 ('menor_1','Neumococo','2a',14,'NEUMO',2,NULL,false,NULL,NULL,false),
 -- P. 4 De 1 año a menor de 7
 ('uno_a_7','12 meses','SPR 1',1,'SPR',1,NULL,false,NULL,NULL,false),
 ('uno_a_7','12 meses','NEUMO-R1',2,'NEUMO',3,NULL,false,NULL,NULL,false),
 ('uno_a_7','18 meses','SPR 2',3,'SPR',2,NULL,false,NULL,NULL,false),
 ('uno_a_7','18 meses','R1 (OPV)',4,'POLIO',4,NULL,false,NULL,NULL,false),
 ('uno_a_7','18 meses','R1 (DPT)',5,'DPT_HIB_HB',4,NULL,false,NULL,NULL,false),
 ('uno_a_7','4 a menor de 7 años','R2 (OPV)',6,'POLIO',5,NULL,false,NULL,NULL,false),
 ('uno_a_7','4 a menor de 7 años','R2 (DPT)',7,'DPT_HIB_HB',5,NULL,false,NULL,NULL,false),
 ('uno_a_7','Influenza 6 a 11 meses','1a Sur',10,'INFLUENZA',1,NULL,false,'6_11','sur',false),
 ('uno_a_7','Influenza 6 a 11 meses','1a Norte',11,'INFLUENZA',1,NULL,false,'6_11','norte',false),
 ('uno_a_7','Influenza 6 a 11 meses','2a Sur',12,'INFLUENZA',2,NULL,false,'6_11','sur',false),
 ('uno_a_7','Influenza 6 a 11 meses','2a Norte',13,'INFLUENZA',2,NULL,false,'6_11','norte',false),
 ('uno_a_7','Influenza 12 a 23 meses','1a Sur',14,'INFLUENZA',1,NULL,false,'12_23','sur',false),
 ('uno_a_7','Influenza 12 a 23 meses','1a Norte',15,'INFLUENZA',1,NULL,false,'12_23','norte',false),
 ('uno_a_7','Influenza 12 a 23 meses','2a Sur',16,'INFLUENZA',2,NULL,false,'12_23','sur',false),
 ('uno_a_7','Influenza 12 a 23 meses','2a Norte',17,'INFLUENZA',2,NULL,false,'12_23','norte',false),
 ('uno_a_7','Influenza 24 a 35 meses','1a Sur',18,'INFLUENZA',1,NULL,false,'24_35','sur',false),
 ('uno_a_7','Influenza 24 a 35 meses','1a Norte',19,'INFLUENZA',1,NULL,false,'24_35','norte',false),
 ('uno_a_7','Influenza 24 a 35 meses','2a Sur',20,'INFLUENZA',2,NULL,false,'24_35','sur',false),
 ('uno_a_7','Influenza 24 a 35 meses','2a Norte',21,'INFLUENZA',2,NULL,false,'24_35','norte',false),
 -- P. 5 Recuperación de 1 año a menor de 7 (TODO: confirmar las columnas exactas de Polio)
 ('recuperacion','Polio','1a',1,'POLIO',1,NULL,true,NULL,NULL,false),
 ('recuperacion','Polio','2a',2,'POLIO',2,NULL,true,NULL,NULL,false),
 ('recuperacion','Polio','3a',3,'POLIO',3,NULL,true,NULL,NULL,false),
 ('recuperacion','Polio','R1',4,'POLIO',4,NULL,true,NULL,NULL,false),
 ('recuperacion','Polio','R2',5,'POLIO',5,NULL,true,NULL,NULL,false),
 ('recuperacion','Pentavalente','1a',6,'DPT_HIB_HB',1,NULL,true,NULL,NULL,false),
 ('recuperacion','Pentavalente','2a',7,'DPT_HIB_HB',2,NULL,true,NULL,NULL,false),
 ('recuperacion','Pentavalente','3a',8,'DPT_HIB_HB',3,NULL,true,NULL,NULL,false),
 ('recuperacion','DPT','R1',9,'DPT_HIB_HB',4,NULL,true,NULL,NULL,false),
 ('recuperacion','DPT','R2',10,'DPT_HIB_HB',5,NULL,true,NULL,NULL,false),
 ('recuperacion','SPR','1',11,'SPR',1,NULL,true,NULL,NULL,false),
 ('recuperacion','SPR','2',12,'SPR',2,NULL,true,NULL,NULL,false),
 ('recuperacion','Otras vacunas','Varicela 1a',13,'VARICELA',1,NULL,false,NULL,NULL,false),
 ('recuperacion','Otras vacunas','Varicela refuerzo',14,'VARICELA',2,NULL,false,NULL,NULL,false),
 ('recuperacion','Otras vacunas','SPR dosis cero',15,'SPR_CERO',1,NULL,false,NULL,NULL,false)
) v(pagina, grupo, etiqueta, orden, serie, numero, prod, rec, gi, fo, sombra)
JOIN serie s ON s.codigo = v.serie
JOIN esquema_dosis d ON d.serie_id = s.id AND d.numero = v.numero
LEFT JOIN producto p ON p.codigo = v.prod;
