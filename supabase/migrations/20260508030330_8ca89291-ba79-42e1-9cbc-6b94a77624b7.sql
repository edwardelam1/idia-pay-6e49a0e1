CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
    WHERE business_id = _business_id AND user_id = auth.uid() AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_business_manager(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
    WHERE business_id = _business_id AND user_id = auth.uid() AND is_active = true
      AND role IN ('owner'::user_role,'manager'::user_role)
  )
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.inventory_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  location_id uuid,
  batch_id text NOT NULL,
  inventory_item_id uuid,
  item_name text NOT NULL,
  unit text NOT NULL DEFAULT 'unit',
  theoretical_yield numeric NOT NULL,
  actual_yield numeric NOT NULL,
  variance_amount numeric GENERATED ALWAYS AS (actual_yield - theoretical_yield) STORED,
  tolerance_threshold numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  value_lost numeric GENERATED ALWAYS AS (GREATEST(theoretical_yield - actual_yield, 0) * unit_cost) STORED,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  resolved_at timestamptz
);
CREATE INDEX idx_inventory_variances_biz_status ON public.inventory_variances(business_id, status);
ALTER TABLE public.inventory_variances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business members can view variances" ON public.inventory_variances FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "Managers can insert variances" ON public.inventory_variances FOR INSERT WITH CHECK (public.is_business_manager(business_id));
CREATE POLICY "Managers can update variances" ON public.inventory_variances FOR UPDATE USING (public.is_business_manager(business_id));

CREATE TABLE public.variance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variance_id uuid NOT NULL REFERENCES public.inventory_variances(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  root_cause text NOT NULL CHECK (root_cause IN ('Poor Trim','Spillage','Unrecorded Waste','Theft')),
  corrective_action text NOT NULL CHECK (corrective_action IN ('Par Adjustment','Staff Re-training','Vendor Claim')),
  manager_auth_pin_hash text NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  reconciled_by uuid
);
CREATE INDEX idx_variance_corrections_variance ON public.variance_corrections(variance_id);
ALTER TABLE public.variance_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business members can view corrections" ON public.variance_corrections FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "Managers can insert corrections" ON public.variance_corrections FOR INSERT WITH CHECK (public.is_business_manager(business_id));

CREATE OR REPLACE FUNCTION public.submit_variance_correction(
  _variance_id uuid, _root_cause text, _corrective_action text, _manager_pin text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _biz uuid; _correction_id uuid;
BEGIN
  IF _manager_pin IS NULL OR length(_manager_pin) < 4 THEN
    RAISE EXCEPTION 'Manager PIN must be at least 4 characters';
  END IF;
  SELECT business_id INTO _biz FROM public.inventory_variances WHERE id = _variance_id;
  IF _biz IS NULL THEN RAISE EXCEPTION 'Variance not found'; END IF;
  IF NOT public.is_business_manager(_biz) THEN
    RAISE EXCEPTION 'Insufficient privileges for business %', _biz;
  END IF;
  INSERT INTO public.variance_corrections (
    variance_id, business_id, root_cause, corrective_action, manager_auth_pin_hash, reconciled_by
  ) VALUES (
    _variance_id, _biz, _root_cause, _corrective_action,
    crypt(_manager_pin, gen_salt('bf')), auth.uid()
  ) RETURNING id INTO _correction_id;
  UPDATE public.inventory_variances SET status = 'resolved', resolved_at = now() WHERE id = _variance_id;
  RETURN _correction_id;
END;
$$;