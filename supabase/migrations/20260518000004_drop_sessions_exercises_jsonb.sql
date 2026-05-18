-- Phase 1 finale — la colonne jsonb n'est plus source de vérité.
-- Toutes les lectures passent par session_exercises depuis les Tasks 8 et 10.
-- Toutes les écritures passent par la RPC upsert_session_with_exercises depuis la Task 7.

alter table public.sessions drop column exercises;
