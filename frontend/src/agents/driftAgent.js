// Drift Validator — deterministic, no API call
// Compares agent diagnosis against RAG ground truth thresholds

const HPC_THRESHOLDS = {
  s3:  { op: '>',  value: 1592.0, label: 'HPC outlet temp'     },
  s4:  { op: '>',  value: 1415.0, label: 'LPT outlet temp'     },
  s7:  { op: '<',  value: 549.0,  label: 'HPC outlet pressure' },
  s11: { op: '<',  value: 47.0,   label: 'HPC static pressure' },
  s12: { op: '>',  value: 524.0,  label: 'Fuel flow ratio'     },
}

const RUL_PRIORITY = [
  { max: 10,  priority: 'CRITICAL', action: 'Immediate grounding'       },
  { max: 30,  priority: 'HIGH',     action: 'Ground within 48 hours'    },
  { max: 100, priority: 'MEDIUM',   action: 'Schedule within 7 days'    },
  { max: Infinity, priority: 'LOW', action: 'Routine monitoring'        },
]

function getRulPriority(rul) {
  return RUL_PRIORITY.find(r => rul < r.max)
}

export function validateDrift(engine, diagnosisText, maintenanceText) {
  const sensors = engine.sensors
  const rul = engine.rul
  const groundTruthFault = engine.faultMode
  const groundTruthPriority = getRulPriority(rul)

  // ── Check each HPC threshold ──────────────────────────────────────────
  const thresholdChecks = Object.entries(HPC_THRESHOLDS).map(([key, def]) => {
    const val = sensors[key]?.value
    const triggered = def.op === '>' ? val > def.value : val < def.value
    return { sensor: key, label: def.label, value: val, threshold: def.value, op: def.op, triggered }
  })

  const hpcActive = thresholdChecks.some(c => c.triggered)
  const ragFault = hpcActive ? 'HPC_DEG' : 'NOMINAL'

  // ── Parse agent outputs ───────────────────────────────────────────────
  const diagLower = (diagnosisText || '').toLowerCase()
  const maintLower = (maintenanceText || '').toLowerCase()
  const combined = diagLower + ' ' + maintLower

  const agentDetectedHPC  = combined.includes('hpc') || combined.includes('compressor') || combined.includes('degradation')
  const agentFault        = agentDetectedHPC ? 'HPC_DEG' : 'NOMINAL'

  const priorityWords = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }
  let agentPriority = 'UNKNOWN'
  for (const [word, level] of Object.entries(priorityWords)) {
    if (combined.includes(word)) { agentPriority = level; break }
  }

  const agentProcedure = combined.includes('borescope') ? 'cmapss_proc_borescope_001'
    : combined.includes('wash') ? 'cmapss_proc_compressor_wash_001'
    : combined.includes('fan') ? 'cmapss_proc_fan_inspection_001'
    : 'NONE'

  // ── Compute drift scores ──────────────────────────────────────────────
  const faultMatch    = agentFault === ragFault
  const priorityMatch = agentPriority === groundTruthPriority.priority
  const procedureOk   = agentProcedure !== 'NONE'

  const driftScore = Math.round(
    ((faultMatch ? 0 : 40) + (priorityMatch ? 0 : 40) + (procedureOk ? 0 : 20))
  )

  return {
    engineId:         engine.id,
    rul,
    thresholdChecks,
    ragFault,
    agentFault,
    faultMatch,
    groundTruthPriority: groundTruthPriority.priority,
    agentPriority,
    priorityMatch,
    agentProcedure,
    procedureOk,
    driftScore,
    verdict: driftScore === 0 ? 'FULLY GROUNDED'
           : driftScore <= 20 ? 'MINOR DRIFT'
           : driftScore <= 60 ? 'MODERATE DRIFT'
           : 'SIGNIFICANT DRIFT',
  }
}
