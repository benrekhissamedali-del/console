import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Circle,
  CopyPlus,
  Link2,
  Play,
  Plus,
  Square,
  Trash2,
  Unlink,
} from 'lucide-react';
import {
  ControllerMacro,
  ControllerProfile,
  LiveInputState,
  MacroStep,
  MacroStepAction,
  MacroStepKind,
  PSButtonId,
} from '../types/controller';
import {
  MOUSE_ACTIONS,
  PS_BUTTON_CATALOG,
  QUICK_KEYBOARD_KEYS,
} from '../data/presets';

interface MacrosWorkspaceProps {
  profile: ControllerProfile;
  liveInput: LiveInputState;
  onUpdateProfile: (next: ControllerProfile) => void;
  onJumpToMapperButton: (buttonId: PSButtonId) => void;
}

function normalizeKeyLabel(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Esc';
  if (key === 'Control') return 'Ctrl';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function computeTotalMs(steps: MacroStep[]): number {
  return steps.reduce((sum, s) => sum + (Number(s.delayMs) || 0), 0);
}

export function MacrosWorkspace({
  profile,
  liveInput,
  onUpdateProfile,
  onJumpToMapperButton,
}: MacrosWorkspaceProps) {
  const macros = useMemo(() => profile.macros || [], [profile.macros]);
  const [selectedMacroId, setSelectedMacroId] = useState<string>(
    macros[0]?.id || ''
  );
  const [recording, setRecording] = useState(false);
  const [captureHoldRelease, setCaptureHoldRelease] = useState(false);
  const [playingStepIndex, setPlayingStepIndex] = useState<number | null>(null);
  const [bindTargetButton, setBindTargetButton] = useState<PSButtonId>('square');

  const lastEventTimeRef = useRef<number>(0);
  const prevControllerPressedRef = useRef<Record<string, boolean>>({});
  const playbackTimersRef = useRef<number[]>([]);

  const stopPlayback = useCallback(() => {
    playbackTimersRef.current.forEach((t) => window.clearTimeout(t));
    playbackTimersRef.current = [];
    setPlayingStepIndex(null);
  }, []);

  // Reset recording and playback only when switching profiles
  useEffect(() => {
    setRecording(false);
    stopPlayback();
  }, [profile.id, stopPlayback]);

  // Keep selectedMacroId valid when macros list changes
  useEffect(() => {
    if (macros.length > 0 && !macros.some((m) => m.id === selectedMacroId)) {
      setSelectedMacroId(macros[0].id);
    } else if (macros.length === 0 && selectedMacroId !== '') {
      setSelectedMacroId('');
    }
  }, [macros, selectedMacroId]);

  const activeMacro = useMemo(
    () => macros.find((m) => m.id === selectedMacroId) || macros[0] || null,
    [macros, selectedMacroId]
  );

  const boundButtonsForActive = useMemo(() => {
    if (!activeMacro) return [];
    return PS_BUTTON_CATALOG.filter((meta) => {
      const map = profile.mappings[meta.id];
      return map.outputType === 'macro' && map.macroId === activeMacro.id;
    });
  }, [activeMacro, profile.mappings]);

  useEffect(() => {
    return () => {
      playbackTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const updateMacro = useCallback(
    (updated: ControllerMacro) => {
      const nextMacros = macros.map((m) =>
        m.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : m
      );
      // Sync primaryValue on any button bound to this macro if renamed
      const nextMappings = { ...profile.mappings };
      for (const meta of PS_BUTTON_CATALOG) {
        const cur = nextMappings[meta.id];
        if (cur.outputType === 'macro' && cur.macroId === updated.id) {
          nextMappings[meta.id] = {
            ...cur,
            primaryValue: updated.name,
          };
        }
      }
      onUpdateProfile({
        ...profile,
        macros: nextMacros,
        mappings: nextMappings,
        updatedAt: new Date().toISOString(),
      });
    },
    [macros, onUpdateProfile, profile]
  );

  const appendRecordedStep = useCallback(
    (kind: MacroStepKind, target: string, action: MacroStepAction) => {
      if (!activeMacro) return;
      const now = performance.now();
      const delta =
        activeMacro.steps.length === 0 || lastEventTimeRef.current === 0
          ? 0
          : Math.min(5000, Math.max(10, Math.round(now - lastEventTimeRef.current)));
      lastEventTimeRef.current = now;

      const step: MacroStep = {
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind,
        target,
        action,
        delayMs: delta,
      };

      updateMacro({
        ...activeMacro,
        steps: [...activeMacro.steps, step],
      });
    },
    [activeMacro, updateMacro]
  );

  // Record physical keyboard events while recording is active
  useEffect(() => {
    if (!recording || !activeMacro) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Avoid hijacking escape if user isn't intentionally recording? Allow Esc or Stop button
      e.preventDefault();
      e.stopPropagation();
      const label = normalizeKeyLabel(e.key);
      appendRecordedStep('keyboard', label, captureHoldRelease ? 'down' : 'tap');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!captureHoldRelease) return;
      e.preventDefault();
      e.stopPropagation();
      const label = normalizeKeyLabel(e.key);
      appendRecordedStep('keyboard', label, 'up');
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [activeMacro, appendRecordedStep, captureHoldRelease, recording]);

  // Record physical controller button presses while recording is active
  useEffect(() => {
    if (!recording || !activeMacro) {
      prevControllerPressedRef.current = { ...liveInput.buttonsPressed };
      return;
    }

    for (const meta of PS_BUTTON_CATALOG) {
      const isNow = Boolean(liveInput.buttonsPressed[meta.id]);
      const wasBefore = Boolean(prevControllerPressedRef.current[meta.id]);

      if (isNow && !wasBefore) {
        const label =
          profile.targetModel === 'ps5-dualsense' ? meta.ps5Name : meta.ps4Name;
        appendRecordedStep(
          'controller',
          label,
          captureHoldRelease ? 'down' : 'tap'
        );
      } else if (!isNow && wasBefore && captureHoldRelease) {
        const label =
          profile.targetModel === 'ps5-dualsense' ? meta.ps5Name : meta.ps4Name;
        appendRecordedStep('controller', label, 'up');
      }
    }
    prevControllerPressedRef.current = { ...liveInput.buttonsPressed };
  }, [
    activeMacro,
    appendRecordedStep,
    captureHoldRelease,
    liveInput.buttonsPressed,
    profile.targetModel,
    recording,
  ]);

  const handleToggleRecording = () => {
    if (!activeMacro) return;
    if (!recording) {
      stopPlayback();
      lastEventTimeRef.current = 0;
      prevControllerPressedRef.current = { ...liveInput.buttonsPressed };
      setRecording(true);
    } else {
      setRecording(false);
    }
  };

  const handleCreateMacro = () => {
    const idx = macros.length + 1;
    const created: ControllerMacro = {
      id: `macro-${Date.now()}`,
      name: `Custom Macro ${idx}`,
      repeatMode: 'once',
      steps: [],
      updatedAt: new Date().toISOString(),
    };
    onUpdateProfile({
      ...profile,
      macros: [...macros, created],
      updatedAt: new Date().toISOString(),
    });
    setSelectedMacroId(created.id);
    setRecording(false);
  };

  const handleDuplicateMacro = () => {
    if (!activeMacro) return;
    const copy: ControllerMacro = {
      ...JSON.parse(JSON.stringify(activeMacro)),
      id: `macro-${Date.now()}`,
      name: `${activeMacro.name} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    onUpdateProfile({
      ...profile,
      macros: [...macros, copy],
      updatedAt: new Date().toISOString(),
    });
    setSelectedMacroId(copy.id);
  };

  const handleDeleteMacro = (macroId: string) => {
    const nextMacros = macros.filter((m) => m.id !== macroId);
    const nextMappings = { ...profile.mappings };
    for (const meta of PS_BUTTON_CATALOG) {
      if (nextMappings[meta.id].macroId === macroId) {
        nextMappings[meta.id] = {
          ...nextMappings[meta.id],
          outputType: 'unbound',
          primaryValue: '',
          macroId: undefined,
        };
      }
    }
    onUpdateProfile({
      ...profile,
      macros: nextMacros,
      mappings: nextMappings,
      updatedAt: new Date().toISOString(),
    });
    if (selectedMacroId === macroId) {
      setSelectedMacroId(nextMacros[0]?.id || '');
    }
  };

  const handleSimulatePlayback = () => {
    if (!activeMacro || activeMacro.steps.length === 0) return;
    if (playingStepIndex !== null) {
      stopPlayback();
      return;
    }
    setRecording(false);

    let elapsed = 0;
    const timers: number[] = [];

    activeMacro.steps.forEach((step, idx) => {
      elapsed += Math.max(0, step.delayMs);
      const t = window.setTimeout(() => {
        setPlayingStepIndex(idx);
      }, elapsed);
      timers.push(t);
    });

    const endTimer = window.setTimeout(() => {
      setPlayingStepIndex(null);
      playbackTimersRef.current = [];
    }, elapsed + 260);
    timers.push(endTimer);

    playbackTimersRef.current = timers;
  };

  const handleAddManualStep = (kind: MacroStepKind) => {
    if (!activeMacro) return;
    const defaultTarget =
      kind === 'keyboard'
        ? 'Space'
        : kind === 'mouse'
          ? 'Left Click'
          : kind === 'controller'
            ? 'Cross (✕)'
            : 'Pause';
    const step: MacroStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      target: defaultTarget,
      action: kind === 'delay' ? 'wait' : 'tap',
      delayMs: activeMacro.steps.length === 0 ? 0 : 80,
    };
    updateMacro({
      ...activeMacro,
      steps: [...activeMacro.steps, step],
    });
  };

  const handleUpdateStep = (stepId: string, patch: Partial<MacroStep>) => {
    if (!activeMacro) return;
    updateMacro({
      ...activeMacro,
      steps: activeMacro.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    });
  };

  const handleMoveStep = (index: number, direction: -1 | 1) => {
    if (!activeMacro) return;
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= activeMacro.steps.length) return;
    const copy = [...activeMacro.steps];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, item);
    updateMacro({ ...activeMacro, steps: copy });
  };

  const handleRemoveStep = (stepId: string) => {
    if (!activeMacro) return;
    updateMacro({
      ...activeMacro,
      steps: activeMacro.steps.filter((s) => s.id !== stepId),
    });
  };

  const handleBindToControllerButton = () => {
    if (!activeMacro) return;
    const prev = profile.mappings[bindTargetButton];
    onUpdateProfile({
      ...profile,
      mappings: {
        ...profile.mappings,
        [bindTargetButton]: {
          ...prev,
          outputType: 'macro',
          macroId: activeMacro.id,
          primaryValue: activeMacro.name,
          modifiers: [],
          behavior:
            activeMacro.repeatMode === 'while-held'
              ? 'hold'
              : activeMacro.repeatMode === 'toggle'
                ? 'toggle'
                : 'press',
          label: prev.label || activeMacro.name,
        },
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUnbindButton = (buttonId: PSButtonId) => {
    const prev = profile.mappings[buttonId];
    onUpdateProfile({
      ...profile,
      mappings: {
        ...profile.mappings,
        [buttonId]: {
          ...prev,
          outputType: 'unbound',
          primaryValue: '',
          macroId: undefined,
        },
      },
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Sidebar: Saved Macros List */}
      <aside className="lg:col-span-4 rounded-xl border border-[#232C3B] bg-[#111620] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-[#1E2736] pb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Recorded Macros
            </h2>
            <p className="text-xs text-slate-400">
              {macros.length} saved in {profile.name}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateMacro}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2E90FA] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1D7CE0] whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            New Macro
          </button>
        </div>

        {macros.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs text-slate-400">
              No macros created in this profile yet. Record a multi-step combo or key sequence and bind it to any PS4/PS5 button.
            </p>
            <button
              type="button"
              onClick={handleCreateMacro}
              className="rounded-lg border border-[#263144] bg-[#161D29] px-3.5 py-2 text-xs font-medium text-white hover:border-[#2E90FA]"
            >
              Create First Macro
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#1A2230]">
            {macros.map((m) => {
              const isSelected = activeMacro?.id === m.id;
              const boundCount = PS_BUTTON_CATALOG.filter(
                (b) =>
                  profile.mappings[b.id].outputType === 'macro' &&
                  profile.mappings[b.id].macroId === m.id
              ).length;
              const totalMs = computeTotalMs(m.steps);

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setRecording(false);
                    stopPlayback();
                    setSelectedMacroId(m.id);
                  }}
                  className={`w-full text-left px-3 py-3 transition-colors rounded-lg ${
                    isSelected
                      ? 'bg-[#172133]'
                      : 'hover:bg-[#161D29]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium truncate ${
                        isSelected ? 'text-white' : 'text-slate-200'
                      }`}
                    >
                      {m.name}
                    </span>
                    <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                      {totalMs} ms
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                    <span>{m.steps.length} steps</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {boundCount > 0
                        ? `Bound to ${boundCount} button${boundCount > 1 ? 's' : ''}`
                        : 'Unassigned'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* Main Editor Stage */}
      <section className="lg:col-span-8 space-y-6">
        {!activeMacro ? (
          <div className="rounded-xl border border-[#232C3B] bg-[#111620] p-10 text-center space-y-3">
            <h3 className="font-display text-lg font-semibold text-white">
              Select or Create a Macro
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Record keyboard keys, mouse clicks, and PS4/PS5 button presses with exact millisecond timings, then bind the sequence to a single controller trigger or face button.
            </p>
            <button
              type="button"
              onClick={handleCreateMacro}
              className="rounded-lg bg-[#2E90FA] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D7CE0]"
            >
              Create New Macro
            </button>
          </div>
        ) : (
          <>
            {/* Top Controls & Live Recorder */}
            <div className="rounded-xl border border-[#232C3B] bg-[#111620] p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2736] pb-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-slate-400 mb-1">
                    Macro Sequence Name
                  </label>
                  <input
                    type="text"
                    value={activeMacro.name}
                    onChange={(e) =>
                      updateMacro({ ...activeMacro, name: e.target.value })
                    }
                    className="w-full max-w-sm rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-2 font-display text-base font-semibold text-white focus:border-[#2E90FA] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDuplicateMacro}
                    title="Duplicate Macro"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#263144] bg-[#161D29] px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white"
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMacro(activeMacro.id)}
                    title="Delete Macro"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#263144] bg-[#161D29] px-3 py-2 text-xs font-medium text-slate-300 hover:border-rose-500/60 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Recorder Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleToggleRecording}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      recording
                        ? 'bg-rose-600 text-white hover:bg-rose-500'
                        : 'bg-[#2E90FA] text-white hover:bg-[#1D7CE0]'
                    }`}
                  >
                    {recording ? (
                      <>
                        <Square className="h-3.5 w-3.5 fill-current" />
                        Stop Recording
                      </>
                    ) : (
                      <>
                        <Circle className="h-3.5 w-3.5 fill-current" />
                        Record Sequence
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={activeMacro.steps.length === 0 || recording}
                    onClick={handleSimulatePlayback}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#263144] bg-[#161D29] px-3.5 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#2E90FA] hover:text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    {playingStepIndex !== null ? (
                      <>
                        <Square className="h-3.5 w-3.5" />
                        Stop Playback
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        Test Playback
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={activeMacro.steps.length === 0 || recording}
                    onClick={() => updateMacro({ ...activeMacro, steps: [] })}
                    className="rounded-lg border border-[#263144] bg-[#161D29] px-3 py-2.5 text-xs font-medium text-slate-400 transition-colors hover:text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    Clear Steps
                  </button>
                </div>

                {/* Repeat Mode + Hold/Release Option */}
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={captureHoldRelease}
                      onChange={(e) => setCaptureHoldRelease(e.target.checked)}
                      className="h-4 w-4 rounded border-[#2E3A4E] bg-[#0A0D12] accent-[#2E90FA]"
                    />
                    Record Down / Up separately
                  </label>

                  <div className="flex items-center rounded-lg border border-[#232C3B] bg-[#0A0D12] p-0.5">
                    {(
                      [
                        { id: 'once', label: 'Once' },
                        { id: 'while-held', label: 'While Held' },
                        { id: 'toggle', label: 'Toggle' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() =>
                          updateMacro({ ...activeMacro, repeatMode: mode.id })
                        }
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          activeMacro.repeatMode === mode.id
                            ? 'bg-[#1D283A] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Recording Capture Surface */}
              {recording && (
                <div className="rounded-lg border border-rose-500/40 bg-[#0A0D12] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-rose-400">
                      ● Recording Active — Press PC keyboard keys or connected PS4/PS5 buttons
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {activeMacro.steps.length} steps · {computeTotalMs(activeMacro.steps)} ms
                    </span>
                  </div>

                  {/* Mouse & On-Screen Controller Input Capture Pad */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-500 mr-1">
                      Capture Mouse / Controller:
                    </span>
                    {(['Left Click', 'Right Click', 'Middle Click'] as const).map(
                      (mouseBtn) => (
                        <button
                          key={mouseBtn}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            appendRecordedStep(
                              'mouse',
                              mouseBtn,
                              captureHoldRelease ? 'down' : 'tap'
                            );
                          }}
                          onMouseUp={(e) => {
                            if (!captureHoldRelease) return;
                            e.preventDefault();
                            appendRecordedStep('mouse', mouseBtn, 'up');
                          }}
                          className="rounded-md border border-[#263144] bg-[#141B27] px-2.5 py-1 font-mono text-xs text-slate-200 hover:border-[#2E90FA]"
                        >
                          {mouseBtn}
                        </button>
                      )
                    )}
                    {(['cross', 'circle', 'square', 'triangle', 'l1', 'r1'] as PSButtonId[]).map(
                      (btnId) => {
                        const meta = PS_BUTTON_CATALOG.find((b) => b.id === btnId)!;
                        const label =
                          profile.targetModel === 'ps5-dualsense'
                            ? meta.ps5Name
                            : meta.ps4Name;
                        return (
                          <button
                            key={btnId}
                            type="button"
                            onClick={() =>
                              appendRecordedStep('controller', label, 'tap')
                            }
                            className="rounded-md border border-[#263144] bg-[#141B27] px-2 py-1 font-mono text-xs text-slate-300 hover:border-[#2E90FA]"
                          >
                            {meta.shortGlyph}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {/* Step Sequencer Timeline */}
              <div className="border-t border-[#1E2736] pt-4">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Timeline Sequence ({activeMacro.steps.length} steps ·{' '}
                    <span className="font-mono text-slate-200 tabular-nums">
                      {computeTotalMs(activeMacro.steps)} ms
                    </span>{' '}
                    total)
                  </span>
                  <span>Delays are wait intervals before each step fires</span>
                </div>

                {activeMacro.steps.length === 0 ? (
                  <div className="rounded-lg border border-[#1E2736] bg-[#0A0D12] py-8 text-center text-xs text-slate-500">
                    No steps recorded yet. Click <strong className="text-slate-300">Record Sequence</strong> above or insert steps manually below.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[#1E2736] bg-[#0A0D12]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#1E2736] text-slate-400">
                          <th className="py-2 px-3 w-10">#</th>
                          <th className="py-2 px-3">Wait Before (ms)</th>
                          <th className="py-2 px-3">Input Source</th>
                          <th className="py-2 px-3">Key / Button</th>
                          <th className="py-2 px-3">Action</th>
                          <th className="py-2 px-3 text-right">Order / Edit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#18202D]">
                        {activeMacro.steps.map((step, idx) => {
                          const isPlaying = playingStepIndex === idx;
                          return (
                            <tr
                              key={step.id}
                              className={`transition-colors ${
                                isPlaying ? 'bg-[#2E90FA]/20' : 'hover:bg-[#131924]'
                              }`}
                            >
                              <td className="py-2 px-3 font-mono text-slate-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <div className="inline-flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={10000}
                                    step={5}
                                    value={step.delayMs}
                                    onChange={(e) =>
                                      handleUpdateStep(step.id, {
                                        delayMs: Math.max(
                                          0,
                                          Number(e.target.value) || 0
                                        ),
                                      })
                                    }
                                    className="w-20 rounded border border-[#263144] bg-[#111620] px-2 py-1 font-mono text-xs text-white tabular-nums focus:border-[#2E90FA] focus:outline-none"
                                  />
                                  <span className="font-mono text-slate-500">ms</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 capitalize text-slate-300">
                                {step.kind}
                              </td>
                              <td className="py-2 px-3">
                                {step.kind === 'delay' ? (
                                  <span className="font-mono text-slate-400">
                                    Wait
                                  </span>
                                ) : step.kind === 'keyboard' ? (
                                  <input
                                    type="text"
                                    value={step.target}
                                    onChange={(e) =>
                                      handleUpdateStep(step.id, {
                                        target: e.target.value,
                                      })
                                    }
                                    list="macro-keyboard-keys"
                                    className="w-28 rounded border border-[#263144] bg-[#111620] px-2 py-1 font-mono text-xs text-[#93C5FD] focus:border-[#2E90FA] focus:outline-none"
                                  />
                                ) : step.kind === 'mouse' ? (
                                  <select
                                    value={step.target}
                                    onChange={(e) =>
                                      handleUpdateStep(step.id, {
                                        target: e.target.value,
                                      })
                                    }
                                    className="rounded border border-[#263144] bg-[#111620] px-2 py-1 font-mono text-xs text-[#93C5FD] focus:border-[#2E90FA] focus:outline-none"
                                  >
                                    {MOUSE_ACTIONS.map((a) => (
                                      <option key={a} value={a}>
                                        {a}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <select
                                    value={step.target}
                                    onChange={(e) =>
                                      handleUpdateStep(step.id, {
                                        target: e.target.value,
                                      })
                                    }
                                    className="rounded border border-[#263144] bg-[#111620] px-2 py-1 font-mono text-xs text-[#93C5FD] focus:border-[#2E90FA] focus:outline-none"
                                  >
                                    {PS_BUTTON_CATALOG.map((b) => {
                                      const name =
                                        profile.targetModel === 'ps5-dualsense'
                                          ? b.ps5Name
                                          : b.ps4Name;
                                      return (
                                        <option key={b.id} value={name}>
                                          {name}
                                        </option>
                                      );
                                    })}
                                  </select>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {step.kind === 'delay' ? (
                                  <span className="text-slate-500">Delay</span>
                                ) : (
                                  <select
                                    value={step.action}
                                    onChange={(e) =>
                                      handleUpdateStep(step.id, {
                                        action: e.target.value as MacroStepAction,
                                      })
                                    }
                                    className="rounded border border-[#263144] bg-[#111620] px-2 py-1 text-xs text-slate-200 focus:border-[#2E90FA] focus:outline-none"
                                  >
                                    <option value="tap">Tap</option>
                                    <option value="down">Down</option>
                                    <option value="up">Up</option>
                                  </select>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveStep(idx, -1)}
                                    title="Move Up"
                                    className="rounded p-1 text-slate-400 hover:bg-[#1B2332] hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === activeMacro.steps.length - 1}
                                    onClick={() => handleMoveStep(idx, 1)}
                                    title="Move Down"
                                    className="rounded p-1 text-slate-400 hover:bg-[#1B2332] hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStep(step.id)}
                                    title="Remove Step"
                                    className="rounded p-1 text-slate-400 hover:bg-[#1B2332] hover:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <datalist id="macro-keyboard-keys">
                      {QUICK_KEYBOARD_KEYS.map((k) => (
                        <option key={k} value={k} />
                      ))}
                    </datalist>
                  </div>
                )}

                {/* Manual Insert Controls */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 mr-1">Insert step:</span>
                  <button
                    type="button"
                    onClick={() => handleAddManualStep('keyboard')}
                    className="rounded-md border border-[#263144] bg-[#161D29] px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-[#2E90FA] hover:text-white"
                  >
                    + Key Press
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddManualStep('mouse')}
                    className="rounded-md border border-[#263144] bg-[#161D29] px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-[#2E90FA] hover:text-white"
                  >
                    + Mouse Click
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddManualStep('controller')}
                    className="rounded-md border border-[#263144] bg-[#161D29] px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-[#2E90FA] hover:text-white"
                  >
                    + PS Button
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddManualStep('delay')}
                    className="rounded-md border border-[#263144] bg-[#161D29] px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-[#2E90FA] hover:text-white"
                  >
                    + Delay (ms)
                  </button>
                </div>
              </div>
            </div>

            {/* Bind Macro to Controller Button Panel */}
            <div className="rounded-xl border border-[#232C3B] bg-[#111620] p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-white">
                    Bind Macro to Controller Button
                  </h3>
                  <p className="text-xs text-slate-400">
                    Assign "{activeMacro.name}" to any physical PS4/PS5 input on {profile.name}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    aria-label="Target Controller Button"
                    value={bindTargetButton}
                    onChange={(e) =>
                      setBindTargetButton(e.target.value as PSButtonId)
                    }
                    className="rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-2 text-xs font-medium text-white focus:border-[#2E90FA] focus:outline-none"
                  >
                    {PS_BUTTON_CATALOG.map((b) => {
                      const label =
                        profile.targetModel === 'ps5-dualsense'
                          ? b.ps5Name
                          : b.ps4Name;
                      return (
                        <option key={b.id} value={b.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>

                  <button
                    type="button"
                    onClick={handleBindToControllerButton}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2E90FA] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D7CE0] whitespace-nowrap"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Bind to Button
                  </button>
                </div>
              </div>

              <div className="border-t border-[#1E2736] pt-3">
                {boundButtonsForActive.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    This macro is not bound to any controller button yet. Pick a button above and click Bind to Button.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-slate-400">
                      Currently bound to:
                    </span>
                    {boundButtonsForActive.map((meta) => {
                      const label =
                        profile.targetModel === 'ps5-dualsense'
                          ? meta.ps5Name
                          : meta.ps4Name;
                      return (
                        <div
                          key={meta.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-1.5 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => onJumpToMapperButton(meta.id)}
                            className="font-medium text-[#60A5FA] hover:underline"
                          >
                            {label}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnbindButton(meta.id)}
                            title="Unbind Macro"
                            className="text-slate-400 hover:text-rose-400"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
