-- ============================================================
-- GP Engage Platform — PostgreSQL Database Schema
-- Compatible with PostgreSQL 14+
-- All timestamps in UTC. UUIDs as primary keys throughout.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE request_status AS ENUM (
  'pending',        -- just submitted by patient
  'triaged',        -- reviewed, assigned to clinician/admin
  'in_progress',    -- clinician actively working on it
  'awaiting_patient', -- waiting for patient response
  'resolved',       -- closed with outcome
  'escalated',      -- flagged for urgent attention
  'cancelled'       -- withdrawn by patient or practice
);

CREATE TYPE request_type AS ENUM (
  'medical',        -- clinical symptom/condition query
  'admin',          -- sick note, test result, prescription repeat
  'prescription_repeat',
  'test_result',
  'referral',
  'video_consult',
  'callback_request'
);

CREATE TYPE severity_level AS ENUM (
  'routine',
  'urgent',
  'emergency'   -- triggers immediate alert to duty GP
);

CREATE TYPE consultation_channel AS ENUM (
  'online_form',
  'video',
  'telephone',
  'in_person',
  'messaging'
);

CREATE TYPE message_sender_type AS ENUM (
  'patient',
  'staff',
  'system'
);

CREATE TYPE notification_channel AS ENUM (
  'sms',
  'email',
  'push',
  'in_app'
);

CREATE TYPE notification_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'failed'
);

CREATE TYPE staff_role AS ENUM (
  'gp',
  'nurse',
  'advanced_practitioner',
  'receptionist',
  'practice_manager',
  'admin'
);

CREATE TYPE audit_action AS ENUM (
  'create',
  'read',
  'update',
  'delete',
  'login',
  'logout',
  'export',
  'assign',
  'escalate',
  'resolve'
);


-- ============================================================
-- PRACTICES
-- ============================================================

CREATE TABLE practices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(200)  NOT NULL,
  ods_code            VARCHAR(20)   NOT NULL UNIQUE,  -- NHS ODS code (e.g. S12345 for Aberdeen)
  address_line1       VARCHAR(200),
  address_line2       VARCHAR(200),
  city                VARCHAR(100),
  postcode            VARCHAR(10),
  phone               VARCHAR(20),
  email               VARCHAR(200),
  website_url         VARCHAR(500),

  -- Demand management controls
  medical_request_limit     INT DEFAULT 50,   -- max medical requests per day; 0 = disabled
  admin_request_limit       INT DEFAULT 100,  -- max admin requests per day; 0 = disabled
  requests_enabled          BOOLEAN DEFAULT TRUE,
  override_message          TEXT,             -- shown to patients when requests are disabled

  -- Opening hours (stored as JSONB for flexibility)
  -- e.g. {"mon": {"open": "08:00", "close": "18:00"}, ...}
  opening_hours       JSONB,

  -- Clinical system integration
  clinical_system     VARCHAR(50),   -- 'emis_web' | 'vision' | 'systmone'
  clinical_system_site_id VARCHAR(100),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ           -- soft delete
);

CREATE INDEX idx_practices_ods_code ON practices(ods_code);


-- ============================================================
-- STAFF USERS
-- ============================================================

CREATE TABLE staff_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,

  email               VARCHAR(200) NOT NULL UNIQUE,
  password_hash       VARCHAR(200) NOT NULL,   -- bcrypt
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  role                staff_role   NOT NULL,
  gmc_number          VARCHAR(20),             -- GPs only

  is_active           BOOLEAN DEFAULT TRUE,
  is_duty_gp          BOOLEAN DEFAULT FALSE,   -- current duty doctor flag
  last_login_at       TIMESTAMPTZ,

  -- Notification preferences
  notify_on_urgent    BOOLEAN DEFAULT TRUE,
  notify_on_new       BOOLEAN DEFAULT FALSE,
  notification_email  VARCHAR(200),
  notification_phone  VARCHAR(20),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_staff_practice ON staff_users(practice_id);
CREATE INDEX idx_staff_email    ON staff_users(email);


-- ============================================================
-- PATIENTS
-- ============================================================

