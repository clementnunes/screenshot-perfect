ALTER TABLE public.interviews ADD COLUMN invited_at timestamptz;
CREATE OR REPLACE FUNCTION public.handle_new_user_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN RETURN new; END; $$;
COMMENT ON FUNCTION public.handle_new_user_role() IS 'New accounts never receive recruiter privileges automatically. Existing roles are preserved.';
CREATE OR REPLACE FUNCTION public.save_portal_answer(p_application uuid, p_question uuid, p_text text, p_index integer) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE iv public.interviews; saved timestamptz := now(); BEGIN
SELECT * INTO iv FROM public.interviews WHERE application_id=p_application FOR UPDATE;
IF iv.id IS NULL OR iv.status='completed' THEN RAISE EXCEPTION 'Pré-entretien indisponible ou déjà soumis.'; END IF;
IF length(p_text)>5000 OR p_index<0 OR p_index >= (SELECT count(*) FROM public.interview_questions WHERE application_id=p_application) OR NOT EXISTS(SELECT 1 FROM public.interview_questions WHERE id=p_question AND application_id=p_application) THEN RAISE EXCEPTION 'Réponse invalide.'; END IF;
INSERT INTO public.interview_answers(interview_id,question_id,answer_text,input_mode,updated_at) VALUES(iv.id,p_question,p_text,'text',saved) ON CONFLICT(interview_id,question_id) DO UPDATE SET answer_text=excluded.answer_text,updated_at=excluded.updated_at;
UPDATE public.interviews SET status='in_progress',started_at=coalesce(started_at,saved),current_index=p_index WHERE id=iv.id;
RETURN saved; END; $$;
REVOKE ALL ON FUNCTION public.save_portal_answer(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_portal_answer(uuid,uuid,text,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.submit_portal_interview(p_application uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE iv public.interviews; BEGIN
SELECT * INTO iv FROM public.interviews WHERE application_id=p_application FOR UPDATE;
IF iv.id IS NULL THEN RAISE EXCEPTION 'Pré-entretien indisponible.'; END IF;
IF iv.status='completed' THEN RETURN iv.id; END IF;
IF NOT EXISTS(SELECT 1 FROM public.interview_questions WHERE application_id=p_application) OR EXISTS(SELECT 1 FROM public.interview_questions q WHERE q.application_id=p_application AND NOT EXISTS(SELECT 1 FROM public.interview_answers a WHERE a.interview_id=iv.id AND a.question_id=q.id AND length(trim(a.answer_text))>0)) THEN RAISE EXCEPTION 'Merci de répondre à toutes les questions.'; END IF;
UPDATE public.interviews SET status='completed',completed_at=now(),analysis_status='pending' WHERE id=iv.id;
UPDATE public.applications SET status='interview_done' WHERE id=p_application AND status<>'decided';
RETURN iv.id; END; $$;
REVOKE ALL ON FUNCTION public.submit_portal_interview(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_portal_interview(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.prepare_portal_interview(p_application uuid,p_questions jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE iv public.interviews; jid uuid; BEGIN
SELECT job_id INTO jid FROM public.applications WHERE id=p_application FOR UPDATE;
IF jid IS NULL THEN RAISE EXCEPTION 'Candidature introuvable.'; END IF;
SELECT * INTO iv FROM public.interviews WHERE application_id=p_application FOR UPDATE;
IF iv.id IS NOT NULL AND iv.status<>'not_started' THEN RETURN iv.id; END IF;
IF jsonb_array_length(p_questions)=0 THEN RAISE EXCEPTION 'Aucune question disponible.'; END IF;
IF iv.id IS NULL THEN INSERT INTO public.interviews(application_id) VALUES(p_application) RETURNING * INTO iv; END IF;
DELETE FROM public.interview_questions WHERE application_id=p_application;
INSERT INTO public.interview_questions(job_id,application_id,question,kind,position) SELECT jid,p_application,x.value->>'question',x.value->>'kind',x.ordinality-1 FROM jsonb_array_elements(p_questions) WITH ORDINALITY x;
RETURN iv.id; END; $$;
REVOKE ALL ON FUNCTION public.prepare_portal_interview(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_portal_interview(uuid,jsonb) TO service_role;