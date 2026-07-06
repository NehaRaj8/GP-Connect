// src/pages/HomePage.jsx
import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'white' }}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <div style={styles.nhsLogo}>NHS</div>
            <div>
              <div style={styles.practiceName}>Aberdeen Dyce Surgery</div>
              <div style={styles.practiceTag}>Online Consultation</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/login" className="btn btn-secondary" style={{ padding: '8px 20px', fontSize: 14 }}>
              Sign in
            </Link>
            <Link to="/register" className="btn btn-primary" style={{ padding: '8px 20px', fontSize: 14 }}>
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* Emergency banner */}
      <div style={styles.emergencyBanner}>
        🚨 If you have a medical emergency, call <strong>999</strong>. For urgent advice, call <strong>NHS 24 on 111</strong>.
      </div>

      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.heroInner}>
          <div style={styles.heroTag}>Aberdeen Dyce Surgery</div>
          <h1 style={styles.heroTitle}>
            Contact your GP<br />without the wait
          </h1>
          <p style={styles.heroSub}>
            Submit a consultation request online, message your practice securely,
            and get a response the same working day — without calling or queuing.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/register" className="btn btn-primary btn-lg">
              Get started
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              Sign in to my account
            </Link>
          </div>
          <div style={styles.heroNote}>
            ✓ Secure &nbsp;·&nbsp; ✓ NHS-approved &nbsp;·&nbsp; ✓ Same-day response
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={styles.section}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>How it works</h2>
          <div style={styles.stepsGrid}>
            {[
              { icon: '📝', step: '1', title: 'Describe your symptoms', desc: 'Answer a few simple questions about how you are feeling. Takes about 3 minutes.' },
              { icon: '🏥', step: '2', title: 'Practice reviews your request', desc: 'A GP or clinician reviews your request and decides the best course of action.' },
              { icon: '💬', step: '3', title: 'Receive a response', desc: 'You get a reply the same working day — advice, prescription, or appointment if needed.' },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} style={styles.stepCard}>
                <div style={styles.stepIcon}>{icon}</div>
                <div style={styles.stepNum}>Step {step}</div>
                <h3 style={styles.stepTitle}>{title}</h3>
                <p style={styles.stepDesc}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What you can request */}
      <div style={{ ...styles.section, background: 'var(--bg)' }}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>What you can request</h2>
          <div style={styles.requestGrid}>
            {[
              { icon: '🩺', label: 'Medical advice', desc: 'Symptoms, conditions, ongoing health concerns' },
              { icon: '💊', label: 'Repeat prescription', desc: 'Request a repeat of your existing medication' },
              { icon: '📋', label: 'Test results', desc: 'Ask about blood tests, scans, or other results' },
              { icon: '📄', label: 'Sick note / fit note', desc: 'Request a statement of fitness for work' },
              { icon: '📞', label: 'GP callback', desc: 'Request a phone call from a clinician' },
              { icon: '🎥', label: 'Video consultation', desc: 'Speak face-to-face with your GP online' },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="card" style={styles.requestCard}>
                <div style={styles.requestIcon}>{icon}</div>
                <div style={styles.requestLabel}>{label}</div>
                <div style={styles.requestDesc}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={styles.cta}>
        <div style={styles.ctaInner}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Ready to get started?</h2>
          <p style={{ fontSize: 16, opacity: 0.9, marginBottom: 28 }}>
            Register with your NHS number to access the online consultation service.
          </p>
          <Link to="/register" className="btn btn-lg" style={{ background: 'white', color: 'var(--nhs-blue)', fontWeight: 700 }}>
            Register now — it's free
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <span>© 2026 Aberdeen Dyce Surgery · Online Consultation Service</span>
          <span>For emergencies call 999 · For urgent advice call 111</span>
        </div>
      </footer>
    </div>
  )
}

const styles = {
  header: { background: 'white', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 },
  headerInner: { maxWidth: 960, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  nhsLogo: { background: 'var(--nhs-blue)', color: 'white', fontWeight: 700, fontSize: 16, padding: '4px 8px', letterSpacing: 1, borderRadius: 2 },
  practiceName: { fontSize: 14, fontWeight: 600 },
  practiceTag: { fontSize: 11, color: 'var(--text-muted)' },
  emergencyBanner: { background: '#FFF3CD', borderBottom: '1px solid #FFD966', padding: '8px 24px', fontSize: 13, textAlign: 'center', color: '#664D03' },
  hero: { background: 'linear-gradient(135deg, var(--nhs-blue) 0%, var(--nhs-blue-dark) 100%)', color: 'white', padding: '72px 24px' },
  heroInner: { maxWidth: 640, margin: '0 auto' },
  heroTag: { fontSize: 13, fontWeight: 600, opacity: 0.8, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  heroTitle: { fontSize: 48, fontWeight: 700, lineHeight: 1.15, marginBottom: 20 },
  heroSub: { fontSize: 18, opacity: 0.9, lineHeight: 1.6, marginBottom: 32 },
  heroNote: { marginTop: 20, fontSize: 13, opacity: 0.7 },
  section: { padding: '64px 24px', background: 'white' },
  sectionInner: { maxWidth: 900, margin: '0 auto' },
  sectionTitle: { fontSize: 28, fontWeight: 700, marginBottom: 36, textAlign: 'center' },
  stepsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 },
  stepCard: { textAlign: 'center', padding: 24 },
  stepIcon: { fontSize: 40, marginBottom: 12 },
  stepNum: { fontSize: 12, fontWeight: 700, color: 'var(--nhs-blue)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  stepTitle: { fontSize: 17, fontWeight: 600, marginBottom: 10 },
  stepDesc: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 },
  requestGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  requestCard: { padding: 20 },
  requestIcon: { fontSize: 28, marginBottom: 10 },
  requestLabel: { fontWeight: 600, fontSize: 15, marginBottom: 4 },
  requestDesc: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 },
  cta: { background: 'var(--nhs-blue)', color: 'white', padding: '64px 24px', textAlign: 'center' },
  ctaInner: { maxWidth: 560, margin: '0 auto' },
  footer: { background: 'var(--grey-900)', color: 'var(--grey-500)', padding: '20px 24px' },
  footerInner: { maxWidth: 960, margin: '0 auto', display: 'flex', justifyContent: 'space-between', fontSize: 13 }
}
