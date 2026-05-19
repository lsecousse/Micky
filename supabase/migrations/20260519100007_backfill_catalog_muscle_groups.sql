-- Backfill heuristique des muscle_groups pour les entrées catalog seedées vides.
-- Patterns basés sur les noms d'exos courants. Le coach complète/corrige
-- les cas ambigus via le form d'édition.

update public.exercise_catalog set muscle_groups = '{Abdos}'
  where coalesce(array_length(muscle_groups, 1), 0) = 0
    and (normalized_name like '%abdomin%' or normalized_name like '%crunch%'
         or normalized_name like '%gainage%' or normalized_name like '%plank%');

update public.exercise_catalog set muscle_groups = '{Bras}'
  where coalesce(array_length(muscle_groups, 1), 0) = 0
    and (normalized_name like '%curl%' or normalized_name like '%triceps%'
         or normalized_name like '%biceps%' or normalized_name like '%arm %');

update public.exercise_catalog set muscle_groups = '{Pec}'
  where coalesce(array_length(muscle_groups, 1), 0) = 0
    and (normalized_name like '%chest%' or normalized_name like '%pec %'
         or normalized_name like '%pec' or normalized_name like '%fly%'
         or normalized_name like 'convergente' or normalized_name like 'press');

update public.exercise_catalog set muscle_groups = '{Dos}'
  where coalesce(array_length(muscle_groups, 1), 0) = 0
    and (normalized_name like '%row%' or normalized_name like '%tirage%'
         or normalized_name like '%pull%' or normalized_name like '%lat %');

update public.exercise_catalog set muscle_groups = '{Épaules}'
  where coalesce(array_length(muscle_groups, 1), 0) = 0
    and (normalized_name like '%shoulder%' or normalized_name like '%delt%'
         or normalized_name like '%lateral raise%' or normalized_name like '%lateral%'
         or normalized_name like 'seated dip');

update public.exercise_catalog set muscle_groups = '{Jambes}'
  where coalesce(array_length(muscle_groups, 1), 0) = 0
    and (normalized_name like '%leg %' or normalized_name like '%squat%'
         or normalized_name like '%hip %' or normalized_name like '%glute%'
         or normalized_name like '%climb%' or normalized_name like '%rotary%'
         or normalized_name like '%adduction%' or normalized_name like '%abduction%');

do $$
declare
  v_filled int;
  v_empty int;
begin
  select count(*) into v_filled from public.exercise_catalog where coalesce(array_length(muscle_groups, 1), 0) > 0;
  select count(*) into v_empty  from public.exercise_catalog where coalesce(array_length(muscle_groups, 1), 0) = 0;
  raise notice 'Catalog muscle_groups : % remplis, % vides', v_filled, v_empty;
end $$;
