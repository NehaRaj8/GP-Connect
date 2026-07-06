// ADD THIS ROUTE to src/routes/auth.js in gp-engage-api
// Place it after the patient login route

// ─── Patient registration ─────────────────────────────────────────────────────
router.post('/patient/register', async (req, res) => {
  const {
    first_name, last_name, date_of_birth,
    nhs_number, email, phone, password, practice_id
  } = req.body

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'First name, last name, email and password are required' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  // Check email not already registered
  const existing = await query(
    `SELECT id FROM patients WHERE email = $1`,
    [email.toLowerCase()]
  )
  if (existing.length) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  // Use DEFAULT_PRACTICE_ID from env if not provided
  const practiceId = practice_id || process.env.DEFAULT_PRACTICE_ID

  const rows = await query(
    `INSERT INTO patients (
       practice_id, first_name, last_name, date_of_birth,
       nhs_number, email, phone, password_hash, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
     RETURNING id, first_name, last_name, email, nhs_number, practice_id`,
    [
      practiceId,
      first_name,
      last_name,
      date_of_birth || null,
      nhs_number || null,
      email.toLowerCase(),
      phone || null,
      passwordHash
    ]
  )

  const patient = rows[0]
  const { token, jti } = generatePatientToken(patient)

  // Store session
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await query(
    `INSERT INTO sessions (user_type, patient_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ('patient', $1, $2, $3, $4, $5)`,
    [patient.id, jti, req.ip, req.headers['user-agent'], expiresAt]
  )

  res.status(201).json({
    token,
    patient: {
      id: patient.id,
      name: `${patient.first_name} ${patient.last_name}`,
      email: patient.email,
      nhsNumber: patient.nhs_number
    }
  })
})
