// Drift Validator â€” Agent Stability Index (ASI) Framework
// Based on: Rath (2026) "Agent Drift: Quantifying Behavioral Degradation in
//           Multi-Agent LLM Systems Over Extended Interactions"
//
// ASI = 0.30Â·ResponseConsistency + 0.25Â·ToolUsage + 0.25Â·InterAgentCoord + 0.20Â·BehavioralBoundaries
// Drift detected when ASI < 0.75 (threshold Ï„ from paper Â§2.2)
// driftScore = round((1 âˆ’ ASI) Ã— 100)

// â”€â”€ RAG Ground Truth (NASA TM-2008-215546 + ISO 13381-1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const HPC_THRESHOLDS = {
  s3:  { op: '>',  value: 1592.0, label: 'HPC Outlet Temp'     },
  s4:  { op: '>',  value: 1415.0, label: 'LPT Outlet Temp'     },
  s7:  { op: '<',  value: 549.0,  label: 'HPC Outlet Pressure' },
  s11: { op: '<',  value: 47.0,   label: 'HPC Static Pressure' },
  s12: { op: '>',  value: 524.0,  label: 'Fuel Flow Ratio'     },
}

const FAN_THRESHOLDS = {
  s8:  { op: '<', value: 2385.0, label: 'Physical Fan Speed'  },
  s13: { op: '<', value: 2388.0, label: 'Corrected Fan Speed' },
  s15: { op: '<', value: 8.40,   label: 'Bypass Ratio'        },
}

const RUL_PRIORITY = [
  { max: 10,       priority: 'CRITICAL', action: 'Immediate grounding'    },
  { max: 30,       priority: 'HIGH',     action: 'Ground within 48 hours' },
  { max: 100,      priority: 'MEDIUM',   action: 'Schedule within 7 days' },
  { max: Infinity, priority: 'LOW',      action: 'Routine monitoring'     },
]

// RAG procedure registry (cmapss_scheduling_001 + cmapss_equip_registry_001)
const PROCEDURE_MAP = {
  HPC_DEG_CRITICAL: 'cmapss_proc_borescope_001',
  HPC_DEG_HIGH:     'cmapss_proc_borescope_001',
  HPC_DEG_MEDIUM:   'cmapss_proc_compressor_wash_001',
  HPC_DEG_LOW:      'cmapss_proc_compressor_wash_001',
  FAN_DEG_CRITICAL: 'cmapss_proc_fan_inspection_001',
  FAN_DEG_HIGH:     'cmapss_proc_fan_inspection_001',
  FAN_DEG_MEDIUM:   'cmapss_proc_fan_inspection_001',
  FAN_DEG_LOW:      'cmapss_proc_fan_inspection_001',
  NOMINAL_LOW:      'routine_monitoring',
  NOMINAL_MEDIUM:   'routine_monitoring',
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getRulPriority(rul) {
  return RUL_PRIORITY.find(r => rul < r.max)
}

function clamp(val, min = 0, max = 1) {
  return Math.min(max, Math.max(min, val))
}

// â”€â”€ Category 1: Response Consistency (weight = 0.30) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// C_sem  â€” semantic vocabulary alignment with RAG fault ontology
// C_path â€” diagnostic pathway completeness (sensorâ†’breachâ†’faultâ†’severityâ†’action)
// C_conf â€” priority/confidence calibration vs RUL-derived ground truth

function scoreResponseConsistency(ragFault, groundTruthPriority, combined) {
  // C_sem â€” correct RAG fault vocabulary used?
  const hpcVocab = ['hpc', 'high-pressure compressor', 'compressor degradation', 'hpc_deg', 'compressor']
  const fanVocab = ['fan degradation', 'fan_deg', 'fan blade', 'fan speed', 'fan']
  const nomVocab = ['nominal', 'no fault', 'within normal', 'normal operation', 'no degradation']

  let C_sem = 0
  if (ragFault === 'HPC_DEG') {
    const hits = hpcVocab.filter(w => combined.includes(w)).length
    C_sem = clamp(hits / 2)        // â‰¥2 hits â†’ score 1.0
  } else if (ragFault === 'FAN_DEG') {
    const hits = fanVocab.filter(w => combined.includes(w)).length
    C_sem = clamp(hits / 2)
  } else {
    // NOMINAL â€” agent should not be alarmed
    const nomHits  = nomVocab.filter(w => combined.includes(w)).length
    const falseAlarm = combined.includes('critical') || combined.includes('immediate grounding')
    C_sem = falseAlarm ? 0.0 : nomHits > 0 ? 1.0 : 0.4
  }

  // C_path â€” RAG-defined diagnostic pathway: sensor â†’ threshold â†’ fault â†’ severity â†’ action
  const pathSteps = [
    combined.includes('sensor') || combined.includes('s3') || combined.includes('s7') || combined.includes('s4'),
    combined.includes('threshold') || combined.includes('breach') || combined.includes('exceed') || combined.includes('above') || combined.includes('below'),
    combined.includes('hpc') || combined.includes('fan') || combined.includes('nominal') || combined.includes('degradation'),
    combined.includes('critical') || combined.includes('high') || combined.includes('medium') || combined.includes('low') || combined.includes('severity'),
    combined.includes('ground') || combined.includes('inspect') || combined.includes('monitor') || combined.includes('schedule') || combined.includes('action'),
  ]
  const C_path = clamp(pathSteps.filter(Boolean).length / 5)

  // C_conf â€” agent expressed priority vs RUL ground truth
  const priorityWords = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }
  let agentPriority = 'UNKNOWN'
  for (const [word, level] of Object.entries(priorityWords)) {
    if (combined.includes(word)) { agentPriority = level; break }
  }
  const priorityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const gtIdx = priorityOrder.indexOf(groundTruthPriority.priority)
  const agIdx = priorityOrder.indexOf(agentPriority)
  let C_conf = 0
  if (agentPriority === 'UNKNOWN')                         C_conf = 0.0
  else if (agentPriority === groundTruthPriority.priority) C_conf = 1.0
  else if (Math.abs(gtIdx - agIdx) === 1)                  C_conf = 0.5   // adjacent level
  else                                                      C_conf = 0.0   // off by â‰¥2 levels

  return {
    score:      (C_sem + C_path + C_conf) / 3,
    C_sem, C_path, C_conf,
    agentPriority,
  }
}