CREATE TABLE patients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,

  -- NHS identity (populated on NHS Login verification)
  nhs_number          VARCHAR(12) UNIQUE,      -- 10-digit NHS number
  nhs_login_sub       VARCHAR(200) UNIQUE,     -- OAuth subject from NHS Login
  identity_verified   BOOLEAN DEFAULT FALSE,   -- TRUE once NHS Login verified

  -- Demographics
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  date_of_birth       DATE,
  gender              VARCHAR(20),
  email               VARCHAR(200),
  phone               VARCHAR(20),

  -- Address
  address_line1       VARCHAR(200),
  postcode            VARCHAR(10),

  -- Account
  password_hash       VARCHAR(200),            -- NULL if using NHS Login only
  is_active           BOOLEAN DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,

  -- Communication preferences
  preferred_channel   notification_channel DEFAULT 'email',
  opt_in_sms          BOOLEAN DEFAULT FALSE,
  opt_in_email        BOOLEAN DEFAULT TRUE,
  language_code       VARCHAR(10) DEFAULT 'en',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_patients_practice    ON patients(practice_id);
CREATE INDEX idx_patients_nhs_number  ON patients(nhs_number);
CREATE INDEX idx_patients_nhs_login   ON patients(nhs_login_sub);
CREATE INDEX idx_patients_email       ON patients(email);


-- ============================================================
-- CONSULTATION REQUESTS
-- The core table — every inbound patient contact
-- ============================================================

CREATE TABLE consultation_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  assigned_to         UUID REFERENCES staff_users(id) ON DELETE SET NULL,

  -- Classification
  request_type        request_type   NOT NULL,
  status              request_status NOT NULL DEFAULT 'pending',
  severity            severity_level NOT NULL DEFAULT 'routine',
  channel             consultation_channel NOT NULL DEFAULT 'online_form',

  -- Content
  presenting_complaint    TEXT,                -- patient's own words (free text)
  chief_complaint_code    VARCHAR(20),         -- SNOMED-CT code if mapped
  summary                 TEXT,                -- staff-written summary after triage
  clinical_notes          TEXT,                -- private GP notes (not visible to patient)
  outcome                 TEXT,                -- resolution description

  -- Alert flags (populated by triage engine)
  has_alert           BOOLEAN DEFAULT FALSE,
  alert_reason        TEXT,                    -- e.g. 'chest pain + shortness of breath'
  alert_acknowledged  BOOLEAN DEFAULT FALSE,
  alert_acknowledged_by UUID REFERENCES staff_users(id),
  alert_acknowledged_at TIMESTAMPTZ,

  -- Delegation (e.g. to GP Federation)
  delegated_to_org    VARCHAR(200),
  delegated_at        TIMESTAMPTZ,

  -- Patient-supplied media
  has_attachments     BOOLEAN DEFAULT FALSE,

  -- Timing
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triaged_at          TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  response_due_by     TIMESTAMPTZ,             -- SLA deadline (typically same day)

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_requests_practice   ON consultation_requests(practice_id);
CREATE INDEX idx_requests_patient    ON consultation_requests(patient_id);
CREATE INDEX idx_requests_assigned   ON consultation_requests(assigned_to);
CREATE INDEX idx_requests_status     ON consultation_requests(status);
CREATE INDEX idx_requests_severity   ON consultation_requests(severity);
CREATE INDEX idx_requests_alert      ON consultation_requests(has_alert) WHERE has_alert = TRUE;
CREATE INDEX idx_requests_submitted  ON consultation_requests(submitted_at DESC);


-- ============================================================
-- TRIAGE RESPONSES
-- Stores every question-answer pair from the symptom form
-- ============================================================

CREATE TABLE triage_responses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES consultation_requests(id) ON DELETE CASCADE,

  question_code       VARCHAR(100) NOT NULL,  -- e.g. 'CHEST_PAIN_Q1'
  question_text       TEXT         NOT NULL,  -- exact question shown to patient
  answer_code         VARCHAR(100),           -- coded answer if from a list
  answer_text         TEXT,                   -- free text or selected option label
  answer_boolean      BOOLEAN,                -- for yes/no questions
  sequence_order      INT NOT NULL DEFAULT 0, -- order questions were presented

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triage_request ON triage_responses(request_id);


-- ============================================================
-- TRIAGE CONDITION LIBRARY
-- Your 6,000-condition knowledge base
-- ============================================================

CREATE TABLE triage_conditions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_code      VARCHAR(100) NOT NULL UNIQUE,
  condition_name      VARCHAR(300) NOT NULL,
  snomed_code         VARCHAR(20),            -- SNOMED-CT clinical code
  icd10_code          VARCHAR(10),
  category            VARCHAR(100),           -- e.g. 'respiratory', 'cardiac', 'dermatology'
  default_severity    severity_level NOT NULL DEFAULT 'routine',
  is_alert_condition  BOOLEAN DEFAULT FALSE,  -- always triggers duty GP flag
  self_help_url       TEXT,
  nhs_inform_url      TEXT,                   -- NHS Inform (Scotland) link
  is_active           BOOLEAN DEFAULT TRUE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conditions_code     ON triage_conditions(condition_code);
