-- Roles
create type public.app_role as enum ('admin', 'recruiter');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_recruiter()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'recruiter') or public.has_role(auth.uid(), 'admin')
$$;

create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role) values (new.id, 'recruiter') on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created_role after insert on auth.users
  for each row execute function public.handle_new_user_role();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Jobs
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  missions text not null default '',
  skills text not null default '',
  experience text not null default '',
  diplomas text not null default '',
  location text not null default '',
  contract_type text not null default 'CDI',
  link_validity_days integer not null default 14,
  sender_email text not null default '',
  invitation_message text not null default '',
  confirmation_message text not null default '',
  rejection_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

create table public.job_criteria (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  mandatory boolean not null default false,
  weight integer not null default 0 check (weight >= 0 and weight <= 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger candidates_touch before update on public.candidates for each row execute function public.touch_updated_at();

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  status text not null default 'received' check (status in ('received','interview_pending','interview_done','to_review','decided')),
  analysis_status text not null default 'pending' check (analysis_status in ('pending','extracting','analyzing','done','error')),
  analysis_error text,
  cv_path text,
  cv_filename text,
  cv_text text,
  cv_pages jsonb,
  match_score integer,
  recommendation text,
  access_token_hash text unique,
  token_expires_at timestamptz,
  token_revoked boolean not null default false,
  identity_confirmed_at timestamptz,
  consent_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index applications_job_idx on public.applications(job_id);
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();

create table public.cv_analyses (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  result jsonb not null,
  match_score integer,
  recommendation text,
  confidence numeric,
  model text,
  created_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  current_index integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  summary jsonb,
  analysis_status text not null default 'pending' check (analysis_status in ('pending','analyzing','done','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger interviews_touch before update on public.interviews for each row execute function public.touch_updated_at();

create table public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  kind text not null check (kind in ('common','personalized')),
  question text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  answer_text text not null default '',
  input_mode text not null default 'text' check (input_mode in ('text','voice')),
  updated_at timestamptz not null default now(),
  unique (interview_id, question_id)
);

create table public.recruitment_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  decision text not null check (decision in ('invite_meeting','request_verification','reject')),
  comment text,
  decided_by uuid not null,
  decided_by_email text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

-- Grants (recruiters only; candidates go through server code)
grant select, insert, update, delete on public.jobs, public.job_criteria, public.candidates, public.applications,
  public.cv_analyses, public.interviews, public.interview_questions, public.interview_answers,
  public.recruitment_decisions, public.notifications to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant all on public.jobs, public.job_criteria, public.candidates, public.applications, public.cv_analyses,
  public.interviews, public.interview_questions, public.interview_answers, public.recruitment_decisions,
  public.notifications, public.audit_logs to service_role;

alter table public.jobs enable row level security;
alter table public.job_criteria enable row level security;
alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.cv_analyses enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_answers enable row level security;
alter table public.recruitment_decisions enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "Recruiters manage jobs" on public.jobs for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
create policy "Recruiters manage criteria" on public.job_criteria for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
create policy "Recruiters manage candidates" on public.candidates for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
create policy "Recruiters manage applications" on public.applications for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
create policy "Recruiters read analyses" on public.cv_analyses for select to authenticated using (public.is_recruiter());
create policy "Recruiters manage interviews" on public.interviews for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
create policy "Recruiters manage questions" on public.interview_questions for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
create policy "Recruiters read answers" on public.interview_answers for select to authenticated using (public.is_recruiter());
create policy "Recruiters read decisions" on public.recruitment_decisions for select to authenticated using (public.is_recruiter());
create policy "Recruiters insert own decisions" on public.recruitment_decisions for insert to authenticated with check (public.is_recruiter() and decided_by = auth.uid());
create policy "Recruiters manage notifications" on public.notifications for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
create policy "Recruiters read audit" on public.audit_logs for select to authenticated using (public.is_recruiter());
create policy "Recruiters write audit" on public.audit_logs for insert to authenticated with check (public.is_recruiter());

-- Storage policies for private CV bucket
create policy "Recruiters read CVs" on storage.objects for select to authenticated using (bucket_id = 'cvs' and public.is_recruiter());
create policy "Recruiters upload CVs" on storage.objects for insert to authenticated with check (bucket_id = 'cvs' and public.is_recruiter());
create policy "Recruiters delete CVs" on storage.objects for delete to authenticated using (bucket_id = 'cvs' and public.is_recruiter());

-- Example configuration (editable by recruiters)
with j as (
  insert into public.jobs (title, description, missions, skills, experience, diplomas, location, contract_type, sender_email, invitation_message, confirmation_message, rejection_template)
  values ('Responsable d''entrepôt logistique',
    'Piloter un entrepôt de distribution du Groupe Orvane.',
    'Encadrer les équipes, garantir la performance des flux, fiabiliser les stocks.',
    'Management, gestion logistique, gestion des stocks, WMS, amélioration continue',
    '5 ans minimum en logistique, dont 2 ans en management',
    'Bac+3 à Bac+5 en logistique / supply chain',
    'Lyon', 'CDI', 'recrutement@orvane.fr',
    'Bonjour, merci pour votre candidature. Nous vous invitons à réaliser un pré-entretien écrit en ligne, au moment de votre choix.',
    'Merci, vos réponses ont bien été enregistrées. Un recruteur reviendra vers vous.',
    'Bonjour, après examen attentif de votre candidature par notre équipe, nous ne pouvons pas y donner une suite favorable. Merci pour l''intérêt porté au Groupe Orvane.')
  returning id
), c as (
  insert into public.job_criteria (job_id, name, mandatory, weight, position)
  select j.id, v.name, v.mandatory, v.weight, v.position from j,
  (values ('Management', true, 25, 0), ('Gestion logistique', true, 25, 1), ('Gestion des stocks', true, 20, 2), ('Maîtrise WMS', false, 15, 3), ('Amélioration continue', false, 15, 4)) as v(name, mandatory, weight, position)
  returning 1
)
insert into public.interview_questions (job_id, kind, question, position)
select j.id, v.kind, v.q, v.position from j,
(values
  ('common', 'Pourquoi souhaitez-vous rejoindre le Groupe Orvane sur ce poste ?', 0),
  ('common', 'Décrivez une situation où vous avez encadré une équipe en période de forte activité.', 1),
  ('common', 'Comment fiabilisez-vous les stocks d''un entrepôt au quotidien ?', 2),
  ('common', 'Quelle démarche d''amélioration continue avez-vous menée et avec quels résultats ?', 3),
  ('personalized', 'Approfondir une expérience de management mentionnée dans le CV.', 4),
  ('personalized', 'Clarifier une information manquante ou à vérifier dans le CV.', 5)
) as v(kind, q, position);