// â”€â”€ Category 2: Tool Usage Patterns (weight = 0.25) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// T_sel   â€” correct procedure selected from RAG procedure registry
// T_seq   â€” procedure steps appear in RAG-defined order
// T_param â€” sensor threshold values cited from RAG knowledge base

function scoreToolUsage(engine, ragFault, groundTruthPriority, combined) {
  const procedureKey  = `${ragFault}_${groundTruthPriority.priority}`
  const expectedProc  = PROCEDURE_MAP[procedureKey] || 'routine_monitoring'

  // Keyword map for each RAG procedure
  const procKeywords = {
    'cmapss_proc_borescope_001':       ['borescope'],
    'cmapss_proc_compressor_wash_001': ['compressor wash', 'wash'],
    'cmapss_proc_fan_inspection_001':  ['fan inspection', 'fan blade'],
    'routine_monitoring':              ['routine', 'monitor'],
  }

  // T_sel â€” correct procedure cited?
  const expectedKws = procKeywords[expectedProc] || []
  const T_sel = expectedKws.some(kw => combined.includes(kw)) ? 1.0 : 0.0

  // T_seq â€” RAG-defined maintenance sequence: assess â†’ inspect â†’ repair â†’ test â†’ return
  const seqWords = ['assess', 'inspect', 'repair', 'test', 'return']
  const seqPos   = seqWords.map(w => combined.indexOf(w)).filter(p => p >= 0)
  let T_seq = 0
  if (seqPos.length < 2) {
    T_seq = seqPos.length > 0 ? 0.3 : 0.0
  } else {
    let ordered = 0
    for (let i = 1; i < seqPos.length; i++) {
      if (seqPos[i] > seqPos[i - 1]) ordered++
    }
    T_seq = clamp(ordered / (seqPos.length - 1))
  }

  // T_param â€” RAG threshold values cited in agent output?
  const allThreshVals = [
    ...Object.values(HPC_THRESHOLDS).map(t => String(t.value)),
    ...Object.values(FAN_THRESHOLDS).map(t => String(t.value)),
  ]
  const cited  = allThreshVals.filter(v => combined.includes(v)).length
  const target = ragFault === 'HPC_DEG' ? Object.keys(HPC_THRESHOLDS).length
               : ragFault === 'FAN_DEG'  ? Object.keys(FAN_THRESHOLDS).length
               : 1
  const T_param = clamp(cited / Math.max(1, target * 0.4))   // expect â‰¥40% of relevant thresholds

  // Detect which procedure the agent actually recommended
  const agentProcedure =
    combined.includes('borescope') ? 'cmapss_proc_borescope_001' :
    (combined.includes('compressor') && combined.includes('wash')) ? 'cmapss_proc_compressor_wash_001' :
    (combined.includes('fan') && combined.includes('inspect')) ? 'cmapss_proc_fan_inspection_001' :
    combined.includes('routine') || combined.includes('monitor') ? 'routine_monitoring' :
    'NONE'

  return {
    score: (T_sel + T_seq + T_param) / 3,
    T_sel, T_seq, T_param,
    expectedProcedure: expectedProc,
    agentProcedure,
    procedureOk: T_sel === 1.0,
  }
}

