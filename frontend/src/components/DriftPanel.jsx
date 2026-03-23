// DriftPanel — ASI Framework display
// Based on: Rath (2026) "Agent Drift: Quantifying Behavioral Degradation
//           in Multi-Agent LLM Systems Over Extended Interactions"

export default function DriftPanel({ result }) {
  if (!result) return (
    <aside className="drift-panel">
      <div className="drift-title">📊 Drift Validator</div>
      <div className="drift-empty">
        <p>Drift report appears here after analysis.</p>
        <p className="drift-hint">
          Uses the Agent Stability Index (ASI) framework — 12 dimensions across 4 categories
          (Rath 2026). Validates agent predictions against the NASA/ISO RAG knowledge base.
        </p>
      </div>
    </aside>
  )

  const scoreColor = result.driftScore === 0 ? '#3fb950'
    : result.driftScore <= 25 ? '#d29922'
    : result.driftScore <= 50 ? '#f0883e'
    : '#f85149'

  const verdictIcon = result.driftScore === 0 ? '✅'
    : result.driftScore <= 25 ? '🟡'
    : result.driftScore <= 50 ? '🟠'
    : '🔴'

  // ASI is 0–1; paper threshold τ = 0.75
  const asiColor = result.ASI >= 0.75 ? '#3fb950' : result.ASI >= 0.5 ? '#f0883e' : '#f85149'

  // ── Dimension helpers ──────────────────────────────────────────────────────
  const pct = v => `${Math.round(v * 100)}%`

  function DimBar({ label, value, tooltip }) {
    const col = value >= 0.75 ? '#3fb950' : value >= 0.5 ? '#d29922' : '#f85149'
    return (
      <div className="dim-row" title={tooltip}>
        <span className="dim-label">{label}</span>
        <div className="dim-bar-bg">
          <div className="dim-bar-fill" style={{ width: pct(value), background: col }} />
        </div>
        <span className="dim-val" style={{ color: col }}>{pct(value)}</span>
      </div>
    )
  }

  function CategoryBlock({ title, badge, cat, dims }) {
    const catColor = cat.score >= 0.75 ? '#3fb950' : cat.score >= 0.5 ? '#f0883e' : '#f85149'
    return (
      <div className="asi-category">
        <div className="asi-cat-header">
          <span className="asi-cat-title">{title}</span>
          <span className="asi-cat-weight">w={cat.weight}</span>
          <span className="asi-cat-score" style={{ color: catColor }}>{pct(cat.score)}</span>
        </div>
        {dims.map(d => (
          <DimBar key={d.key} label={d.key} value={cat[d.key]} tooltip={d.tooltip} />
        ))}
      </div>
    )
  }

  const { categories: C, driftTypes: DT } = result

  return (
    <aside className="drift-panel">
      <div className="drift-title">📊 Drift Validator</div>
      <div className="drift-engine">{result.engineId}</div>

      {/* ── Drift Score ──────────────────────────────────────────────────── */}
      <div className="drift-score-section">
        <div className="drift-score-label">Drift Score</div>
        <div className="drift-score-val" style={{ color: scoreColor }}>
          {result.driftScore}/100
        </div>
        <div className="drift-bar-bg">
          <div className="drift-bar-fill" style={{ width: `${result.driftScore}%`, background: scoreColor }} />
        </div>
        <div className="drift-verdict" style={{ color: scoreColor }}>
          {verdictIcon} {result.verdict}
        </div>
      </div>

      {/* ── ASI Score (paper metric) ─────────────────────────────────────── */}
      <div className="asi-score-section">
        <div className="asi-score-row">
          <span className="asi-score-label">Agent Stability Index</span>
          <span className="asi-score-val" style={{ color: asiColor }}>
            {result.ASI.toFixed(3)}
          </span>
        </div>
        <div className="drift-bar-bg">
          <div className="drift-bar-fill" style={{ width: `${result.ASI * 100}%`, background: asiColor }} />
          {/* Threshold marker τ = 0.75 */}
          <div className="asi-threshold-marker" style={{ left: '75%' }} title="Drift threshold τ = 0.75 (Rath 2026)" />
        </div>
        <div className="asi-threshold-label">τ = 0.75 {result.ASI < 0.75 ? '⚠️ DRIFT DETECTED' : '✅ STABLE'}</div>
      </div>

      {/* ── Drift Type Classification (Rath 2026 §2.3) ───────────────────── */}
      <div className="drift-types-section">
        <div className="drift-types-title">Drift Taxonomy (Rath 2026)</div>
        <div className="drift-type-row">
          <span className={`drift-type-badge ${DT.semanticDrift ? 'drift-active' : 'drift-ok'}`}>
            {DT.semanticDrift ? '⚠️' : '✅'} Semantic
          </span>
          <span className={`drift-type-badge ${DT.coordinationDrift ? 'drift-active' : 'drift-ok'}`}>
            {DT.coordinationDrift ? '⚠️' : '✅'} Coordination
          </span>
          <span className={`drift-type-badge ${DT.behavioralDrift ? 'drift-active' : 'drift-ok'}`}>
            {DT.behavioralDrift ? '⚠️' : '✅'} Behavioral
          </span>
        </div>
      </div>

      {/* ── 4 ASI Categories with 12 Dimensions ─────────────────────────── */}
      <div className="asi-categories">
        <div className="asi-categories-title">ASI Breakdown (12 Dimensions)</div>

        <CategoryBlock
          title="Response Consistency"
          cat={C.responseConsistency}
          dims={[
            { key: 'C_sem',  tooltip: 'Semantic vocabulary alignment with RAG fault ontology' },
            { key: 'C_path', tooltip: 'Diagnostic pathway completeness: sensor→breach→fault→severity→action' },
            { key: 'C_conf', tooltip: 'Priority/confidence calibration vs RUL ground truth' },
          ]}
        />

        <CategoryBlock
          title="Tool Usage Patterns"
          cat={C.toolUsage}
          dims={[
            { key: 'T_sel',   tooltip: 'Correct procedure selected from RAG procedure registry' },
            { key: 'T_seq',   tooltip: 'Procedure steps appear in RAG-defined order' },
            { key: 'T_param', tooltip: 'Sensor threshold values correctly cited from RAG' },
          ]}
        />

        <CategoryBlock
          title="Inter-Agent Coordination"
          cat={C.interAgentCoord}
          dims={[
            { key: 'I_agree',   tooltip: 'Diagnosis and Maintenance agree on fault mode' },
            { key: 'I_handoff', tooltip: 'Maintenance explicitly references Diagnosis findings' },
            { key: 'I_role',    tooltip: 'Each agent stays within its defined operational scope' },
          ]}
        />

        <CategoryBlock
          title="Behavioral Boundaries"
          cat={C.behavioralBoundaries}
          dims={[
            { key: 'B_length', tooltip: 'Output verbosity proportional to fault severity' },
            { key: 'B_error',  tooltip: 'No internal contradictions between agents' },
            { key: 'B_human',  tooltip: 'Appropriate human escalation for CRITICAL/HIGH cases' },
          ]}
        />
      </div>

      {/* ── Legacy Checks ────────────────────────────────────────────────── */}
      <div className="drift-checks">
        <div className="drift-check-row">
          <span className="drift-check-icon">{result.faultMatch ? '✅' : '❌'}</span>
          <div className="drift-check-body">
            <div className="drift-check-title">Fault Mode</div>
            <div className="drift-check-detail">
              RAG: <b>{result.ragFault}</b> · Agent: <b>{result.agentFault}</b>
            </div>
          </div>
        </div>
        <div className="drift-check-row">
          <span className="drift-check-icon">{result.priorityMatch ? '✅' : '❌'}</span>
          <div className="drift-check-body">
            <div className="drift-check-title">Priority Level</div>
            <div className="drift-check-detail">
              RAG: <b>{result.groundTruthPriority}</b> · Agent: <b>{result.agentPriority}</b>
            </div>
          </div>
        </div>
        <div className="drift-check-row">
          <span className="drift-check-icon">{result.procedureOk ? '✅' : '❌'}</span>
          <div className="drift-check-body">
            <div className="drift-check-title">Procedure</div>
            <div className="drift-check-detail">
              Expected: <b>{result.expectedProcedure}</b><br/>
              Agent: <b>{result.agentProcedure}</b>
            </div>
          </div>
        </div>
      </div>

      {/* ── RAG Threshold Checks ─────────────────────────────────────────── */}
      <div className="drift-thresholds">
        <div className="drift-thresh-title">RAG Threshold Checks</div>
        {result.thresholdChecks.map(c => (
          <div key={c.sensor} className="drift-thresh-row">
            <span className="drift-thresh-sensor">{c.sensor}</span>
            <span className="drift-thresh-family">{c.family}</span>
            <span className="drift-thresh-val">{c.value ?? '—'}</span>
            <span className={`drift-thresh-status ${c.triggered ? 'triggered' : 'ok'}`}>
              {c.triggered ? '⚠️ BREACH' : '✅ OK'}
            </span>
          </div>
        ))}
      </div>

      <div className="drift-source">
        ASI: Rath (2026) arXiv:2601.04070<br/>
        RAG: NASA TM-2008-215546 · ISO 13381-1:2015 · SAE JA1012
      </div>
    </aside>
  )
}
