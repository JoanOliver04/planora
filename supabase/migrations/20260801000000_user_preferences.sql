alter table public.profiles
  add column if not exists preferences jsonb not null default
  '{
    "accent": "#4f6b45",
    "density": "comfortable",
    "fontScale": 100,
    "radius": "rounded",
    "reduceMotion": false,
    "showCompleted": true
  }'::jsonb;

alter table public.profiles
  add constraint profiles_preferences_object
  check (jsonb_typeof(preferences) = 'object');
