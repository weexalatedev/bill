'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Battery,
  Car,
  Check,
  Flame,
  Play,
  Snowflake,
  Sparkles,
  Sun,
  Utensils,
  Wind,
  Zap,
} from 'lucide-react';
import { useApp } from '../store';
import type { ActionStatus, ControlMode } from '../types';
import { Badge, Card, ProgressBar, SectionHeading, StatCard } from '../components/ui';
import { gbp, pct } from '../lib/format';

const assetIcon = (asset: string) => {
  const key = asset.toLowerCase();
  if (key.includes('refriger')) return Snowflake;
  if (key.includes('hvac')) return Wind;
  if (key.includes('hot water')) return Flame;
  if (key.includes('ev')) return Car;
  if (key.includes('battery')) return Battery;
  if (key.includes('solar')) return Sun;
  if (key.includes('kitchen') || key.includes('oven')) return Utensils;
  return Zap;
};

const statusTone: Record<ActionStatus, 'slate' | 'sky' | 'emerald'> = {
  Recommended: 'slate',
  Approved: 'sky',
  Automated: 'emerald',
};

const MODES: Array<{ id: ControlMode; title: string; detail: string }> = [
  { id: 'Recommend', title: 'Recommend', detail: 'EnerOS suggests — your team applies changes.' },
  { id: 'Approve', title: 'Approve', detail: 'EnerOS proposes — you approve each action.' },
  { id: 'Automate', title: 'Automate', detail: 'EnerOS executes approved categories itself.' },
];

export default function Optimiser() {
  const { actions, controlMode, setControlMode, advanceAction, getSiteById, account } = useApp();
  const [statusFilter, setStatusFilter] = useState<'All' | ActionStatus>('All');

  const potential = actions.reduce((total, a) => total + a.monthlySaving, 0);
  const committed = actions
    .filter((a) => a.status !== 'Recommended')
    .reduce((total, a) => total + a.monthlySaving, 0);
  const automated = actions
    .filter((a) => a.status === 'Automated')
    .reduce((total, a) => total + a.monthlySaving, 0);
  const maxSaving = Math.max(...actions.map((a) => a.monthlySaving), 1);

  const visible = actions.filter((a) => statusFilter === 'All' || a.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Identified savings"
          value={`${gbp(potential)}/mo`}
          icon={<Sparkles className="h-5 w-5" />}
          tone="violet"
          sub={`${gbp(potential * 12)} annualised`}
        />
        <StatCard
          label="Committed"
          value={`${gbp(committed)}/mo`}
          icon={<Check className="h-5 w-5" />}
          tone="sky"
          sub={`${actions.filter((a) => a.status !== 'Recommended').length} actions approved or automated`}
        />
        <StatCard
          label="Automated"
          value={`${gbp(automated)}/mo`}
          icon={<Play className="h-5 w-5" />}
          tone="emerald"
          sub="running without human input"
        />
        <StatCard
          label="Your performance fee"
          value={`${account.performanceFeePct}%`}
          icon={<Zap className="h-5 w-5" />}
          tone="amber"
          sub="only on verified savings"
        />
      </div>

      <Card>
        <SectionHeading
          title="Control mode"
          subtitle="Trust is earned progressively: recommend, then approve, then automate."
          action={<Badge tone="sky">Active: {controlMode}</Badge>}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((mode) => {
            const active = controlMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setControlMode(mode.id)}
                className={
                  'rounded-xl border p-4 text-left transition-all ' +
                  (active
                    ? 'border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300')
                }
              >
                <div className="flex items-center justify-between">
                  <p className={'text-sm font-semibold ' + (active ? 'text-emerald-700' : 'text-slate-800')}>
                    {mode.title}
                  </p>
                  {active && <Check className="h-4 w-4 text-emerald-600" />}
                </div>
                <p className="mt-1 text-xs text-slate-500">{mode.detail}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionHeading
          title="Recommended actions"
          subtitle="Each action shows the schedule change, the modelled confidence and the verified saving."
          action={
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Recommended', 'Approved', 'Automated'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatusFilter(option)}
                  className={
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ' +
                    (statusFilter === option
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          }
        />
        <ul className="space-y-3">
          {visible.map((action) => {
            const Icon = assetIcon(action.asset);
            const site = getSiteById(action.siteId);
            return (
              <li key={action.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{action.title}</p>
                        <Badge tone={statusTone[action.status]}>{action.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {site?.name} · {site?.city} · {action.asset}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{gbp(action.monthlySaving)}/mo</p>
                    <p className="text-xs text-slate-400">{gbp(action.monthlySaving * 12)}/yr</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {action.fromSchedule}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {action.toSchedule}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <ProgressBar
                      value={action.confidence * 100}
                      tone={action.confidence >= 0.85 ? 'emerald' : 'amber'}
                      className="w-20"
                    />
                    <span className="text-xs text-slate-400">
                      {pct(action.confidence * 100, 0)} confidence
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-500">{action.rationale}</p>

                {action.status === 'Recommended' && (
                  <button
                    type="button"
                    onClick={() => advanceAction(action.id)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
                  >
                    <Check className="h-4 w-4" />
                    Approve action
                  </button>
                )}
                {action.status === 'Approved' && (
                  <button
                    type="button"
                    onClick={() => advanceAction(action.id)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <Play className="h-4 w-4" />
                    Let EnerOS automate this
                  </button>
                )}
                {action.status === 'Automated' && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    <Zap className="h-4 w-4" />
                    EnerOS is controlling this asset automatically.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {visible.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No actions with this status.</p>
        )}
      </Card>
    </div>
  );
}