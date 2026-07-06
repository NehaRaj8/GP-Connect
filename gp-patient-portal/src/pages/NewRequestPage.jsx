// src/pages/NewRequestPage.jsx
// Multi-step consultation request form with built-in triage
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestsApi } from '../services/api.js'

const REQUEST_TYPES = [
  { value: 'medical',              icon: '🩺', label: 'Medical advice',       desc: 'Symptoms, conditions, ongoing health concerns' },
  { value: 'prescription_repeat',  icon: '💊', label: 'Repeat prescription',  desc: 'Request a repeat of your current medication' },
  { value: 'test_result',          icon: '📋', label: 'Test result',          desc: 'Ask about blood tests, scans or other results' },
  { value: 'admin',                icon: '📄', label: 'Sick / fit note',      desc: 'Request a statement of fitness for work' },
  { value: 'callback_request',     icon: '📞', label: 'GP callback',          desc: 'Request a phone call from a clinician' },
  { value: 'video_consult',        icon: '🎥', label: 'Video consultation',   desc: 'Speak face-to-face with your GP online' },
  { value: 'referral',             icon: '🏥', label: 'Referral query',       desc: 'Ask about a referral to a specialist' },
]

// Triage questions shown for medical requests
const TRIAGE_QUESTIONS = [
  {
    code: 'DURATION',
    text: 'How long have you had this problem?',
    type: 'single_choice',
    options: ['Today', '2–3 days', '1–2 weeks', '2–4 weeks', 'More than a month']
  },
  {
    code: 'SEVERITY',
    text: 'How would you rate how it is affecting your daily life?',
    type: 'scale',
    options: ['Not at all', 'Slightly', 'Moderately', 'Quite a lot', 'Severely']
  },
  {
    code: 'CHEST_PAIN',
    text: 'Do you have any chest pain or pressure?',
    type: 'boolean',
    triggers_alert: true,
    alert_reason: 'Patient reports chest pain'
  },
  {
    code: 'BREATHING',
    text: 'Are you having any difficulty breathing?',
    type: 'boolean',
    triggers_alert: true,
    alert_reason: 'Patient reports difficulty breathing'
  },
  {
    code: 'WORSENING',
    text: 'Is the problem getting worse?',
    type: 'boolean'
  },
  {
    code: 'MEDICATION',
    text: 'Are you currently taking any medication for this?',
    type: 'boolean'
  },
  {
    code: 'TRIED',
    text: 'What have you tried so far to manage this?',
    type: 'free_text'
  }
]

