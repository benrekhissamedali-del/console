import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  ButtonGroup,
  ControllerProfile,
  LiveInputState,
  PSButtonId,
} from '../types/controller';
import { formatMappingSummary, PS_BUTTON_CATALOG } from '../data/presets';

interface BindingsTableProps {
  profile: ControllerProfile;
  liveInput: LiveInputState;
  selectedButton: PSButtonId;
  onEditButton: (id: PSButtonId) => void;
}

const GROUP_FILTERS: Array<'All' | ButtonGroup> = [
  'All',
  'Face',
  'Shoulders & Triggers',
  'D-Pad',
  'Thumbsticks',
  'System',
];

export function BindingsTable({
  profile,
  liveInput,
  selectedButton,
  onEditButton,
}: BindingsTableProps) {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<'All' | ButtonGroup>('All');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PS_BUTTON_CATALOG.filter((meta) => {
      if (groupFilter !== 'All' && meta.group !== groupFilter) return false;
      if (!q) return true;
      const mapping = profile.mappings[meta.id];
      const summary = formatMappingSummary(mapping).toLowerCase();
      return (
        meta.ps5Name.toLowerCase().includes(q) ||
        meta.ps4Name.toLowerCase().includes(q) ||
        meta.group.toLowerCase().includes(q) ||
        summary.includes(q) ||
        mapping.label.toLowerCase().includes(q)
      );
    });
  }, [groupFilter, profile.mappings, query]);

  return (
    <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E2736] pb-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Complete Button Matrix
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {rows.length} of {PS_BUTTON_CATALOG.length} PlayStation inputs displayed · Click any row to remap
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter button, key, or action…"
            className="w-full rounded-lg border border-[#263144] bg-[#0A0D12] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-[#2E90FA] focus:outline-none"
          />
        </div>
      </div>

      {/* Group Filter Tabs */}
      <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
        {GROUP_FILTERS.map((group) => {
          const active = groupFilter === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => setGroupFilter(group)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#2E90FA] text-white'
                  : 'bg-[#0D1118] text-slate-400 hover:text-slate-200'
              }`}
            >
              {group}
            </button>
          );
        })}
      </div>

      {/* High-density Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#1E2736] text-xs font-medium text-slate-400">
              <th className="py-2.5 pr-4">PlayStation Input</th>
              <th className="py-2.5 px-4">Group</th>
              <th className="py-2.5 px-4">Mapped PC Output</th>
              <th className="py-2.5 px-4">Mode</th>
              <th className="py-2.5 px-4">Action Note</th>
              <th className="py-2.5 pl-4 text-right">Live State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A2230]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                  No matching button bindings found. Clear your search filter to see all inputs.
                </td>
              </tr>
            ) : (
              rows.map((meta) => {
                const mapping = profile.mappings[meta.id];
                const active = liveInput.buttonsPressed[meta.id];
                const val = liveInput.buttonValues[meta.id] || 0;
                const isSelected = selectedButton === meta.id;
                const displayName =
                  profile.targetModel === 'ps5-dualsense'
                    ? meta.ps5Name
                    : meta.ps4Name;

                return (
                  <tr
                    key={meta.id}
                    onClick={() => onEditButton(meta.id)}
                    className={`cursor-pointer transition-colors hover:bg-[#161E2C] ${
                      isSelected ? 'bg-[#172133]' : ''
                    }`}
                  >
                    <td className="py-3 pr-4 font-medium text-white whitespace-nowrap">
                      <span className="inline-block w-9 font-mono text-xs text-slate-400">
                        #{meta.gamepadIndex}
                      </span>
                      {displayName}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">
                      {meta.group}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-[#60A5FA] whitespace-nowrap">
                      {formatMappingSummary(mapping)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300 capitalize whitespace-nowrap">
                      {mapping.outputType === 'unbound'
                        ? 'Disabled'
                        : mapping.behavior === 'turbo'
                          ? `Turbo (${mapping.turboRateMs}ms)`
                          : mapping.behavior}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 max-w-[200px] truncate">
                      {mapping.label || '—'}
                    </td>
                    <td className="py-3 pl-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      {active ? (
                        <span className="font-semibold text-emerald-400">
                          ● Pressed {meta.isAnalogTrigger ? `(${Math.round(val * 100)}%)` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500">Idle</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