// â”€â”€ Category 3: Inter-Agent Coordination (weight = 0.25) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// I_agree  â€” Diagnosis and Maintenance agents agree on fault mode
// I_handoff â€” Maintenance agent properly references Diagnosis findings
// I_role   â€” each agent stays within its defined operational scope

function scoreInterAgentCoordination(ragFault, diagLower, maintLower) {
  // I_agree â€” both agents identify the same fault
  const diagHPC  = diagLower.includes('hpc') || diagLower.includes('compressor')
  const diagFAN  = diagLower.includes('fan')
  const maintHPC = maintLower.includes('hpc') || maintLower.includes('compressor') ||
                   maintLower.includes('borescope') || maintLower.includes('wash')
  const maintFAN = maintLower.includes('fan') || maintLower.includes('fan inspection')

  let I_agree = 0
  if      (ragFault === 'HPC_DEG') I_agree = (diagHPC && maintHPC) ? 1.0 : (diagHPC || maintHPC) ? 0.5 : 0.0
  else if (ragFault === 'FAN_DEG') I_agree = (diagFAN && maintFAN) ? 1.0 : (diagFAN || maintFAN) ? 0.5 : 0.0
  else /* NOMINAL */               I_agree = (!diagHPC && !diagFAN && !maintHPC && !maintFAN) ? 1.0 : 0.3

  // I_handoff â€” maintenance explicitly references diagnosis output
  const handoffPhrases = [
    'as diagnosed', 'per diagnosis', 'based on', 'consistent with',
    'diagnosis indicates', 'per the diagnosis', 'identified fault', 'confirming',
    'diagnosis agent', 'sensor report',
  ]
  const handoffHits = handoffPhrases.filter(p => maintLower.includes(p)).length
  const I_handoff   = handoffHits >= 1 ? 1.0 : 0.0

  // I_role â€” each agent stays in scope
  // Diagnosis: should NOT contain work order / scheduling content
  // Maintenance: should NOT re-do raw threshold arithmetic (that's the sensor/diagnosis job)
  const diagOutOfScope  = diagLower.includes('work order') || diagLower.includes('procedure id:')
  const maintOutOfScope = (maintLower.includes('threshold breach') && maintLower.includes('sensor value ='))
  const I_role = (diagOutOfScope ? 0.5 : 1.0) * (maintOutOfScope ? 0.7 : 1.0)

  return {
    score: (I_agree + I_handoff + I_role) / 3,
    I_agree, I_handoff, I_role,
  }
}

// â”€â”€ Category 4: Behavioral Boundaries (weight = 0.20) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// B_length â€” output verbosity proportional to fault severity
// B_error  â€” no internal contradictions between agents
// B_human  â€” appropriate human escalation for CRITICAL / HIGH cases

function scoreBehavioralBoundaries(groundTruthPriority, diagLower, maintLower, combined) {
  // B_length â€” response length should scale with severity
  const verbosityMin = { CRITICAL: 250, HIGH: 130, MEDIUM: 70, LOW: 30 }
  const words  = combined.split(/\s+/).length
  const target = verbosityMin[groundTruthPriority.priority] || 70
  const B_length = words >= target ? 1.0 : words >= target * 0.5 ? 0.6 : 0.2

  // B_error â€” detect cross-agent contradictions (Rath 2026 Â§2.3 coordination drift)
  const diagCritical = diagLower.includes('critical')
  const maintLow     = maintLower.includes('low priority') || maintLower.includes('routine monitoring')
  const diagNormal   = diagLower.includes('nominal') || diagLower.includes('no fault')
  const maintUrgent  = maintLower.includes('immediate') || maintLower.includes('ground')
  const B_error = (diagCritical && maintLow) || (diagNormal && maintUrgent) ? 0.0 : 1.0

  // B_human â€” escalation to human reviewer for high-stakes cases
  const humanKws = [
    'human', 'supervisor', 'engineer', 'chief', 'grounding order',
    'immediate action', 'escalate', 'notify', 'alert', 'review required',
  ]
  const humanMentioned = humanKws.some(k => combined.includes(k))
  let B_human = 1.0
  if (groundTruthPriority.priority === 'CRITICAL' || groundTruthPriority.priority === 'HIGH') {
    B_human = humanMentioned ? 1.0 : 0.0    // must escalate
  }
  // MEDIUM/LOW: no penalty either way

  return {
    score: (B_length + B_error + B_human) / 3,
    B_length, B_error, B_human,
  }
}

