-- Tidy-up: the old left/centre/right "side" field is replaced by fromLeft.
update public.pin_sheets set pins = (select jsonb_agg(p - 'side' order by (p->>'hole')::int) from jsonb_array_elements(pins) p);
