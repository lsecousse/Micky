-- ====================================================
-- Import historique — lionel@secousse.net
-- Coller et exécuter dans : Supabase > SQL Editor > New query
-- ====================================================

DO $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT id INTO v_client_id FROM public.profiles WHERE email = 'lionel@secousse.net';

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur lionel@secousse.net introuvable dans profiles';
  END IF;

  -- Séance N°3 — 2026-03-25
  INSERT INTO public.sessions (id, client_id, programme_name, date, started_at, duration, exercises)
  VALUES (
    'mn65bh6gt2kis',
    v_client_id,
    'Séance N°3',
    '2026-03-25',
    '2026-03-25T14:35:34.457Z',
    58,
    '[
      {"name":"Seated row","muscle":"Dos","series":[{"reps":20,"weight":13.3,"rest":75,"done":true},{"reps":20,"weight":13.3,"rest":75,"done":true},{"reps":20,"weight":13.3,"rest":75,"done":true},{"reps":20,"weight":13.3,"rest":75,"done":true}]},
      {"name":"Convergente","muscle":"Dos","series":[{"reps":20,"weight":30,"rest":75,"done":true},{"reps":20,"weight":30,"rest":75,"done":true},{"reps":20,"weight":30,"rest":75,"done":true},{"reps":20,"weight":30,"rest":75,"done":true}]},
      {"name":"Shoulder press","muscle":"Epaules","series":[{"reps":16,"weight":4.5,"rest":75,"done":true},{"reps":16,"weight":4.5,"rest":75,"done":true},{"reps":16,"weight":4.5,"rest":75,"done":true},{"reps":16,"weight":4.5,"rest":75,"done":true}]},
      {"name":"Latéral raise","muscle":"Epaules","series":[{"reps":20,"weight":4.5,"rest":75,"done":true},{"reps":20,"weight":4.5,"rest":75,"done":true},{"reps":20,"weight":4.5,"rest":75,"done":true},{"reps":20,"weight":4.5,"rest":75,"done":true}]},
      {"name":"Rear delt","muscle":"Epaules","series":[{"reps":20,"weight":11,"rest":75,"done":true},{"reps":20,"weight":11,"rest":75,"done":true},{"reps":20,"weight":11,"rest":75,"done":true},{"reps":20,"weight":11,"rest":75,"done":true}]}
    ]'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Séance N°1 — 2026-03-26
  INSERT INTO public.sessions (id, client_id, programme_name, date, started_at, duration, exercises)
  VALUES (
    'mn72p3pobbrjv',
    v_client_id,
    'Séance N°1',
    '2026-03-26',
    '2026-03-26T06:09:57.516Z',
    3854,
    '[
      {"name":"Chest press","muscle":"Pectoraux","series":[{"reps":20,"weight":6.8,"rest":75,"done":true},{"reps":20,"weight":6.8,"rest":75,"done":true},{"reps":20,"weight":6.8,"rest":75,"done":true},{"reps":20,"weight":6.8,"rest":75,"done":true}]},
      {"name":"Pec fly","muscle":"Pectoraux","series":[{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":25,"rest":75,"done":true},{"reps":20,"weight":25,"rest":75,"done":true}]},
      {"name":"Curl barre","muscle":"Biceps","series":[{"reps":12,"weight":10,"rest":75,"done":true},{"reps":12,"weight":10,"rest":75,"done":true},{"reps":12,"weight":10,"rest":75,"done":true},{"reps":12,"weight":15,"rest":75,"done":true}]},
      {"name":"Arm Curl","muscle":"Biceps","series":[{"reps":12,"weight":4.5,"rest":75,"done":true},{"reps":12,"weight":4.5,"rest":75,"done":true},{"reps":12,"weight":4.5,"rest":75,"done":true},{"reps":12,"weight":6.7,"rest":75,"done":true}]},
      {"name":"Seated dip","muscle":"Biceps","series":[{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true}]},
      {"name":"Triceps à la poulie haute corde","muscle":"Triceps","series":[{"reps":20,"weight":4.5,"rest":75,"done":true},{"reps":20,"weight":9,"rest":75,"done":true},{"reps":20,"weight":9,"rest":75,"done":true},{"reps":20,"weight":9,"rest":75,"done":true}]}
    ]'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Séance N°2 — 2026-03-27
  INSERT INTO public.sessions (id, client_id, programme_name, date, started_at, duration, exercises)
  VALUES (
    'mn8ik1dppugb0',
    v_client_id,
    'Séance N°2',
    '2026-03-27',
    '2026-03-27T06:21:41.245Z',
    4953,
    '[
      {"name":"Climb box","muscle":"Cuisses","series":[{"reps":12,"weight":0,"rest":75,"done":true},{"reps":12,"weight":0,"rest":75,"done":true},{"reps":12,"weight":0,"rest":75,"done":true},{"reps":12,"weight":0,"rest":75,"done":true}]},
      {"name":"Leg extension","muscle":"Cuisses","series":[{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true}]},
      {"name":"Hip abduction","muscle":"Cuisses","series":[{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":20.2,"rest":75,"done":true},{"reps":20,"weight":20.2,"rest":75,"done":true},{"reps":20,"weight":20.2,"rest":75,"done":true}]},
      {"name":"Hip adduction","muscle":"Cuisses","series":[{"reps":20,"weight":11,"rest":75,"done":true},{"reps":20,"weight":11,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true}]},
      {"name":"Rotary hip","muscle":"Cuisses","series":[{"reps":20,"weight":39,"rest":75,"done":true},{"reps":20,"weight":39,"rest":75,"done":true},{"reps":20,"weight":39,"rest":75,"done":true},{"reps":20,"weight":52,"rest":75,"done":true}]},
      {"name":"Press","muscle":"Cuisses","series":[{"reps":20,"weight":34,"rest":60,"done":true},{"reps":20,"weight":34,"rest":60,"done":true},{"reps":20,"weight":34,"rest":60,"done":true},{"reps":20,"weight":34,"rest":60,"done":true}]}
    ]'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Séance N°3 — 2026-03-28
  INSERT INTO public.sessions (id, client_id, programme_name, date, started_at, duration, exercises)
  VALUES (
    'mnacd16e9j0vf',
    v_client_id,
    'Séance N°3',
    '2026-03-28',
    '2026-03-28T13:03:49.046Z',
    3109,
    '[
      {"name":"Seated row","muscle":"Dos","series":[{"reps":20,"weight":13.3,"rest":75,"done":true},{"reps":20,"weight":13.3,"rest":75,"done":true},{"reps":20,"weight":13.3,"rest":75,"done":true},{"reps":20,"weight":15.5,"rest":75,"done":true}]},
      {"name":"Convergente","muscle":"Dos","series":[{"reps":20,"weight":30,"rest":75,"done":true},{"reps":20,"weight":30,"rest":75,"done":true},{"reps":20,"weight":30,"rest":75,"done":true},{"reps":20,"weight":35,"rest":75,"done":true}]},
      {"name":"Shoulder press","muscle":"Epaules","series":[{"reps":16,"weight":4.5,"rest":75,"done":true},{"reps":16,"weight":5.6,"rest":75,"done":true},{"reps":16,"weight":5.6,"rest":75,"done":true},{"reps":16,"weight":5.6,"rest":75,"done":true}]},
      {"name":"Latéral raise","muscle":"Epaules","series":[{"reps":20,"weight":4.5,"rest":75,"done":true},{"reps":20,"weight":4.5,"rest":75,"done":true},{"reps":20,"weight":4.5,"rest":75,"done":true},{"reps":20,"weight":4.5,"rest":75,"done":true}]},
      {"name":"Rear delt","muscle":"Epaules","series":[{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true},{"reps":20,"weight":18,"rest":75,"done":true}]}
    ]'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✅ 4 séances importées pour %', v_client_id;
END;
$$;
