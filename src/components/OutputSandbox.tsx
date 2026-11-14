import { TranslatedEvent } from '../types/controller';

interface OutputSandboxProps {
  events: TranslatedEvent[];
  onClear: () => void;
}

export function OutputSandbox({ events, onClear }: OutputSandboxProps) {
  return (
    <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-5">
      <div className="flex items-center justify-between gap-4 border-b border-[#1E2736] pb-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-white">
            Live Translated PC Output Stream
          </h3>
          <p className="text-xs text-slate-400">
            Press buttons on your PS4/PS5 controller or click the schematic above to verify translated PC events
          </p>
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={events.length === 0}
          className="rounded-md border border-[#263144] bg-[#161D29] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          Clear Log
        </button>
      </div>

      {events.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          Waiting for controller input — press any physical button or click a control on the schematic to test your mapping.
        </div>
      ) : (
        <div className="mt-3 max-h-44 overflow-y-auto divide-y divide-[#1A2230]">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between gap-4 py-2 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-slate-500 tabular-nums shrink-0">
                  {ev.timestamp}
                </span>
                <span className="font-medium text-slate-200 truncate">
                  {ev.sourceName}
                </span>
                {typeof ev.analogValue === 'number' && (
                  <span className="font-mono text-slate-400 tabular-nums shrink-0">
                    {Math.round(ev.analogValue * 100)}%
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono font-semibold text-[#60A5FA]">
                  → {ev.outputSummary}
                </span>
                <span className="text-slate-500 capitalize w-12 text-right">
                  {ev.behavior}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
