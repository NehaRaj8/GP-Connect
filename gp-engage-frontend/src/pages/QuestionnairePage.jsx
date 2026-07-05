// src/pages/QuestionnairePage.jsx
// AI-powered questionnaire builder.
// Drop a PDF or Word doc → Claude extracts clinical content → generates
// an editable questionnaire → staff can customise and save.

import { useState, useRef, useCallback } from 'react'

const QUESTION_TYPES = [
  { value: 'boolean',       label: 'Yes / No' },
  { value: 'single_choice', label: 'Multiple choice (pick one)' },
  { value: 'multi_choice',  label: 'Multiple choice (pick many)' },
  { value: 'free_text',     label: 'Free text' },
  { value: 'scale',         label: 'Scale (1–10)' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 9)
}

function blankQuestion(order) {
  return {
    id: makeId(),
    question_code: `Q${String(order).padStart(3, '0')}`,
    question_text: '',
    question_type: 'boolean',
    is_mandatory: true,
    triggers_alert: false,
    options: [],
    sequence_order: order,
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuestionnairePage() {
  const [stage, setStage] = useState('upload')   // upload | generating | editing | saved
  const [questionnaire, setQuestionnaire] = useState(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [savedList, setSavedList] = useState([])
  const [activeTab, setActiveTab] = useState('builder') // builder | saved
  const fileInputRef = useRef()

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file) => {
    if (!file) return
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ]
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|docx|doc|txt)$/i)) {
      setError('Please upload a PDF, Word document, or text file.')
      return
    }
    setError('')
    await generateFromFile(file)
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  const onFileInput = (e) => {
    handleFile(e.target.files[0])
    e.target.value = ''
  }

  // ── AI generation ──────────────────────────────────────────────────────────

  const generateFromFile = async (file) => {
    setGenerating(true)
    setStage('generating')

    try {
      // Read file as base64
      const base64 = await fileToBase64(file)
      const isText = file.type === 'text/plain'
      const isPdf  = file.type === 'application/pdf'

      // Build the message content
      const content = []

      if (isPdf) {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 }
        })
      } else if (isText) {
        // For text files decode and send as text
        const text = atob(base64)
        content.push({ type: 'text', text: `Document content:\n\n${text}` })
      } else {
        // Word doc — send as base64 text and ask Claude to interpret
        content.push({
          type: 'text',
          text: `I am uploading a Word document. Please analyse its content and generate a medical questionnaire from it. The file is named: ${file.name}`
        })
      }

      content.push({
        type: 'text',
        text: `You are a clinical questionnaire designer for a UK NHS GP practice.

Analyse the uploaded document and generate a structured patient questionnaire.

Return ONLY valid JSON — no markdown, no preamble, no explanation. The JSON must match this exact structure:

{
  "title": "Questionnaire title based on the document",
  "category": "clinical category (e.g. respiratory, cardiac, dermatology, mental_health, musculoskeletal, general)",
  "description": "One sentence description of what this questionnaire covers",
  "questions": [
    {
      "question_code": "Q001",
      "question_text": "The full question text as it will appear to the patient",
      "question_type": "boolean | single_choice | multi_choice | free_text | scale",
      "is_mandatory": true,
      "triggers_alert": false,
      "alert_reason": "Only populate if triggers_alert is true — explain why this answer is a red flag",
      "options": ["Option A", "Option B"],
      "sequence_order": 1
    }
  ]
}

Rules:
- Generate 8–15 questions appropriate to the clinical content
- Use boolean for yes/no questions
- Use single_choice or multi_choice when there are discrete options
- Use free_text for symptom descriptions or open questions
- Use scale for pain/severity ratings
- Set triggers_alert: true for any question where a concerning answer should immediately alert the duty GP (e.g. chest pain, suicidal ideation, difficulty breathing)
- Write questions in plain English the patient will understand — avoid medical jargon
- Order questions logically: start broad, then narrow to specifics
- Include at least one free_text question for the patient to describe symptoms in their own words`
      })

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          messages: [{ role: 'user', content }]
        })
      })

      const data = await response.json()

      if (data.error) throw new Error(data.error.message)

      const text = data.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')

      // Strip any accidental markdown fences
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      // Inject local IDs for editing
      const withIds = {
        ...parsed,
        id: makeId(),
        questions: parsed.questions.map((q, i) => ({
          ...q,
          id: makeId(),
          options: q.options || [],
          sequence_order: i + 1
        }))
      }

      setQuestionnaire(withIds)
      setTitle(withIds.title)
      setCategory(withIds.category)
      setStage('editing')

    } catch (err) {
      console.error('Generation error', err)
      setError('Could not generate questionnaire. Please check your file and try again.')
      setStage('upload')
    } finally {
      setGenerating(false)
    }
  }

  // ── Question editing ───────────────────────────────────────────────────────

  const updateQuestion = (id, field, value) => {
    setQuestionnaire(q => ({
      ...q,
      questions: q.questions.map(question =>
        question.id === id ? { ...question, [field]: value } : question
      )
    }))
  }

  const addQuestion = () => {
    const order = (questionnaire?.questions?.length || 0) + 1
    setQuestionnaire(q => ({
      ...q,
      questions: [...(q?.questions || []), blankQuestion(order)]
    }))
  }

  const deleteQuestion = (id) => {
    setQuestionnaire(q => ({
      ...q,
      questions: q.questions
        .filter(question => question.id !== id)
        .map((question, i) => ({ ...question, sequence_order: i + 1 }))
    }))
  }

  const moveQuestion = (id, direction) => {
    setQuestionnaire(q => {
      const questions = [...q.questions]
      const idx = questions.findIndex(question => question.id === id)
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= questions.length) return q
      ;[questions[idx], questions[newIdx]] = [questions[newIdx], questions[idx]]
      return { ...q, questions: questions.map((question, i) => ({ ...question, sequence_order: i + 1 })) }
    })
  }

  const addOption = (questionId) => {
    setQuestionnaire(q => ({
      ...q,
      questions: q.questions.map(question =>
        question.id === questionId
          ? { ...question, options: [...question.options, 'New option'] }
          : question
      )
    }))
  }

  const updateOption = (questionId, optIdx, value) => {
    setQuestionnaire(q => ({
      ...q,
      questions: q.questions.map(question =>
        question.id === questionId
          ? { ...question, options: question.options.map((opt, i) => i === optIdx ? value : opt) }
          : question
      )
    }))
  }

  const removeOption = (questionId, optIdx) => {
    setQuestionnaire(q => ({
      ...q,
      questions: q.questions.map(question =>
        question.id === questionId
          ? { ...question, options: question.options.filter((_, i) => i !== optIdx) }
          : question
      )
    }))
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveQuestionnaire = () => {
    const final = { ...questionnaire, title, category, savedAt: new Date().toISOString() }
    setSavedList(list => [final, ...list.filter(q => q.id !== final.id)])
    setStage('saved')
    setTimeout(() => {
      setActiveTab('saved')
    }, 800)
  }

  const startNew = () => {
    setQuestionnaire(null)
    setTitle('')
    setCategory('')
    setError('')
    setStage('upload')
    setActiveTab('builder')
  }

  const loadSaved = (q) => {
    setQuestionnaire(q)
    setTitle(q.title)
    setCategory(q.category)
    setStage('editing')
    setActiveTab('builder')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Questionnaire Builder</h1>
          <p style={styles.pageSub}>
            Upload a clinical document and AI generates an editable patient questionnaire instantly
          </p>
        </div>
        {stage === 'editing' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={startNew}>+ New</button>
            <button className="btn btn-primary" onClick={saveQuestionnaire}>Save questionnaire</button>
          </div>
        )}
        {stage === 'saved' && (
          <button className="btn btn-primary" onClick={startNew}>+ New questionnaire</button>
        )}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {['builder', 'saved'].map(tab => (
          <button
            key={tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'builder' ? '🔧 Builder' : `📋 Saved (${savedList.length})`}
          </button>
        ))}
      </div>

      {/* Builder tab */}
      {activeTab === 'builder' && (
        <>
          {/* Upload stage */}
          {(stage === 'upload' || stage === 'generating') && (
            <UploadZone
              dragOver={dragOver}
              generating={generating}
              error={error}
              fileInputRef={fileInputRef}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onFileInput={onFileInput}
              onStartBlank={() => {
                setQuestionnaire({ id: makeId(), title: 'New Questionnaire', category: 'general', description: '', questions: [blankQuestion(1)] })
                setTitle('New Questionnaire')
                setCategory('general')
                setStage('editing')
              }}
            />
          )}

          {/* Editing stage */}
          {(stage === 'editing' || stage === 'saved') && questionnaire && (
            <div>
              {/* Questionnaire meta */}
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16 }}>
                  <div>
                    <label>Questionnaire title</label>
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Respiratory Symptom Assessment"
                      style={{ fontSize: 16, fontWeight: 500 }}
                    />
                  </div>
                  <div>
                    <label>Category</label>
                    <select value={category} onChange={e => setCategory(e.target.value)}>
                      {['general','respiratory','cardiac','dermatology','mental_health',
                        'musculoskeletal','neurology','gastroenterology','paediatrics','gynaecology'].map(c => (
                        <option key={c} value={c}>{c.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {questionnaire.description && (
                  <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                    {questionnaire.description}
                  </p>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {questionnaire.questions?.length} question{questionnaire.questions?.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
                  <span style={{ fontSize: 12, color: 'var(--nhs-red)' }}>
                    ⚠ {questionnaire.questions?.filter(q => q.triggers_alert).length} alert trigger{questionnaire.questions?.filter(q => q.triggers_alert).length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Questions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {questionnaire.questions?.map((question, idx) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={idx}
                    total={questionnaire.questions.length}
                    onUpdate={(field, value) => updateQuestion(question.id, field, value)}
                    onDelete={() => deleteQuestion(question.id)}
                    onMoveUp={() => moveQuestion(question.id, -1)}
                    onMoveDown={() => moveQuestion(question.id, 1)}
                    onAddOption={() => addOption(question.id)}
                    onUpdateOption={(optIdx, value) => updateOption(question.id, optIdx, value)}
                    onRemoveOption={(optIdx) => removeOption(question.id, optIdx)}
                  />
                ))}
              </div>

              {/* Add question */}
              <button
                className="btn btn-secondary"
                style={{ marginTop: 16, width: '100%', justifyContent: 'center', padding: 12 }}
                onClick={addQuestion}
              >
                + Add question
              </button>

              {/* Save bar */}
              {stage === 'editing' && (
                <div style={styles.saveBar}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {questionnaire.questions?.length} questions · Ready to save
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={startNew}>Discard</button>
                    <button className="btn btn-primary" onClick={saveQuestionnaire}>
                      ✓ Save questionnaire
                    </button>
                  </div>
                </div>
              )}

              {stage === 'saved' && (
                <div className="alert-strip alert-strip-success" style={{ marginTop: 16 }}>
                  ✓ Questionnaire saved successfully
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Saved tab */}
      {activeTab === 'saved' && (
        <div>
          {savedList.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>No saved questionnaires yet</div>
              <div style={{ fontSize: 13 }}>Build one in the Builder tab</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {savedList.map(q => (
                <div key={q.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {q.category} · {q.questions?.length} questions ·
                      {q.questions?.filter(qu => qu.triggers_alert).length} alert triggers
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => loadSaved(q)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 13 }}
                      onClick={() => {
                        const json = JSON.stringify(q, null, 2)
                        const blob = new Blob([json], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `${q.title.replace(/\s+/g, '_')}.json`
                        a.click()
                      }}
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ dragOver, generating, error, fileInputRef, onDrop, onDragOver, onDragLeave, onFileInput, onStartBlank }) {
  return (
    <div>
      <div
        style={{
          ...styles.dropZone,
          ...(dragOver ? styles.dropZoneActive : {}),
          ...(generating ? styles.dropZoneGenerating : {})
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {generating ? (
          <div style={{ textAlign: 'center' }}>
            <div style={styles.spinner}>⟳</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--nhs-blue)', marginBottom: 8 }}>
              Analysing document...
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Claude is reading your document and generating questions
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['Reading clinical content', 'Identifying key topics', 'Structuring questions', 'Setting alert triggers'].map((step, i) => (
                <span key={i} style={{
                  padding: '4px 12px',
                  background: 'var(--nhs-blue-light)',
                  color: 'var(--nhs-blue)',
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 500
                }}>
                  {step}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📄</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              Drop your clinical document here
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
              PDF or Word document — Claude will extract the content and generate a patient questionnaire automatically
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                style={{ padding: '10px 24px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                Browse files
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '10px 24px' }}
                onClick={onStartBlank}
              >
                Start blank
              </button>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 16, justifyContent: 'center' }}>
              {['PDF', 'DOCX', 'DOC', 'TXT'].map(fmt => (
                <span key={fmt} style={styles.formatBadge}>{fmt}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        style={{ display: 'none' }}
        onChange={onFileInput}
      />

      {error && (
        <div className="alert-strip alert-strip-error" style={{ marginTop: 12 }}>
          ⚠ {error}
        </div>
      )}

      {/* How it works */}
      {!generating && (
        <div style={styles.howItWorks}>
          {[
            { icon: '📄', step: '1', title: 'Upload document', desc: 'Drop any clinical protocol, referral form, or assessment document' },
            { icon: '🤖', step: '2', title: 'AI analysis', desc: 'Claude reads the content and identifies key clinical questions' },
            { icon: '✏️', step: '3', title: 'Edit & customise', desc: 'Review, reorder, and adjust every question to your needs' },
            { icon: '✓',  step: '4', title: 'Save & deploy', desc: 'Save to your practice and use in patient consultations' },
          ].map(({ icon, step, title, desc }) => (
            <div key={step} className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nhs-blue)', letterSpacing: 1, marginBottom: 4 }}>STEP {step}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Question card ─────────────────────────────────────────────────────────────

function QuestionCard({ question, index, total, onUpdate, onDelete, onMoveUp, onMoveDown, onAddOption, onUpdateOption, onRemoveOption }) {
  const [expanded, setExpanded] = useState(true)
  const needsOptions = ['single_choice', 'multi_choice'].includes(question.question_type)

  return (
    <div className="card" style={{
      borderLeft: question.triggers_alert ? '4px solid var(--nhs-red)' : '4px solid var(--grey-200)',
      overflow: 'hidden'
    }}>
      {/* Question header */}
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: expanded ? 'white' : 'var(--grey-50)' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={styles.qNumber}>{String(index + 1).padStart(2, '0')}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {question.question_text || <span style={{ color: 'var(--text-muted)' }}>Untitled question</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
            <span style={styles.typePill}>
              {QUESTION_TYPES.find(t => t.value === question.question_type)?.label}
            </span>
            {question.is_mandatory && <span style={styles.typePill}>Required</span>}
            {question.triggers_alert && (
              <span style={{ ...styles.typePill, background: 'var(--nhs-red-light)', color: 'var(--nhs-red)' }}>
                ⚠ Alert trigger
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost" style={styles.iconBtn} onClick={onMoveUp} disabled={index === 0} title="Move up">↑</button>
          <button className="btn btn-ghost" style={styles.iconBtn} onClick={onMoveDown} disabled={index === total - 1} title="Move down">↓</button>
          <button className="btn btn-ghost" style={{ ...styles.iconBtn, color: 'var(--nhs-red)' }} onClick={onDelete} title="Delete">✕</button>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--grey-50)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, marginBottom: 12 }}>
            <div>
              <label>Question text</label>
              <textarea
                value={question.question_text}
                onChange={e => onUpdate('question_text', e.target.value)}
                rows={2}
                placeholder="What would you like to ask the patient?"
              />
            </div>
            <div>
              <label>Question type</label>
              <select value={question.question_type} onChange={e => onUpdate('question_type', e.target.value)}>
                {QUESTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Options editor */}
          {needsOptions && (
            <div style={{ marginBottom: 12 }}>
              <label>Answer options</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {question.options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={opt}
                      onChange={e => onUpdateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ flexShrink: 0, color: 'var(--nhs-red)', padding: '6px 10px' }}
                      onClick={() => onRemoveOption(i)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 13 }} onClick={onAddOption}>
                  + Add option
                </button>
              </div>
            </div>
          )}

          {/* Flags */}
          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={question.is_mandatory}
                onChange={e => onUpdate('is_mandatory', e.target.checked)}
                style={{ width: 'auto' }}
              />
              Required question
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={question.triggers_alert}
                onChange={e => onUpdate('triggers_alert', e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span style={{ color: question.triggers_alert ? 'var(--nhs-red)' : 'inherit' }}>
                ⚠ Alert trigger (notifies duty GP)
              </span>
            </label>
          </div>

          {question.triggers_alert && (
            <div style={{ marginTop: 10 }}>
              <label>Alert reason (shown to duty GP)</label>
              <input
                value={question.alert_reason || ''}
                onChange={e => onUpdate('alert_reason', e.target.value)}
                placeholder="e.g. Patient reports chest pain — requires urgent review"
              />
            </div>
          )}

          {/* Code */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Question code</label>
            <input
              value={question.question_code}
              onChange={e => onUpdate('question_code', e.target.value)}
              style={{ width: 120, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  pageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  pageTitle: { fontSize: 22, fontWeight: 600 },
  pageSub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  tabs: {
    display: 'flex',
    gap: 4,
    borderBottom: '2px solid var(--border)',
    marginBottom: 20
  },
  tab: {
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    transition: 'all 0.15s'
  },
  tabActive: {
    color: 'var(--nhs-blue)',
    borderBottomColor: 'var(--nhs-blue)'
  },
  dropZone: {
    border: '2px dashed var(--grey-300)',
    borderRadius: 'var(--radius-lg)',
    padding: '56px 32px',
    textAlign: 'center',
    background: 'white',
    transition: 'all 0.2s',
    cursor: 'pointer',
    marginBottom: 20
  },
  dropZoneActive: {
    borderColor: 'var(--nhs-blue)',
    background: 'var(--nhs-blue-light)',
    transform: 'scale(1.01)'
  },
  dropZoneGenerating: {
    borderColor: 'var(--nhs-blue)',
    background: 'var(--nhs-blue-light)',
    cursor: 'default'
  },
  spinner: {
    fontSize: 40,
    marginBottom: 16,
    display: 'inline-block',
    animation: 'spin 1.5s linear infinite',
    color: 'var(--nhs-blue)'
  },
  howItWorks: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginTop: 8
  },
  formatBadge: {
    padding: '3px 10px',
    background: 'var(--grey-100)',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--grey-700)',
    fontFamily: 'var(--font-mono)'
  },
  qNumber: {
    width: 28,
    height: 28,
    background: 'var(--nhs-blue)',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0
  },
  typePill: {
    padding: '1px 7px',
    background: 'var(--grey-100)',
    borderRadius: 100,
    fontSize: 11,
    color: 'var(--grey-700)'
  },
  iconBtn: {
    padding: '4px 8px',
    fontSize: 14,
    minWidth: 28
  },
  saveBar: {
    position: 'sticky',
    bottom: 0,
    background: 'white',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    boxShadow: 'var(--shadow-lg)'
  }
}
