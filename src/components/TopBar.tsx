export type WorkspaceView = 'mapper' | 'calibration' | 'macros' | 'bindings' | 'export';

interface TopBarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  hardwareConnected: boolean;
  hidConnected: boolean;
  onPrimaryAction: () => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'mapper', label: 'Mapper' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'macros', label: 'Macros' },
  { id: 'bindings', label: 'Bindings' },
  { id: 'export', label: 'Export' },
];

export function TopBar({
  activeView,
  onSelectView,
  hardwareConnected,
  hidConnected,
  onPrimaryAction,
}: TopBarProps) {
  const ctaLabel = hidConnected
    ? 'HID Linked'
    : hardwareConnected
      ? 'Link Direct HID'
      : 'Connect Controller';

  return (
    <header className="sticky top-0 z-30 border-b border-[#232C3B] bg-[#0A0D12]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        <a
          href="#mapper"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('mapper');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          DualBridge
        </a>

        <nav className="flex items-center gap-6 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E90FA] rounded-sm ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-[#2E90FA]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="rounded-lg bg-[#2E90FA] px-4 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1D7CE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E90FA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0D12] whitespace-nowrap shrink-0"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
