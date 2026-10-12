# Control de vacunación infantil — San Luis Jilotepeque

Sistema web para el centro de salud: ficha nominal del niño con los campos del cuaderno SIGSA 5a (objetivo 1),
motor que calcula el esquema y genera alertas con control mensual y seguimiento (objetivo 2), y organización por
comunidad con jornadas extramurales que funcionan sin internet (objetivo 3).

## Estructura

```
backend/   Node + Express + PostgreSQL
  db/schema.sql         25 tablas, índices, restricciones
  db/seed.sql           parámetros, establecimientos, comunidades, esquema, columnas del 5a
  db/migraciones/       cambios de estructura, se aplican solos al arrancar
  db/datosDemo.js       datos de demostración (pasan por la API real)
  src/motor/            motor de cálculo puro (sin base de datos) — pruebas en test/
  src/routes/           API REST bajo /api
  src/fecha.js          fecha de hoy en Guatemala (no UTC)
  scripts/respaldo.sh   pg_dump diario con retención de 30 días
frontend/  React + Vite (PWA instalable)
  src/componentes/fueraDeLinea.js   jornada descargada y cola de registros sin señal
```

## Puesta en marcha (desarrollo)

Requisitos: Node 20+, PostgreSQL 14+ con las extensiones `pg_trgm` y `unaccent` (vienen con PostgreSQL).

```bash
# 1. Backend
cd backend
cp .env.example .env          # completar DATABASE_URL, JWT_SECRET, ADMIN_USUARIO, ADMIN_CONTRASENA
npm install
createdb -U postgres vacunacion
npm run db:init               # tablas + catálogos + administrador
npm run dev                   # API en http://localhost:3100/api

# 2. Frontend (otra terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5181
```

Crear usuarios (también desde Administración → Usuarios):

```bash
node db/crearUsuario.js enfermera1 'ContraseñaSegura' enfermera "Nombre Apellido" "Enfermera profesional"
node db/crearUsuario.js aux1 'ContraseñaSegura' vacunador "Nombre Apellido" "Auxiliar de enfermería"
```

Roles: `administrador` (configura y audita), `enfermera` (todo lo operativo + anular, cerrar alertas, jornadas,
informes), `vacunador` (registra niños y dosis, da seguimiento).

Datos de demostración (160 niños, lotes, alertas, seguimientos y jornadas; solo si la base no tiene niños), con el backend corriendo:

```bash
cd backend && npm run db:demo   # usuarios enfermera, vacunador, vacunador2 · contraseña Demo2026!
```

## Qué hace cada pantalla

| Pantalla | Para qué | Quién |
| --- | --- | --- |
| Inicio | "¿Qué quiere hacer?": mosaicos grandes según el rol y resumen del año | Todos |
| Buscar · Próximas citas | Encontrar al niño (tolera errores de escritura) o ver quién debe venir hoy, esta semana o este mes | Todos |
| Ficha → **Vacunar ahora** | Pasos guiados: marcar las vacunas puestas, decir por qué no se puso alguna (oportunidad perdida) y qué anotar en carné y cuaderno | Enfermera, vacunador |
| Registrar niño | Asistente de 3 pasos (niño, responsable, revisar); cuaderno y fila sugeridos | Enfermera, vacunador |
| Control del mes | Por vacunar (por comunidad, con llamada, WhatsApp y registro del contacto), vacunados día por día y pedido de vacunas a 3 meses; todo imprimible. Las alertas que genera el motor cada día se trabajan aquí | Todos (asigna la enfermera) |
| Comunidades | Prioridad por comunidad, cobertura y acceso directo a planificar una jornada | Todos |
| Jornadas | Preparación → **Iniciar jornada** → en curso (vacunar, «no llegó») → cerrar con devueltas. Equipo de varias personas; cada vacunador solo ve las suyas; funciona sin internet | Enfermera; el equipo asignado |
| Vacunas | Lotes con vencimiento, trazabilidad y consumo del mes | Enfermera, administrador |
| Tablero | Monitoreo mensual, comunidades por prioridad (OPS) y tipo de problema (OMS RED), seguimiento, oportunidades perdidas, jornadas, calidad de datos, plan de acción e informe de sala situacional | Enfermera, administrador |
| Informes | Mensual 5a (mes o rango libre) con revisión de calidad y constancia de envío, listados y cobertura | Enfermera, administrador |

