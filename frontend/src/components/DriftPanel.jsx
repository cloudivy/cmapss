export default function DriftPanel({ result }) {
  if (!result) return (
    <aside className="drift-panel">
      <div className="drift-title">📊 Drift Validator</div>
      <div className="drift-empty">
        <p>Drift report appears here after analysis.</p>
        <p className="drift-hint">The validator checks if the agent's prediction is grounded in the RAG knowledge base (NASA/ISO standards).</p>
      </div>
    </aside>
  )

  const scoreColor = result.driftScore === 0 ? '#3fb950'
    : result.driftScore <= 20 ? '#d29922'
    : result.driftScore <= 60 ? '#f0883e'
    : '#f85149'

  const verdictIcon = result.driftScore === 0 ? '✅'
    : result.driftScore <= 20 ? '🟡'
    : result.driftScore <= 60 ? '🟠'
    : '🔴'

  return (
    <aside className="drift-panel">
      <div className="drift-title">📊 Drift Validator</div>
      <div className="drift-engine">{result.engineId}</div>

      {/* Score gauge */}
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

      {/* Checks */}
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
            <div className="drift-check-title">Procedure Cited</div>
            <div className="drift-check-detail">{result.agentProcedure}</div>
          </div>
        </div>
      </div>

      {/* Threshold checks */}
      <div className="drift-thresholds">
        <div className="drift-thresh-title">RAG Threshold Checks</div>
        {result.thresholdChecks.map(c => (
          <div key={c.sensor} className="drift-thresh-row">
            <span className="drift-thresh-sensor">{c.sensor}</span>
            <span className="drift-thresh-val">{c.value}</span>
            <span className={`drift-thresh-status ${c.triggered ? 'triggered' : 'ok'}`}>
              {c.triggered ? '⚠️ BREACH' : '✅ OK'}
            </span>
          </div>
        ))}
      </div>

      <div className="drift-source">
        Source: NASA TM-2008-215546<br/>ISO 13381-1:2015 · SAE JA1012
      </div>
    </aside>
  )
}
