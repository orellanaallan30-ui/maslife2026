-- Una sesión ya terminada deja de ocupar su hora.
--
-- El índice uq_slot_active (migración 0004) protege contra la doble reserva:
-- una sola cita por (profesional, fecha, hora) mientras no esté cancelada. Pero
-- también consideraba ocupadas las citas ya FINALIZADAS, así que el profesional
-- no podía reutilizar esa casilla después de atender al paciente: Postgres
-- rechazaba la fila nueva aunque la agenda mostrara la hora libre.
--
-- La protección se mantiene idéntica para todo lo que sigue vigente; solo se
-- suma 'Finalizado' a los estados que ya no ocupan, junto a 'Cancelado'.

DROP INDEX IF EXISTS uq_slot_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_active
  ON appointments (professional_id, date, time)
  WHERE status NOT IN ('Cancelado', 'Finalizado');