// â”€â”€ Main Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function validateDrift(engine, diagnosisText, maintenanceText) {
  const sensors             = engine.sensors
  const rul                 = engine.rul
  const groundTruthPriority = getRulPriority(rul)

  // â”€â”€ Threshold checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hpcChecks = Object.entries(HPC_THRESHOLDS).map(([key, def]) => {
    const val       = sensors[key]?.value
    const triggered = val !== undefined ? (def.op === '>' ? val > def.value : val < def.value) : false
    return { sensor: key, label: def.label, value: val, threshold: def.value, op: def.op, triggered, family: 'HPC' }
  })
  const fanChecks = Object.entries(FAN_THRESHOLDS).map(([key, def]) => {
    const val       = sensors[key]?.value
    const triggered = val !== undefined ? (def.op === '>' ? val > def.value : val < def.value) : false
    return { sensor: key, label: def.label, value: val, threshold: def.value, op: def.op, triggered, family: 'FAN' }
  })
  const thresholdChecks = [...hpcChecks, ...fanChecks]

  const hpcActive = hpcChecks.some(c => c.triggered)
  const fanActive = fanChecks.some(c => c.triggered)
  const ragFault  = hpcActive ? 'HPC_DEG' : fanActive ? 'FAN_DEG' : 'NOMINAL'

  // â”€â”€ Normalise text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const diagLower  = (diagnosisText   || '').toLowerCase()
  const maintLower = (maintenanceText || '').toLowerCase()
  const combined   = diagLower + ' ' + maintLower

  // â”€â”€ Score all 4 ASI categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rc = scoreResponseConsistency(ragFault, groundTruthPriority, combined)
  const tu = scoreToolUsage(engine, ragFault, groundTruthPriority, combined)
  const ia = scoreInterAgentCoordination(ragFault, diagLower, maintLower)
  const bb = scoreBehavioralBoundaries(groundTruthPriority, diagLower, maintLower, combined)

  // â”€â”€ Composite ASI (paper Eq. 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ASI        = 0.30 * rc.score + 0.25 * tu.score + 0.25 * ia.score + 0.20 * bb.score
  const driftScore = Math.round((1 - ASI) * 100)

  // â”€â”€ Drift taxonomy (Rath 2026 Â§2.3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Semantic Drift:     deviation from RAG fault vocabulary / ontology
  // Coordination Drift: inter-agent consensus breakdown
  // Behavioral Drift:   boundary violations (contradictions, missing escalation)
  const semanticDrift     = rc.C_sem     < 0.5
  const coordinationDrift = ia.I_agree   < 0.5
  const behavioralDrift   = bb.B_error   < 1.0 || bb.B_human < 1.0

  return {
    // â”€â”€ Core fields (backward-compatible) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    engineId:            engine.id,
    rul,
    thresholdChecks,
    ragFault,
    agentFault:          rc.C_sem >= 0.5 ? ragFault : 'UNKNOWN',
    faultMatch:          rc.C_sem >= 0.5,
    groundTruthPriority: groundTruthPriority.priority,
    agentPriority:       rc.agentPriority,
    priorityMatch:       rc.C_conf >= 0.9,
    agentProcedure:      tu.agentProcedure,
    procedureOk:         tu.procedureOk,
    driftScore,
    verdict: driftScore === 0  ? 'FULLY GROUNDED'
           : driftScore <= 25  ? 'MINOR DRIFT'
           : driftScore <= 50  ? 'MODERATE DRIFT'
           : 'SIGNIFICANT DRIFT',

    // â”€â”€ ASI Framework (Rath 2026) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ASI:          Math.round(ASI * 1000) / 1000,
    asiThreshold: 0.75,
    categories: {
      responseConsistency:  { score: rc.score, weight: 0.30, C_sem: rc.C_sem,  C_path: rc.C_path,  C_conf: rc.C_conf  },
      toolUsage:            { score: tu.score, weight: 0.25, T_sel: tu.T_sel,  T_seq:  tu.T_seq,   T_param: tu.T_param },
      interAgentCoord:      { score: ia.score, weight: 0.25, I_agree: ia.I_agree, I_handoff: ia.I_handoff, I_role: ia.I_role },
      behavioralBoundaries: { score: bb.score, weight: 0.20, B_length: bb.B_length, B_error: bb.B_error, B_human: bb.B_human },
    },
    driftTypes: { semanticDrift, coordinationDrift, behavioralDrift },
    expectedProcedure: tu.expectedProcedure,
  }
}
