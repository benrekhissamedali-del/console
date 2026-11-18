import { lazy, Suspense, useEffect, useState } from 'react';
import { CopyPlus, Plus, Trash2, Usb, X } from 'lucide-react';
import { TopBar, WorkspaceView } from './components/TopBar';
import { ControllerSchematic } from './components/ControllerSchematic';
import { MappingInspector } from './components/MappingInspector';
import { OutputSandbox } from './components/OutputSandbox';
import { DEFAULT_PROFILES, PS_BUTTON_CATALOG } from './data/presets';
import {
  ButtonMapping,
  ControllerModel,
  ControllerProfile,
  PSButtonId,
} from './types/controller';
import { useGamepadBridge } from './hooks/useGamepadBridge';
import { isWebHIDSupported } from './utils/gamepadHardware';

const STORAGE_KEY_PROFILES = 'dualbridge_profiles_v1';
const STORAGE_KEY_ACTIVE_ID = 'dualbridge_active_profile_v1';

const CalibrationWorkspace = lazy(() =>
  import('./components/CalibrationWorkspace').then((module) => ({
    default: module.CalibrationWorkspace,
  }))
);
const MacrosWorkspace = lazy(() =>
  import('./components/MacrosWorkspace').then((module) => ({
    default: module.MacrosWorkspace,
  }))
);
const BindingsTable = lazy(() =>
  import('./components/BindingsTable').then((module) => ({
    default: module.BindingsTable,
  }))
);
const ExportWorkspace = lazy(() =>
  import('./components/ExportWorkspace').then((module) => ({
    default: module.ExportWorkspace,
  }))
);

function loadInitialProfiles(): ControllerProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      const parsed = JSON.parse(raw) as ControllerProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p) => {
          const fallback = DEFAULT_PROFILES.find((d) => d.id === p.id);
          return {
            ...p,
            macros: Array.isArray(p.macros)
              ? p.macros
              : fallback?.macros || [],
          };
        });
      }
    }
  } catch {
    // Fallback to defaults
  }
  return DEFAULT_PROFILES;
}