export default function NewRequestPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1=type, 2=describe, 3=triage, 4=review, 5=submitted
  const [requestType, setRequestType] = useState('')
  const [complaint, setComplaint] = useState('')
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submittedRequest, setSubmittedRequest] = useState(null)

  const isMedical = requestType === 'medical'
  const totalSteps = isMedical ? 4 : 3

  const handleAnswer = (code, value) => {
    setAnswers(a => ({ ...a, [code]: value }))
  }

  const buildTriageResponses = () => {
    return TRIAGE_QUESTIONS.map((q, i) => ({
      question_code: q.code,
      question_text: q.text,
      answer_text: typeof answers[q.code] === 'boolean' ? undefined : answers[q.code],
      answer_boolean: typeof answers[q.code] === 'boolean' ? answers[q.code] : undefined,
      sequence_order: i + 1
    })).filter(r => r.answer_text || r.answer_boolean !== undefined)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await requestsApi.submit({
        request_type: requestType,
        presenting_complaint: complaint,
        triage_responses: isMedical ? buildTriageResponses() : []
      })
      setSubmittedRequest(res.data)
      setStep(5)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return !!requestType
    if (step === 2) return complaint.trim().length >= 10
    return true
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* Progress bar */}
      {step < 5 && (
        <div style={styles.progress}>
          <div style={{ ...styles.progressBar, width: `${(step / totalSteps) * 100}%` }} />
        </div>
      )}

      {/* Emergency warning */}
      <div className="alert alert-error" style={{ marginBottom: 24 }}>
        🚨 This is NOT for emergencies. If you need urgent help call <strong>999</strong> or <strong>111</strong>.
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}

      {/* ── Step 1: Request type ── */}
      {step === 1 && (
        <div>
          <h1 style={styles.stepTitle}>What do you need help with?</h1>
          <p style={styles.stepSub}>Choose the option that best describes your request</p>

          <div style={styles.typeGrid}>
            {REQUEST_TYPES.map(type => (
              <button
                key={type.value}
                style={{
                  ...styles.typeCard,
                  ...(requestType === type.value ? styles.typeCardSelected : {})
                }}
                onClick={() => setRequestType(type.value)}
              >
                <div style={styles.typeIcon}>{type.icon}</div>
                <div style={styles.typeLabel}>{type.label}</div>
                <div style={styles.typeDesc}>{type.desc}</div>
                {requestType === type.value && (
                  <div style={styles.typeCheck}>✓</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Describe symptoms ── */}
      {step === 2 && (
        <div>
          <h1 style={styles.stepTitle}>
            {isMedical ? 'Describe your symptoms' : 'Tell us more'}
          </h1>
          <p style={styles.stepSub}>
            {isMedical
              ? 'Please describe what you are experiencing. The more detail you give, the better we can help.'
              : 'Please give us a brief description of what you need.'}
          </p>

          <div className="card" style={{ padding: 24 }}>
            <label>
              {isMedical ? 'What are your symptoms?' : 'Description'}
            </label>
            <textarea
              value={complaint}
              onChange={e => setComplaint(e.target.value)}
              rows={6}
              placeholder={isMedical
                ? 'e.g. I have had a persistent cough for 2 weeks. It is worse at night and I am also feeling short of breath when walking...'
                : 'Please describe what you need...'
              }
              autoFocus
              style={{ resize: 'vertical' }}
            />
            <div style={{ fontSize: 12, color: complaint.length < 10 ? 'var(--nhs-red)' : 'var(--text-muted)', marginTop: 6 }}>
              {complaint.length < 10 ? `Please add at least ${10 - complaint.length} more characters` : `${complaint.length} characters ✓`}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Triage questions (medical only) ── */}
      {step === 3 && isMedical && (
        <div>
          <h1 style={styles.stepTitle}>A few more questions</h1>
          <p style={styles.stepSub}>These help the GP prioritise your request correctly</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {TRIAGE_QUESTIONS.map(q => (
              <div key={q.code} className="card" style={{ padding: 20 }}>
                <p style={styles.questionText}>{q.text}</p>

                {q.type === 'boolean' && (
                  <div style={styles.boolRow}>
                    {[true, false].map(val => (
                      <button
                        key={String(val)}
                        style={{
                          ...styles.boolBtn,
                          ...(answers[q.code] === val ? styles.boolBtnSelected : {})
                        }}
                        onClick={() => handleAnswer(q.code, val)}
                      >
                        {val ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                )}

                {(q.type === 'single_choice' || q.type === 'scale') && (
                  <div style={styles.optionList}>
                    {q.options.map(opt => (
                      <button
                        key={opt}
                        style={{
                          ...styles.optionBtn,
                          ...(answers[q.code] === opt ? styles.optionBtnSelected : {})
                        }}
                        onClick={() => handleAnswer(q.code, opt)}
                      >
                        {answers[q.code] === opt && '✓ '}{opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'free_text' && (
                  <textarea
                    value={answers[q.code] || ''}
                    onChange={e => handleAnswer(q.code, e.target.value)}
                    rows={3}
                    placeholder="Type your answer here..."
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3 (non-medical) or Step 4 (medical): Review ── */}
      {((step === 3 && !isMedical) || (step === 4 && isMedical)) && (
        <div>
          <h1 style={styles.stepTitle}>Review your request</h1>
          <p style={styles.stepSub}>Please check everything looks correct before submitting</p>

          <div className="card" style={{ padding: 24, marginBottom: 16 }}>
            <div style={styles.reviewRow}>
              <span style={styles.reviewLabel}>Request type</span>
              <span style={styles.reviewValue}>
                {REQUEST_TYPES.find(t => t.value === requestType)?.icon} {REQUEST_TYPES.find(t => t.value === requestType)?.label}
              </span>
            </div>
            <div style={styles.reviewDivider} />
            <div style={styles.reviewRow}>
              <span style={styles.reviewLabel}>Your description</span>
              <span style={{ ...styles.reviewValue, fontWeight: 400, lineHeight: 1.6 }}>{complaint}</span>
            </div>
            {isMedical && Object.keys(answers).length > 0 && (
              <>
                <div style={styles.reviewDivider} />
                <div style={styles.reviewLabel}>Triage answers</div>
                <div style={{ marginTop: 8 }}>
                  {TRIAGE_QUESTIONS.filter(q => answers[q.code] !== undefined).map(q => (
                    <div key={q.code} style={styles.triageReviewRow}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{q.text}</span>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>
                        {typeof answers[q.code] === 'boolean'
                          ? (answers[q.code] ? 'Yes' : 'No')
                          : answers[q.code]}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            ℹ After submitting, a clinician will review your request and respond the same working day.
            You will receive an email when there is a reply.
          </div>
        </div>
      )}

      {/* ── Step 5: Submitted ── */}
      {step === 5 && submittedRequest && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={styles.successIcon}>✓</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>
            Request submitted
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6 }}>
            Your request has been received by Aberdeen Dyce Surgery.
            A clinician will review it and respond the same working day.
          </p>

          {submittedRequest.request?.has_alert && (
            <div className="alert alert-warning" style={{ marginBottom: 20, textAlign: 'left' }}>
              ⚠ Your request has been flagged as urgent. The duty GP has been notified immediately.
            </div>
          )}

          <div className="card" style={{ padding: 20, marginBottom: 24, textAlign: 'left' }}>
            <div style={styles.reviewRow}>
              <span style={styles.reviewLabel}>Response due by</span>
              <span style={styles.reviewValue}>
                {submittedRequest.request?.response_due_by
                  ? new Date(submittedRequest.request.response_due_by).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  : 'End of working day'}
              </span>
            </div>
            <div style={styles.reviewDivider} />
            <div style={styles.reviewRow}>
              <span style={styles.reviewLabel}>Status</span>
              <span className="badge badge-pending">Pending review</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
              View my requests
            </button>
            <button className="btn btn-secondary" onClick={() => {
              setStep(1); setRequestType(''); setComplaint(''); setAnswers({}); setSubmittedRequest(null)
            }}>
              Submit another
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      {step < 5 && (
        <div style={styles.navBar}>
          {step > 1 ? (
            <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>
              ← Back
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
              ← Cancel
            </button>
          )}

          {((step === 3 && !isMedical) || (step === 4 && isMedical)) ? (
            <button
              className="btn btn-success btn-lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : '✓ Submit request'}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
            >
              Continue →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  progress: { height: 4, background: 'var(--grey-200)', borderRadius: 2, marginBottom: 24, overflow: 'hidden' },
  progressBar: { height: '100%', background: 'var(--nhs-blue)', borderRadius: 2, transition: 'width 0.3s ease' },
  stepTitle: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  stepSub: { fontSize: 15, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 },
  typeGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 },
  typeCard: {
    background: 'white', border: '2px solid var(--border)',
    borderRadius: 'var(--radius)', padding: 20, cursor: 'pointer',
    textAlign: 'left', position: 'relative', transition: 'all 0.15s',
    fontFamily: 'var(--font)'
  },
  typeCardSelected: { borderColor: 'var(--nhs-blue)', background: 'var(--nhs-blue-light)', boxShadow: '0 0 0 3px rgba(0,94,184,0.15)' },
  typeIcon: { fontSize: 28, marginBottom: 10 },
  typeLabel: { fontWeight: 700, fontSize: 15, marginBottom: 4 },
  typeDesc: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 },
  typeCheck: { position: 'absolute', top: 12, right: 12, background: 'var(--nhs-blue)', color: 'white', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 },
  questionText: { fontWeight: 600, fontSize: 15, marginBottom: 14, lineHeight: 1.5 },
  boolRow: { display: 'flex', gap: 10 },
  boolBtn: { flex: 1, padding: '12px', border: '2px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' },
  boolBtnSelected: { borderColor: 'var(--nhs-blue)', background: 'var(--nhs-blue)', color: 'white' },
  optionList: { display: 'flex', flexDirection: 'column', gap: 8 },
  optionBtn: { padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all 0.15s' },
  optionBtnSelected: { borderColor: 'var(--nhs-blue)', background: 'var(--nhs-blue-light)', color: 'var(--nhs-blue)', fontWeight: 600 },
  reviewRow: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', padding: '6px 0' },
  reviewLabel: { fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 },
  reviewValue: { fontSize: 14, fontWeight: 600, textAlign: 'right' },
  reviewDivider: { borderTop: '1px solid var(--border)', margin: '8px 0' },
  triageReviewRow: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--grey-100)' },
  navBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' },
  successIcon: { width: 72, height: 72, background: 'var(--nhs-green)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, margin: '0 auto 24px' }
}