CREATE INDEX idx_conditions_snomed   ON triage_conditions(snomed_code);
CREATE INDEX idx_conditions_category ON triage_conditions(category);


-- ============================================================
-- TRIAGE QUESTIONS
-- The 8,000-question engine
-- ============================================================

CREATE TABLE triage_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id        UUID REFERENCES triage_conditions(id) ON DELETE CASCADE,
  question_code       VARCHAR(100) NOT NULL UNIQUE,
  question_text       TEXT NOT NULL,
  question_type       VARCHAR(30) NOT NULL,  -- 'boolean' | 'single_choice' | 'multi_choice' | 'free_text' | 'scale'
  options             JSONB,                 -- [{code, label, triggers_alert}]
  is_mandatory        BOOLEAN DEFAULT FALSE,
  triggers_alert_if   JSONB,                 -- {"answer_code": "YES", "alert_reason": "..."}
  sequence_order      INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_condition ON triage_questions(condition_id);


-- ============================================================
-- SECURE MESSAGES
-- Two-way conversation on a consultation request
-- ============================================================

CREATE TABLE messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES consultation_requests(id) ON DELETE CASCADE,

  sender_type         message_sender_type NOT NULL,
  sender_patient_id   UUID REFERENCES patients(id)    ON DELETE SET NULL,
  sender_staff_id     UUID REFERENCES staff_users(id) ON DELETE SET NULL,

  body                TEXT NOT NULL,
  is_internal         BOOLEAN DEFAULT FALSE,  -- TRUE = staff-only note, never shown to patient

  read_by_patient_at  TIMESTAMPTZ,
  read_by_staff_at    TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_messages_request    ON messages(request_id);
CREATE INDEX idx_messages_created    ON messages(created_at DESC);


-- ============================================================
-- ATTACHMENTS
-- Patient-uploaded images/documents (stored in S3/Azure Blob)
-- ============================================================

CREATE TABLE attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES consultation_requests(id) ON DELETE CASCADE,
  message_id          UUID REFERENCES messages(id) ON DELETE SET NULL,
  uploaded_by_patient UUID REFERENCES patients(id)    ON DELETE SET NULL,
  uploaded_by_staff   UUID REFERENCES staff_users(id) ON DELETE SET NULL,

  original_filename   VARCHAR(500) NOT NULL,
  storage_key         VARCHAR(1000) NOT NULL,  -- S3/Blob path (never expose to client)
  mime_type           VARCHAR(100) NOT NULL,
  file_size_bytes     BIGINT,
  is_clinical_image   BOOLEAN DEFAULT FALSE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_request ON attachments(request_id);


-- ============================================================
-- APPOINTMENTS
-- ============================================================

CREATE TABLE appointments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  patient_id          UUID NOT NULL REFERENCES patients(id)  ON DELETE RESTRICT,
  staff_id            UUID REFERENCES staff_users(id)        ON DELETE SET NULL,
  request_id          UUID REFERENCES consultation_requests(id) ON DELETE SET NULL,

  appointment_type    VARCHAR(50) NOT NULL,  -- 'in_person' | 'telephone' | 'video'
  status              VARCHAR(30) NOT NULL DEFAULT 'booked',  -- 'booked' | 'checked_in' | 'completed' | 'dna' | 'cancelled'

  scheduled_at        TIMESTAMPTZ NOT NULL,
  duration_minutes    INT NOT NULL DEFAULT 10,
  actual_start_at     TIMESTAMPTZ,
  actual_end_at       TIMESTAMPTZ,

  -- Video consult fields
  video_room_url      TEXT,
  video_session_id    VARCHAR(200),

  cancellation_reason TEXT,
  cancelled_by        VARCHAR(20),  -- 'patient' | 'practice'

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_practice   ON appointments(practice_id);
CREATE INDEX idx_appointments_patient    ON appointments(patient_id);
CREATE INDEX idx_appointments_staff      ON appointments(staff_id);
CREATE INDEX idx_appointments_scheduled  ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status     ON appointments(status);


-- ============================================================
-- NOTIFICATIONS
-- Every SMS/email/push message sent by the system
-- ============================================================

CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  patient_id          UUID REFERENCES patients(id)    ON DELETE SET NULL,
  staff_id            UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  request_id          UUID REFERENCES consultation_requests(id) ON DELETE SET NULL,
  appointment_id      UUID REFERENCES appointments(id) ON DELETE SET NULL,

  channel             notification_channel NOT NULL,
  status              notification_status  NOT NULL DEFAULT 'queued',
  template_code       VARCHAR(100),          -- e.g. 'APPT_REMINDER_24H'
  subject             VARCHAR(500),          -- email subject
  body                TEXT NOT NULL,
  recipient_address   VARCHAR(500) NOT NULL, -- email or phone number

  -- Provider tracking (NHS Notify, Twilio, etc.)
  provider            VARCHAR(50),
  provider_message_id VARCHAR(200),
  provider_status     VARCHAR(100),

  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  failure_reason      TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_patient  ON notifications(patient_id);
CREATE INDEX idx_notifications_status   ON notifications(status);
CREATE INDEX idx_notifications_created  ON notifications(created_at DESC);


-- ============================================================
-- DEMAND MANAGEMENT LOG
-- Tracks daily request volumes against limits
-- ============================================================

CREATE TABLE demand_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  log_date            DATE NOT NULL,
  request_type        request_type NOT NULL,
  request_count       INT NOT NULL DEFAULT 0,
  limit_at_time       INT,                   -- what the limit was set to that day
  limit_hit_at        TIMESTAMPTZ,           -- when the limit was first reached

  UNIQUE(practice_id, log_date, request_type)
);

CREATE INDEX idx_demand_practice_date ON demand_log(practice_id, log_date);


-- ============================================================
-- SESSIONS
-- Server-side session store (complement to Redis)
-- ============================================================

CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type           VARCHAR(10) NOT NULL,   -- 'patient' | 'staff'
  patient_id          UUID REFERENCES patients(id)    ON DELETE CASCADE,
  staff_id            UUID REFERENCES staff_users(id) ON DELETE CASCADE,

  token_hash          VARCHAR(200) NOT NULL UNIQUE,  -- hashed JWT jti claim
  ip_address          INET,
  user_agent          TEXT,
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,           -- NULL = still valid

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_token    ON sessions(token_hash);
CREATE INDEX idx_sessions_expires  ON sessions(expires_at);


-- ============================================================
-- AUDIT LOG  (append-only — never UPDATE or DELETE rows here)
-- NHS DSP Toolkit requires full access audit trail
-- ============================================================

CREATE TABLE audit_log (
  id                  BIGSERIAL PRIMARY KEY,   -- sequential for ordering
  practice_id         UUID,
  action              audit_action NOT NULL,
  entity_type         VARCHAR(100) NOT NULL,   -- table name: 'consultation_requests', etc.
  entity_id           UUID,
  actor_type          VARCHAR(10),             -- 'patient' | 'staff' | 'system'
  actor_patient_id    UUID,
  actor_staff_id      UUID,

  -- What changed (for UPDATE actions)
  old_values          JSONB,
  new_values          JSONB,

  ip_address          INET,
  user_agent          TEXT,
  session_id          UUID,

  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No foreign keys on audit_log — it must survive even if related rows are deleted
);

CREATE INDEX idx_audit_entity     ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor      ON audit_log(actor_staff_id, actor_patient_id);
CREATE INDEX idx_audit_practice   ON audit_log(practice_id);
CREATE INDEX idx_audit_occurred   ON audit_log(occurred_at DESC);


-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_practices_updated
  BEFORE UPDATE ON practices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_staff_updated
  BEFORE UPDATE ON staff_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_patients_updated
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_requests_updated
  BEFORE UPDATE ON consultation_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_messages_updated
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_appointments_updated
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- ROW-LEVEL SECURITY
-- Ensures each practice can only see its own data
-- ============================================================

ALTER TABLE consultation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;

-- Example policy (repeat pattern for each table):
CREATE POLICY practice_isolation ON consultation_requests
  USING (practice_id = current_setting('app.current_practice_id')::UUID);

CREATE POLICY practice_isolation ON patients
  USING (practice_id = current_setting('app.current_practice_id')::UUID);

CREATE POLICY practice_isolation ON messages
  USING (
    request_id IN (
      SELECT id FROM consultation_requests
      WHERE practice_id = current_setting('app.current_practice_id')::UUID
    )
  );


-- ============================================================
-- SEED: example Aberdeen practice
-- ============================================================

INSERT INTO practices (
  name, ods_code, city, postcode,
  clinical_system, medical_request_limit, admin_request_limit
) VALUES (
  'Example Aberdeen Surgery', 'S00001', 'Aberdeen', 'AB10 1AB',
  'vision', 50, 100
);
