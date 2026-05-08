
CREATE TABLE public.business_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  location text NOT NULL,
  permit_type text NOT NULL,
  permit_number text NOT NULL,
  expiration_date date NOT NULL,
  inspector_name text,
  is_valid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_permits_business ON public.business_permits(business_id);
CREATE INDEX idx_business_permits_location ON public.business_permits(business_id, location);

ALTER TABLE public.business_permits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their business permits"
ON public.business_permits FOR SELECT
TO authenticated
USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert business permits"
ON public.business_permits FOR INSERT
TO authenticated
WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Members can update business permits"
ON public.business_permits FOR UPDATE
TO authenticated
USING (public.is_business_member(business_id))
WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Members can delete business permits"
ON public.business_permits FOR DELETE
TO authenticated
USING (public.is_business_member(business_id));

CREATE TRIGGER trg_business_permits_updated_at
BEFORE UPDATE ON public.business_permits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
