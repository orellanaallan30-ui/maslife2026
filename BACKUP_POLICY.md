# Política de Respaldo y Recuperación — Clínica Mas Life

**Versión:** 1.0  
**Fecha:** 5 de junio de 2026  
**Responsable:** Clínica Mas Life (contacto@clinicamaslife.cl)

---

## 1. Alcance

Esta política aplica a todos los datos almacenados en la plataforma **clinicamaslife.cl**, incluyendo:

- Fichas clínicas y notas SOAP de pacientes
- Datos de identificación de pacientes y profesionales
- Registros de agenda y citas
- Registros de auditoría (audit logs)
- Consentimientos informados digitales

---

## 2. Proveedor de Infraestructura

Los datos se almacenan en **Supabase** (PostgreSQL gestionado), alojado en AWS us-east-1.

### Backups automáticos incluidos (Plan Pro)

| Tipo | Frecuencia | Retención |
|------|-----------|-----------|
| Point-in-Time Recovery (PITR) | Continuo (WAL streaming) | 7 días |
| Snapshot diario | 1 vez al día (03:00 UTC) | 7 días |
| Snapshot semanal | Domingo 03:00 UTC | 28 días |

**Verificación:** Los backups se confirman automáticamente en el dashboard de Supabase en: *Project Settings → Backups*.

---

## 3. Objetivos de Recuperación

| Métrica | Objetivo |
|---------|----------|
| **RPO** (Recovery Point Objective — máxima pérdida de datos) | ≤ 5 minutos (PITR continuo) |
| **RTO** (Recovery Time Objective — tiempo máximo de restauración) | ≤ 4 horas |
| **Disponibilidad objetivo** | 99.9% mensual |

---

## 4. Procedimiento de Restauración

### 4.1 Restauración completa (incidente mayor)

1. Iniciar sesión en Supabase Dashboard como organización owner
2. Ir a **Project Settings → Backups**
3. Seleccionar el punto de restauración deseado (PITR o snapshot)
4. Hacer clic en **"Restore"** y confirmar
5. Esperar la restauración (estimado 30–90 minutos según volumen)
6. Verificar integridad: ejecutar `SELECT COUNT(*) FROM patients;` y comparar con registro previo
7. Notificar a los profesionales activos vía email

### 4.2 Restauración parcial (tabla específica)

1. Exportar snapshot específico desde Supabase: `pg_dump -t patients ...`
2. Restaurar en entorno de prueba para verificar
3. Importar registros faltantes con `INSERT ... ON CONFLICT DO NOTHING`

### 4.3 Recuperación de fichas eliminadas (soft-delete)

Las fichas clínicas eliminadas se mantienen en estado `deleted_at IS NOT NULL` por **90 días** antes de su purga definitiva. Durante este período:

```sql
-- Recuperar paciente eliminado por ID
UPDATE patients
SET deleted_at = NULL
WHERE id = '<patient_id>'
  AND deleted_at IS NOT NULL;
```

---

## 5. Pruebas de Restauración

| Actividad | Frecuencia | Responsable |
|-----------|-----------|-------------|
| Verificación de snapshot disponible | Mensual | Administrador técnico |
| Restauración de prueba en entorno sandbox | Trimestral | Administrador técnico |
| Revisión de política | Anual | Dirección Clínica Mas Life |

---

## 6. Notificación ante Incidentes

En caso de pérdida de datos o indisponibilidad prolongada (> 1 hora):

1. Notificar a todos los profesionales registrados por correo electrónico en un plazo máximo de **4 horas**
2. Publicar estado del servicio en el sitio (banner de mantenimiento)
3. Documentar el incidente en el registro interno de incidentes
4. Si el incidente involucra datos personales de salud (datos sensibles bajo Ley 21.719), notificar a los titulares afectados dentro de **72 horas**

---

## 7. Seguridad de los Backups

- Los backups de Supabase están cifrados en reposo con AES-256
- El acceso a la consola de backups requiere autenticación de la cuenta de organización (MFA activado)
- Los backups no contienen credenciales de acceso a la plataforma (las contraseñas usan hashing bcrypt gestionado por Supabase Auth)

---

## 8. Responsabilidades

| Rol | Responsabilidad |
|-----|----------------|
| Supabase | Ejecución automática de backups, integridad de la infraestructura |
| Administrador técnico Mas Life | Verificación periódica, ejecución de restauraciones |
| Dirección Clínica Mas Life | Aprobación de la política, notificación a titulares en incidentes |

---

## 9. Marco Normativo

Esta política cumple con:

- **Ley 21.719** — Nueva Ley de Protección de Datos Personales de Chile (vigente diciembre 2026)
- **Ley 20.584** — Derechos y deberes de las personas en acciones de salud
- **Circular MINSAL N° 21/2022** — Registros clínicos electrónicos
- **ISO/IEC 27001:2022** — Control A.8.13 (Backup de información)

---

*Última revisión: 5 de junio de 2026*
