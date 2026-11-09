CREATE TABLE public.candidate_credentials (
  candidate_id uuid PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.candidate_credentials TO service_role;
ALTER TABLE public.candidate_credentials ENABLE ROW LEVEL SECURITY;