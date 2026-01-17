'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  computePressureDesign,
  type PressureDesignComputeRequest,
  type PressureDesignComputeResponse,
  type PressureDesignMode,
} from '@/lib/api/dataClient'

type HydraulicsLike = {
  mechanical?: {
    outerDiameter: number
    wallThickness: number
    grade: string
    designFactor: string
    jointFactor: string
    tempDerating: string
  }
  operating?: {
    inletPressure: string
  }
}

export function PressureDesignSection({
  projectName,
  hydraulics,
}: {
  projectName?: string
  hydraulics?: HydraulicsLike
}) {
  const [mode, setMode] = useState<PressureDesignMode>('thickness_from_pressure')
  const [saveRun, setSaveRun] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<PressureDesignComputeResponse | null>(null)

  const [form, setForm] = useState(() => ({
    outsideDiameterValue: '',
    outsideDiameterUnit: 'mm' as 'mm' | 'm' | 'in',

    designPressureValue: '',
    designPressureUnit: 'bar' as 'bar' | 'MPa' | 'psi' | 'Pa',

    nominalWallThicknessValue: '',
    nominalWallThicknessUnit: 'mm' as 'mm' | 'm' | 'in',

    allowableInputType: 'smys_with_factors' as 'smys_with_factors' | 'direct_allowable',
    smysValue: '',
    smysUnit: 'MPa' as 'MPa' | 'psi' | 'bar' | 'Pa',
    allowableHoopStressValue: '',
    allowableHoopStressUnit: 'MPa' as 'MPa' | 'psi' | 'bar' | 'Pa',

    designFactor: '0.72',
    jointFactor: '1.0',
    temperatureDeratingFactor: '1.0',

    surgeMarginFraction: '0.0',
    safetyMarginFraction: '0.0',
    corrosionAllowanceValue: '0.0',
    corrosionAllowanceUnit: 'mm' as 'mm' | 'm' | 'in',
    additionalThicknessValue: '0.0',
    additionalThicknessUnit: 'mm' as 'mm' | 'm' | 'in',
    millToleranceFraction: '0.0',

    method: 'thin_wall_barlow' as 'thin_wall_barlow' | 'thick_wall_lame',
  }))

  // Prefill from PIRL hydraulics panel (only when fields are still blank)
  useEffect(() => {
    const mech = hydraulics?.mechanical
    const op = hydraulics?.operating
    if (!mech && !op) return

    setForm(prev => ({
      ...prev,
      outsideDiameterValue:
        prev.outsideDiameterValue || (mech?.outerDiameter ? String(mech.outerDiameter) : prev.outsideDiameterValue),
      nominalWallThicknessValue:
        prev.nominalWallThicknessValue || (mech?.wallThickness ? String(mech.wallThickness) : prev.nominalWallThicknessValue),
      smysValue:
        prev.smysValue || (mech?.grade ? String(parseFloat(mech.grade) || mech.grade) : prev.smysValue),
      designFactor: prev.designFactor || mech?.designFactor || prev.designFactor,
      jointFactor: prev.jointFactor || mech?.jointFactor || prev.jointFactor,
      temperatureDeratingFactor: prev.temperatureDeratingFactor || mech?.tempDerating || prev.temperatureDeratingFactor,
      designPressureValue:
        prev.designPressureValue || (op?.inletPressure ? String(op.inletPressure) : prev.designPressureValue),
    }))
  }, [hydraulics])

  const title = useMemo(() => {
    return mode === 'thickness_from_pressure' ? 'Required Wall Thickness' : 'Max Allowable Pressure'
  }, [mode])

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function numOr(value: string, fallback: number) {
    const v = Number(value)
    return Number.isFinite(v) ? v : fallback
  }

  function formatValue(v: unknown): string {
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '')
    const abs = Math.abs(v)
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return v.toExponential(6)
    return v.toFixed(6).replace(/\.?0+$/, '')
  }

  async function runCalculation() {
    setError(null)
    setResponse(null)

    if (saveRun && !projectName) {
      setError('Select a project before saving a run.')
      return
    }

    const inputs: Record<string, any> = {
      outside_diameter_value: numOr(form.outsideDiameterValue, NaN),
      outside_diameter_unit: form.outsideDiameterUnit,

      allowable_input_type: form.allowableInputType,
      smys_value: numOr(form.smysValue, 0),
      smys_unit: form.smysUnit,
      allowable_hoop_stress_value: numOr(form.allowableHoopStressValue, 0),
      allowable_hoop_stress_unit: form.allowableHoopStressUnit,

      design_factor: numOr(form.designFactor, 0.72),
      joint_factor: numOr(form.jointFactor, 1.0),
      temperature_derating_factor: numOr(form.temperatureDeratingFactor, 1.0),

      surge_margin_fraction: numOr(form.surgeMarginFraction, 0.0),
      safety_margin_fraction: numOr(form.safetyMarginFraction, 0.0),
      corrosion_allowance_value: numOr(form.corrosionAllowanceValue, 0.0),
      corrosion_allowance_unit: form.corrosionAllowanceUnit,
      additional_thickness_value: numOr(form.additionalThicknessValue, 0.0),
      additional_thickness_unit: form.additionalThicknessUnit,
      mill_tolerance_fraction: numOr(form.millToleranceFraction, 0.0),

      method: form.method,
    }

    if (mode === 'thickness_from_pressure') {
      inputs.design_pressure_value = numOr(form.designPressureValue, NaN)
      inputs.design_pressure_unit = form.designPressureUnit
    } else {
      inputs.nominal_wall_thickness_value = numOr(form.nominalWallThicknessValue, NaN)
      inputs.nominal_wall_thickness_unit = form.nominalWallThicknessUnit
    }

    const req: PressureDesignComputeRequest = {
      mode,
      inputs,
      save: saveRun,
      project: projectName,
    }

    setIsRunning(true)
    try {
      const res = await computePressureDesign(req)
      setResponse(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run pressure design calculation')
    } finally {
      setIsRunning(false)
    }
  }

  const result = response?.result as any | undefined

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-8">
        <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-wide">Pressure Design</h3>
          <p className="text-xs text-white/50 max-w-3xl leading-relaxed font-light">
          Engineer-driven pressure design calculator backed by the PIRL engine. Choose a workflow, set units and
          factors, and review a full intermediate breakdown with warnings.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        {/* Inputs */}
        <div className="space-y-6">
          <div className="bg-white/[0.02] border border-white/10 p-6 rounded-sm space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Workflow</h4>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">Select what you want to solve</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectRow
                label="Mode"
                value={mode}
                onChange={(v) => setMode(v as PressureDesignMode)}
                options={[
                  { value: 'thickness_from_pressure', label: 'Thickness from Pressure' },
                  { value: 'pressure_from_thickness', label: 'Pressure from Thickness' },
                ]}
              />
              <SelectRow
                label="Method"
                value={form.method}
                onChange={(v) => setField('method', v as any)}
                options={[
                  { value: 'thin_wall_barlow', label: 'Thin-wall (Barlow)' },
                  { value: 'thick_wall_lame', label: 'Thick-wall (Lamé)' },
                ]}
              />
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/10 p-6 rounded-sm space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Geometry & Loading</h4>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">Units are explicit</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputRow
                label="Outside Diameter"
                value={form.outsideDiameterValue}
                onChange={(v) => setField('outsideDiameterValue', v)}
                unitValue={form.outsideDiameterUnit}
                onUnitChange={(u) => setField('outsideDiameterUnit', u as any)}
                unitOptions={['mm', 'm', 'in']}
              />

              {mode === 'thickness_from_pressure' ? (
                <InputRow
                  label="Design Pressure"
                  value={form.designPressureValue}
                  onChange={(v) => setField('designPressureValue', v)}
                  unitValue={form.designPressureUnit}
                  onUnitChange={(u) => setField('designPressureUnit', u as any)}
                  unitOptions={['bar', 'MPa', 'psi', 'Pa']}
                />
              ) : (
                <InputRow
                  label="Nominal Wall Thickness"
                  value={form.nominalWallThicknessValue}
                  onChange={(v) => setField('nominalWallThicknessValue', v)}
                  unitValue={form.nominalWallThicknessUnit}
                  onUnitChange={(u) => setField('nominalWallThicknessUnit', u as any)}
                  unitOptions={['mm', 'm', 'in']}
                />
              )}
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/10 p-6 rounded-sm space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Allowable Stress</h4>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">Direct or SMYS with factors</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectRow
                label="Allowable Input"
                value={form.allowableInputType}
                onChange={(v) => setField('allowableInputType', v as any)}
                options={[
                  { value: 'smys_with_factors', label: 'SMYS × Factors' },
                  { value: 'direct_allowable', label: 'Direct Allowable' },
                ]}
              />
              <InputRow
                label={form.allowableInputType === 'direct_allowable' ? 'Allowable Hoop Stress' : 'SMYS'}
                value={form.allowableInputType === 'direct_allowable' ? form.allowableHoopStressValue : form.smysValue}
                onChange={(v) =>
                  form.allowableInputType === 'direct_allowable'
                    ? setField('allowableHoopStressValue', v)
                    : setField('smysValue', v)
                }
                unitValue={form.allowableInputType === 'direct_allowable' ? form.allowableHoopStressUnit : form.smysUnit}
                onUnitChange={(u) =>
                  form.allowableInputType === 'direct_allowable'
                    ? setField('allowableHoopStressUnit', u as any)
                    : setField('smysUnit', u as any)
                }
                unitOptions={['MPa', 'psi', 'bar', 'Pa']}
              />
            </div>

            <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', form.allowableInputType === 'direct_allowable' && 'opacity-60')}>
              <InputText label="Design Factor" value={form.designFactor} onChange={(v) => setField('designFactor', v)} />
              <InputText label="Joint Factor" value={form.jointFactor} onChange={(v) => setField('jointFactor', v)} />
              <InputText
                label="Temp Derating"
                value={form.temperatureDeratingFactor}
                onChange={(v) => setField('temperatureDeratingFactor', v)}
              />
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/10 p-6 rounded-sm space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Allowances & Margins</h4>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">Engineer-controlled headroom</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputText label="Surge Margin (fraction)" value={form.surgeMarginFraction} onChange={(v) => setField('surgeMarginFraction', v)} />
              <InputText label="Safety Margin (fraction)" value={form.safetyMarginFraction} onChange={(v) => setField('safetyMarginFraction', v)} />
              <InputRow
                label="Corrosion Allowance"
                value={form.corrosionAllowanceValue}
                onChange={(v) => setField('corrosionAllowanceValue', v)}
                unitValue={form.corrosionAllowanceUnit}
                onUnitChange={(u) => setField('corrosionAllowanceUnit', u as any)}
                unitOptions={['mm', 'm', 'in']}
              />
              <InputRow
                label="Additional Thickness"
                value={form.additionalThicknessValue}
                onChange={(v) => setField('additionalThicknessValue', v)}
                unitValue={form.additionalThicknessUnit}
                onUnitChange={(u) => setField('additionalThicknessUnit', u as any)}
                unitOptions={['mm', 'm', 'in']}
              />
              <InputText label="Mill Tolerance (fraction)" value={form.millToleranceFraction} onChange={(v) => setField('millToleranceFraction', v)} />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={saveRun}
                  onChange={(e) => setSaveRun(e.target.checked)}
                  className="h-3.5 w-3.5 accent-red-500"
                />
                Save run to project artifacts
              </label>
              <Button
                onClick={runCalculation}
                disabled={isRunning}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-sm"
              >
                {isRunning ? 'Running…' : title}
              </Button>
            </div>

            {error && (
              <div className="mt-3 p-3 border border-red-500/30 bg-red-500/10 text-red-200 text-xs font-mono rounded-sm">
                {error}
              </div>
            )}
            {response?.saved && response.artifact_path && (
              <div className="mt-3 p-3 border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs font-mono rounded-sm">
                Saved: {response.artifact_path}
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-6">
          <div className="bg-white/[0.02] border border-white/10 p-6 rounded-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Results</h4>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">Native C++ output (traceable)</p>
              </div>
            </div>

            {!result ? (
              <div className="text-xs text-white/40 font-mono">Run a calculation to see results.</div>
            ) : (
              <div className="space-y-4">
                {mode === 'thickness_from_pressure' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <ResultCard
                      label="Required Nominal Thickness"
                      value={`${formatValue(result.required_nominal_thickness_mm)} mm`}
                      hint="Includes allowances + mill tolerance adjustment"
                    />
                    <ResultCard
                      label="Net Thickness (formula)"
                      value={`${formatValue(result.required_net_thickness_m)} m`}
                      hint="After safety margin"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <ResultCard
                      label="Max Allowable Pressure"
                      value={`${formatValue(result.max_allowable_pressure_bar)} bar`}
                      hint="After surge/safety margins"
                    />
                    <ResultCard
                      label="Available Net Thickness"
                      value={`${formatValue(result.available_net_thickness_m)} m`}
                      hint="After mill tolerance and allowances"
                    />
                  </div>
                )}

                {Array.isArray(result.warnings) && result.warnings.length > 0 && (
                  <div className="p-3 border border-amber-500/30 bg-amber-500/10 rounded-sm">
                    <div className="text-[10px] text-amber-200 uppercase tracking-widest font-bold mb-2">Warnings</div>
                    <ul className="text-xs text-amber-100/90 font-mono space-y-1">
                      {result.warnings.map((w: string, idx: number) => (
                        <li key={idx}>- {w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white/[0.02] border border-white/10 p-6 rounded-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Intermediate Breakdown</h4>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">Key steps & unitized values</p>
              </div>
            </div>

            {!result?.intermediates ? (
              <div className="text-xs text-white/40 font-mono">No intermediate values yet.</div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-2">
                {(result.intermediates as any[]).map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 p-2 border border-white/5 bg-black/20 rounded-sm">
                    <div className="col-span-4 text-[10px] text-white/70 font-mono break-all">{row.key}</div>
                    <div className="col-span-3 text-[10px] text-white font-mono">{formatValue(row.value)}</div>
                    <div className="col-span-2 text-[10px] text-white/50 font-mono">{row.unit}</div>
                    <div className="col-span-3 text-[10px] text-white/40 font-mono">{row.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/20 border border-white/10 text-white text-xs px-3 py-2 rounded-sm focus:outline-none focus:border-red-500/50 font-mono hover:bg-white/5 hover:border-white/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-black">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function InputText({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/20 border border-white/10 text-white text-xs px-3 py-2 rounded-sm focus:outline-none focus:border-red-500/50 transition-all font-mono hover:bg-white/5 hover:border-white/20"
      />
    </div>
  )
}

function InputRow({
  label,
  value,
  onChange,
  unitValue,
  onUnitChange,
  unitOptions,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  unitValue: string
  onUnitChange: (unit: string) => void
  unitOptions: string[]
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{label}</label>
      <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-black/20 border border-white/10 text-white text-xs px-3 py-2 rounded-sm focus:outline-none focus:border-red-500/50 transition-all font-mono hover:bg-white/5 hover:border-white/20"
        />
        <select
          value={unitValue}
          onChange={(e) => onUnitChange(e.target.value)}
          className="min-w-[88px] bg-black/20 border border-white/10 text-white text-xs px-2 py-2 rounded-sm focus:outline-none focus:border-red-500/50 font-mono hover:bg-white/5 hover:border-white/20"
        >
          {unitOptions.map((u) => (
            <option key={u} value={u} className="bg-black">
              {u}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ResultCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-4 border border-white/10 bg-black/20 rounded-sm space-y-1">
      <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{label}</div>
      <div className="text-lg font-mono text-red-200">{value}</div>
      {hint && <div className="text-[10px] text-white/30 font-mono">{hint}</div>}
    </div>
  )
}