export default function App() {
  const [profiles, setProfiles] = useState<ControllerProfile[]>(loadInitialProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    return saved || DEFAULT_PROFILES[0].id;
  });

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) || profiles[0];

  const [activeView, setActiveView] = useState<WorkspaceView>('mapper');
  const [selectedButton, setSelectedButton] = useState<PSButtonId>('cross');
  const [listenControllerMode, setListenControllerMode] = useState<boolean>(true);
  const [connectDrawerOpen, setConnectDrawerOpen] = useState<boolean>(false);
  const [hidMessage, setHidMessage] = useState<string>('');
  const [creatingProfile, setCreatingProfile] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');

  const {
    hardware,
    liveInput,
    eventLog,
    clearEventLog,
    pressVirtualButton,
    setVirtualStick,
    setVirtualTrigger,
    connectWebHID,
    syncLightbarColor,
    testRumble,
  } = useGamepadBridge(activeProfile, (pressedBtnId) => {
    if (listenControllerMode) {
      setSelectedButton(pressedBtnId);
    }
  });

  // Persist profiles cleanly
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeProfile.id);
    } catch {
      // Ignore storage quota errors
    }
  }, [profiles, activeProfile.id]);

  // Auto-align controller model when physical Sony controller connects
  useEffect(() => {
    if (hardware.connected && activeProfile.targetModel !== hardware.detectedModel) {
      updateActiveProfile({
        ...activeProfile,
        targetModel: hardware.detectedModel,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardware.connected, hardware.detectedModel]);

  function updateActiveProfile(next: ControllerProfile) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === activeProfile.id ? next : p))
    );
  }

  const handleUpdateMapping = (updatedMapping: ButtonMapping) => {
    updateActiveProfile({
      ...activeProfile,
      mappings: {
        ...activeProfile.mappings,
        [updatedMapping.buttonId]: updatedMapping,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleResetButton = (buttonId: PSButtonId) => {
    const meta = PS_BUTTON_CATALOG.find((b) => b.id === buttonId);
    if (!meta) return;
    handleUpdateMapping({
      buttonId,
      outputType: 'xinput',
      primaryValue: meta.defaultXInput,
      modifiers: [],
      behavior: 'press',
      turboRateMs: 80,
      label: `Xbox ${meta.defaultXInput}`,
    });
  };

  const handleModelSwitch = (model: ControllerModel) => {
    updateActiveProfile({
      ...activeProfile,
      targetModel: model,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCreateProfile = () => {
    const trimmed = newProfileName.trim();
    if (!trimmed) return;
    const cloned: ControllerProfile = {
      ...JSON.parse(JSON.stringify(activeProfile)),
      id: `custom-${Date.now()}`,
      name: trimmed,
      description: 'Custom user controller mapping profile.',
      updatedAt: new Date().toISOString(),
    };
    setProfiles((prev) => [...prev, cloned]);
    setActiveProfileId(cloned.id);
    setNewProfileName('');
    setCreatingProfile(false);
  };

  const handleDuplicateProfile = () => {
    const copy: ControllerProfile = {
      ...JSON.parse(JSON.stringify(activeProfile)),
      id: `copy-${Date.now()}`,
      name: `${activeProfile.name} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    setProfiles((prev) => [...prev, copy]);
    setActiveProfileId(copy.id);
  };

  const handleDeleteProfile = () => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter((p) => p.id !== activeProfile.id);
    setProfiles(remaining);
    setActiveProfileId(remaining[0].id);
  };

  const handleImportProfile = (imported: ControllerProfile) => {
    setProfiles((prev) => [...prev, imported]);
    setActiveProfileId(imported.id);
  };

  const handleLinkWebHID = async () => {
    const res = await connectWebHID();
    setHidMessage(res.message);
  };

  return (
    <div className="min-h-screen bg-[#0A0D12] text-slate-100 flex flex-col">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        hardwareConnected={hardware.connected}
        hidConnected={hardware.hidConnected}
        onPrimaryAction={() => setConnectDrawerOpen(true)}
      />

      {/* Workspace Control & Hardware Status Strip */}
      <div className="border-b border-[#1D2533] bg-[#0D1118]">
        <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 py-3.5">
          {/* Left: Clean unboxed hardware telemetry */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            {hardware.connected ? (
              <span className="font-medium text-emerald-400">
                ● Connected: {hardware.displayName}
              </span>
            ) : (
              <span className="font-medium text-slate-300">
                ○ Interactive Bench Mode
              </span>
            )}
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono text-slate-400 tabular-nums">
              {hardware.connected
                ? `VID ${hardware.vendorId} / PID ${hardware.productId} · ${hardware.connectionHint}`
                : 'Plug in PS4 / PS5 via USB-C or Bluetooth & press any button'}
            </span>
            {hardware.connected && hardware.pollingHz > 0 && (
              <>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {hardware.pollingHz} Hz ({hardware.pollingIntervalMs} ms)
                </span>
              </>
            )}
            {hardware.hidConnected && (
              <>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono text-[#60A5FA]">
                  Direct HID Active
                </span>
              </>
            )}
          </div>

          {/* Right: Hardware Model Switch + Profile Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* PS5 / PS4 Model Segmented Toggle */}
            <div className="flex items-center rounded-lg border border-[#232C3B] bg-[#0A0D12] p-0.5">
              <button
                type="button"
                onClick={() => handleModelSwitch('ps5-dualsense')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  activeProfile.targetModel === 'ps5-dualsense'
                    ? 'bg-[#1D283A] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                PS5 DualSense
              </button>
              <button
                type="button"
                onClick={() => handleModelSwitch('ps4-dualshock')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  activeProfile.targetModel === 'ps4-dualshock'
                    ? 'bg-[#1D283A] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                PS4 DualShock 4
              </button>
            </div>

            {/* Active Profile Selector */}
            {creatingProfile ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProfile();
                    if (e.key === 'Escape') setCreatingProfile(false);
                  }}
                  placeholder="Profile name…"
                  autoFocus
                  className="w-44 rounded-lg border border-[#2E90FA] bg-[#0A0D12] px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateProfile}
                  className="rounded-lg bg-[#2E90FA] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#1D7CE0]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingProfile(false)}
                  className="rounded-lg border border-[#232C3B] px-2 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Active Mapping Profile"
                  value={activeProfile.id}
                  onChange={(e) => setActiveProfileId(e.target.value)}
                  className="max-w-[230px] rounded-lg border border-[#232C3B] bg-[#0A0D12] px-3 py-1.5 text-xs font-medium text-white focus:border-[#2E90FA] focus:outline-none"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setCreatingProfile(true)}
                  title="Create New Profile"
                  className="rounded-lg border border-[#232C3B] bg-[#141A26] p-1.5 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDuplicateProfile}
                  title="Duplicate Active Profile"
                  className="rounded-lg border border-[#232C3B] bg-[#141A26] p-1.5 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProfile}
                  disabled={profiles.length <= 1}
                  title="Delete Active Profile"
                  className="rounded-lg border border-[#232C3B] bg-[#141A26] p-1.5 text-slate-300 transition-colors hover:border-rose-500/60 hover:text-rose-400 disabled:opacity-35"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Stage */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6">
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm text-slate-400" role="status">
              Loading workspace…
            </div>
          }
        >
          {activeView === 'mapper' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 space-y-6">
                <ControllerSchematic
                  model={activeProfile.targetModel}
                  lightbarColor={activeProfile.lightbarColor}
                  selectedButton={selectedButton}
                  onSelectButton={setSelectedButton}
                  mappings={activeProfile.mappings}
                  liveInput={liveInput}
                  onVirtualButton={pressVirtualButton}
                  onVirtualStick={setVirtualStick}
                  onVirtualTrigger={setVirtualTrigger}
                />

                <OutputSandbox events={eventLog} onClear={clearEventLog} />
              </div>

              <div className="lg:col-span-4">
                <MappingInspector
                  model={activeProfile.targetModel}
                  selectedButton={selectedButton}
                  mapping={activeProfile.mappings[selectedButton]}
                  macros={activeProfile.macros || []}
                  listenControllerMode={listenControllerMode}
                  onToggleListenController={() =>
                    setListenControllerMode((v) => !v)
                  }
                  onUpdateMapping={handleUpdateMapping}
                  onResetButton={handleResetButton}
                  onOpenMacrosTab={() => setActiveView('macros')}
                />
              </div>
            </div>
          )}

          {activeView === 'calibration' && (
            <CalibrationWorkspace
              profile={activeProfile}
              liveInput={liveInput}
              supportsVibration={hardware.supportsVibration}
              hidConnected={hardware.hidConnected}
              onUpdateProfile={updateActiveProfile}
              onTestRumble={testRumble}
              onSyncLightbar={syncLightbarColor}
              onVirtualStick={setVirtualStick}
            />
          )}

          {activeView === 'macros' && (
            <MacrosWorkspace
              profile={activeProfile}
              liveInput={liveInput}
              onUpdateProfile={updateActiveProfile}
              onJumpToMapperButton={(btnId) => {
                setSelectedButton(btnId);
                setActiveView('mapper');
              }}
            />
          )}

          {activeView === 'bindings' && (
            <BindingsTable
              profile={activeProfile}
              liveInput={liveInput}
              selectedButton={selectedButton}
              onEditButton={(btnId) => {
                setSelectedButton(btnId);
                setActiveView('mapper');
              }}
            />
          )}

          {activeView === 'export' && (
            <ExportWorkspace
              profile={activeProfile}
              onImportProfile={handleImportProfile}
            />
          )}
        </Suspense>
      </main>

      {/* Connect Controller / Direct WebHID Modal */}
      {connectDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => setConnectDrawerOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[#283346] bg-[#111620] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#1E2736] pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  PlayStation PC Connectivity
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Web Gamepad API &amp; Sony WebHID Hardware Bridge
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConnectDrawerOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-[#1B2332] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <div className="rounded-lg border border-[#1E2736] bg-[#0A0D12] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Standard Gamepad Stream</span>
                  <span
                    className={
                      hardware.connected
                        ? 'font-semibold text-emerald-400'
                        : 'text-slate-400'
                    }
                  >
                    {hardware.connected ? '● Active' : 'Waiting for input'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">
                  {hardware.connected
                    ? `Detected ${hardware.displayName} (VID ${hardware.vendorId} / PID ${hardware.productId}). All buttons and analog axes are streaming live.`
                    : 'Connect your PS5 DualSense or PS4 DualShock 4 via USB-C cable or Bluetooth, then press any button (e.g. Cross or Options) to activate browser telemetry.'}
                </p>
              </div>

              <div className="rounded-lg border border-[#1E2736] bg-[#0A0D12] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Direct Sony WebHID Interface</span>
                  <span
                    className={
                      hardware.hidConnected
                        ? 'font-semibold text-[#60A5FA]'
                        : 'text-slate-400'
                    }
                  >
                    {hardware.hidConnected
                      ? `Linked (${hardware.hidProductName})`
                      : isWebHIDSupported()
                        ? 'Available'
                        : 'Unsupported in this browser'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">
                  Linking Direct WebHID unlocks hardware lightbar RGB control, player LEDs, and raw Sony packet inspection in Chrome or Edge.
                </p>

                {hardware.lastHidReportHex && (
                  <p className="font-mono text-[11px] text-slate-400">
                    Raw HID Packet: {hardware.lastHidReportHex}
                  </p>
                )}

                <button
                  type="button"
                  disabled={!isWebHIDSupported()}
                  onClick={handleLinkWebHID}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2E90FA] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1D7CE0] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Usb className="h-4 w-4" />
                  {hardware.hidConnected
                    ? 'Reconnect Sony WebHID Device'
                    : 'Authorize Sony DualSense / DualShock 4 via WebHID'}
                </button>

                {hidMessage && (
                  <p className="text-xs text-slate-300">{hidMessage}</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-[#1E2736] pt-4">
              <button
                type="button"
                onClick={() => setConnectDrawerOpen(false)}
                className="rounded-lg border border-[#263144] bg-[#161D29] px-4 py-2 text-xs font-medium text-white hover:border-slate-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