## Cambios en la base de datos (migraciones)

Los cambios de estructura viven en `backend/db/migraciones/` y se aplican solos al arrancar el servidor (o con `npm run db:migrar`).
La tabla `migracion` registra cuáles ya se aplicaron. Antes de actualizar en producción, sacar un respaldo con `pg_dump`.

Para volver a cargar los datos de demostración desde cero (borra todo; sacar antes un respaldo con `pg_dump`):

```bash
psql -U postgres -d vacunacion -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cd backend && npm run db:init && npm run db:demo   # db:demo con el backend corriendo
```

## App instalable (PWA)

El frontend es una PWA: se instala en celular o computadora con el ícono del MSPAS y abre en pantalla completa.
Guarda la interfaz en el equipo y las consultas recientes (3 días) para **consultar sin conexión**.

**Jornadas sin internet:** al abrir una jornada (del equipo) se guarda sola en el teléfono: lista de niños, esquema de
cada uno, lotes y catálogos. Sin señal se puede iniciar la jornada, vacunar y marcar inasistencias; los registros
quedan en una cola local y se envían solos al volver la conexión. Fuera de las jornadas, registrar sigue necesitando internet.

- El service worker solo se genera con `npm run build` (en `npm run dev` no hay modo sin conexión).
- Los navegadores solo permiten instalarla con **HTTPS** o en `localhost`: en el celular se prueba con el servidor
  de producción (paso 3 de Producción). En iPhone: Safari → Compartir → “Agregar a pantalla de inicio”.
- Íconos en `frontend/public/iconos/` (generados a partir del escudo de `src/assets/mspas_vertical.png`).

## Pruebas

```bash
cd backend && npm test        # motor: casos CP-01 a CP-11, influenza, recuperación, SPR dosis cero
```

## Producción (VPS)

1. `cd frontend && npm run build` — Express sirve `frontend/dist` y la API desde el mismo proceso.
2. `cd backend && NODE_ENV=production PORT=3100 node src/server.js` bajo un gestor de procesos (systemd o pm2).
3. Nginx como proxy con HTTPS de Let's Encrypt hacia el puerto 3100.
4. Quitar a la aplicación el permiso de modificar la bitácora:
   `REVOKE UPDATE, DELETE ON bitacora FROM <usuario_de_la_app>;`
5. Respaldo diario: ver el encabezado de `backend/scripts/respaldo.sh` (cron a las 23:00 y prueba de restauración).

El motor recalcula a todos los niños cada día a las 05:00 (hora de Guatemala) y marca como egresados a los que cumplen 7 años.

## Pendiente de confirmar en el centro de salud

- Lista completa de aldeas y caseríos, territorios y sectores (hoy hay 11 comunidades de ejemplo).
- Columnas exactas de Polio en la página de recuperación; cómo anotan hoy la hexavalente.
- SPR dosis cero: edad y si cuenta como SPR 1 (hoy no cuenta).
- Formulación de influenza (Sur o Norte) y fechas de temporada (Administración → Parámetros).
- Tolerancia de atraso y días de abandono de la enfermera jefa (Administración → Parámetros).
- Edad máxima de Hepatitis B neonatal (hoy sin límite: queda atrasada si nunca se registró).
- Ventana del 2.º refuerzo de Polio/DPT (el carné indica de 4 a menor de 5 años).
- Cantidad de dosis por lote (inventario) y cambios al cuaderno SIGSA 5a.
- Población meta por comunidad (Comunidades → Población meta).
