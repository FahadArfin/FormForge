import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Braces, CheckCircle2, Link2, Plus, Trash2 } from 'lucide-react'
import {
  type ModelNode,
  type ParameterBindingTarget,
  type ParameterDefinition,
  type ParameterUnit,
} from '@formforge/model'
import { evaluateNamedParameters, getParameterTargetInfo, parameterTargets } from '@/lib/modelParameters'
import { useEditor } from '@/store/editor'
import { ParameterVariants } from './ParameterVariants'
import { parameterUsage } from '@/lib/parameterManagement'
import './InspectorWorkflows.css'

const parameterReference = (name: string) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name.trim()) ? name.trim() : `[${name.trim()}]`

function ParameterRow({ parameter, resolved }: { parameter: ParameterDefinition; resolved?: { value: number; unit: string } }) {
  const update = useEditor((state) => state.updateNamedParameter)
  const remove = useEditor((state) => state.removeNamedParameter)
  const document = useEditor((state) => state.document)
  const usage = useMemo(() => { try { return {items:parameterUsage(document,parameter.id),error:''} } catch { return {items:[],error:'Fix invalid expressions before checking references or removing this parameter.'} } },[document,parameter.id])
  const [draft, setDraft] = useState(parameter)
  useEffect(() => setDraft(parameter), [parameter])

  const literal = !draft.expression.trim() || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(draft.expression.trim())
  const commit = () => {
    if (draft.name === parameter.name && draft.expression === parameter.expression && draft.value === parameter.value && draft.unit === parameter.unit) return
    update(parameter.id, {
      name: draft.name.trim() || parameter.name,
      expression: draft.expression,
      value: Number.isFinite(draft.value) ? draft.value : parameter.value,
      unit: draft.unit,
    })
  }

  return <article className="parameter-row">
    <header>
      <input aria-label={`Rename parameter ${parameter.name}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={commit} />
      <button aria-label={`Remove ${parameter.name}`} title={usage.items.length?'Remove references listed below first':`Remove ${parameter.name}`} disabled={!!usage.items.length||!!usage.error} onClick={() => remove(parameter.id)}><Trash2 size={16} /></button>
    </header>
    <div className="parameter-base">
      <label><span>{literal?'Value':'Fallback value'}</span><input type="number" step="0.1" disabled={!literal} value={draft.value} onChange={(event) => setDraft({ ...draft, value: Number(event.target.value), expression: draft.expression.trim()?String(Number(event.target.value)):'' })} onBlur={commit} /></label>
      <label><span>Unit</span><select value={draft.unit} onChange={(event) => { const unit = event.target.value as ParameterUnit; setDraft({ ...draft, unit }); update(parameter.id, { unit }) }}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="deg">degrees</option><option value="rad">radians</option></select></label>
    </div>
    <label className="parameter-expression"><span>Expression <em>optional</em></span><input value={draft.expression} placeholder="e.g. Width / 2" onChange={(event) => setDraft({ ...draft, expression: event.target.value })} onBlur={commit} /></label>
    {!literal&&<p className="parameter-usage">This value is driven by the expression below.</p>}
    {resolved && <footer><CheckCircle2 size={12} /><span>Resolved</span><strong>{Number(resolved.value.toFixed(4))} {resolved.unit}</strong></footer>}
    {usage.error?<p role="status">{usage.error}</p>:usage.items.length?<details className="parameter-usage"><summary>Used by {usage.items.length} item{usage.items.length===1?'':'s'}</summary><ul>{usage.items.map((use,i)=><li key={i}>{use.nodeId?<button onClick={()=>{useEditor.getState().selectNode(use.nodeId!);window.dispatchEvent(new CustomEvent('formforge:frame',{detail:{selectedOnly:true}}))}}>{use.label}</button>:use.label}</li>)}</ul><p>Renaming updates these links. Remove references before deleting.</p></details>:<p className="parameter-usage">No references yet</p>}
  </article>
}

export function ParameterPanel() {
  const definitions = useEditor((state) => state.document.namedParameters)
  const add = useEditor((state) => state.addNamedParameter)
  const parameterErrors = useEditor((state) => state.parameterErrors)
  const evaluation = useMemo(() => {
    try { return { result: evaluateNamedParameters(definitions), error: null } }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'The parameter graph is invalid.' } }
  }, [definitions])

  return <div className="parameter-panel">
    <div className="parameter-intro">
      <Braces size={22} />
      <div><strong>Reusable dimensions</strong><span>Change one value and every bound shape updates together. Names are case-insensitive.</span></div>
    </div>
    {(evaluation.error || parameterErrors.parameters) && <div className="parameter-error"><AlertTriangle size={14} /><span>{evaluation.error ?? parameterErrors.parameters}</span></div>}
    <div className="parameter-list">
      {definitions.map((parameter) => {
        const resolved = evaluation.result?.get(parameter.name)
        return <ParameterRow key={parameter.id} parameter={parameter} resolved={resolved ? { value: resolved.value, unit: resolved.unit } : undefined} />
      })}
    </div>
    {!definitions.length && <div className="empty-parameters"><strong>No parameters yet</strong><span>Create named sizes such as Wall, Width, or Handle angle, then bind them to shape dimensions.</span></div>}
    <button className="add-parameter" onClick={add}><Plus size={14} /> Add named parameter</button>
    <ParameterVariants />
    <aside className="parameter-help"><strong>Expression examples</strong><code>Width / 2</code><code>[Wall Thickness] * 3</code><span>Use square brackets when a name contains spaces. Length and angle parameters cannot be mixed.</span></aside>
  </div>
}

function BindingRow({ node, target, expression }: { node: ModelNode; target: ParameterBindingTarget; expression: string }) {
  const setBinding = useEditor((state) => state.setNodeParameterBinding)
  const error = useEditor((state) => state.parameterErrors[`${node.id}:${target}`])
  const [draft, setDraft] = useState(expression)
  useEffect(() => setDraft(expression), [expression])
  const info = getParameterTargetInfo(target)
  return <div className={`binding-row ${error ? 'invalid' : ''}`}>
    <span>{info.label}</span>
    <div><input list="named-parameter-suggestions" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => setBinding(node.id, target, draft)} /><em>{info.unit}</em></div>
    <button title={`Remove ${info.label} binding`} onClick={() => setBinding(node.id, target, '')}><Trash2 size={12} /></button>
    {error && <small>{error}</small>}
  </div>
}

export function NodeParameterBindings({ node }: { node: ModelNode }) {
  const definitions = useEditor((state) => state.document.namedParameters)
  const setBinding = useEditor((state) => state.setNodeParameterBinding)
  const bindings = Object.entries(node.parameterBindings ?? {}) as Array<[ParameterBindingTarget, string]>
  const available = parameterTargets.filter(({ target }) => !node.parameterBindings?.[target])
  const [nextTarget, setNextTarget] = useState<ParameterBindingTarget>(available[0]?.target ?? 'width')
  useEffect(() => {
    if (!available.some(({ target }) => target === nextTarget) && available[0]) setNextTarget(available[0].target)
  }, [available, nextTarget])

  return <div className="property-group pro-property parameter-bindings">
    <h3><Link2 size={13} /> Dimension bindings</h3>
    <p>Drive exact shape dimensions from reusable parameters or formulas.</p>
    <datalist id="named-parameter-suggestions">{definitions.map((definition) => <option key={definition.id} value={parameterReference(definition.name)}>{definition.name}</option>)}</datalist>
    {bindings.map(([target, expression]) => <BindingRow key={target} node={node} target={target} expression={expression} />)}
    {available.length > 0 && <div className="binding-add">
      <select value={nextTarget} onChange={(event) => setNextTarget(event.target.value as ParameterBindingTarget)}>{available.map(({ target, label }) => <option key={target} value={target}>{label}</option>)}</select>
      <button onClick={() => setBinding(node.id, nextTarget, definitions[0] ? parameterReference(definitions[0].name) : '10')}><Plus size={12} /> Bind</button>
    </div>}
    {!definitions.length && <small>Create reusable dimensions in the Parameters tab, or bind a literal formula now.</small>}
  </div>
}
