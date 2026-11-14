import { useEffect, useState } from 'react';
import { Keyboard, Mouse, Gamepad2, Zap, Ban, RotateCcw } from 'lucide-react';
import {
  ButtonMapping,
  ControllerMacro,
  ControllerModel,
  OutputType,
  PSButtonId,
  TriggerBehavior,
} from '../types/controller';
import {
  MODIFIER_KEYS,
  MOUSE_ACTIONS,
  PS_BUTTON_CATALOG,
  QUICK_KEYBOARD_KEYS,
  XINPUT_TARGETS,
  formatMappingSummary,
} from '../data/presets';

interface MappingInspectorProps {
  model: ControllerModel;
  selectedButton: PSButtonId;
  mapping: ButtonMapping;
  macros: ControllerMacro[];
  listenControllerMode: boolean;
  onToggleListenController: () => void;
  onUpdateMapping: (updated: ButtonMapping) => void;
  onResetButton: (buttonId: PSButtonId) => void;
  onOpenMacrosTab: () => void;
}

const OUTPUT_MODES: Array<{
  id: OutputType;
  label: string;
  icon: typeof Keyboard;
}> = [
  { id: 'keyboard', label: 'Key', icon: Keyboard },
  { id: 'mouse', label: 'Mouse', icon: Mouse },
  { id: 'xinput', label: 'Xbox', icon: Gamepad2 },
  { id: 'macro', label: 'Macro', icon: Zap },
  { id: 'unbound', label: 'Off', icon: Ban },
];

const BEHAVIORS: Array<{ id: TriggerBehavior; label: string }> = [
  { id: 'press', label: 'Press' },
  { id: 'hold', label: 'Hold' },
  { id: 'toggle', label: 'Toggle' },
  { id: 'turbo', label: 'Turbo' },
];

function normalizeKeyEvent(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Esc';
  if (key === 'Control') return 'Ctrl';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function MappingInspector({
  model,
  selectedButton,
  mapping,
  macros,
  listenControllerMode,
  onToggleListenController,
  onUpdateMapping,
  onResetButton,
  onOpenMacrosTab,
}: MappingInspectorProps) {
  const [capturingKey, setCapturingKey] = useState(false);

  const meta = PS_BUTTON_CATALOG.find((b) => b.id === selectedButton)!;
  const buttonDisplayName =
    model === 'ps5-dualsense' ? meta.ps5Name : meta.ps4Name;

  useEffect(() => {
    setCapturingKey(false);
  }, [selectedButton]);

  useEffect(() => {
    if (!capturingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const captured = normalizeKeyEvent(e.key);
      const mods: string[] = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.shiftKey) mods.push('Shift');
      if (e.altKey) mods.push('Alt');

      onUpdateMapping({
        ...mapping,
        outputType: 'keyboard',
        primaryValue: captured,
        modifiers: mods,
      });
      setCapturingKey(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [capturingKey, mapping, onUpdateMapping]);

  const handleOutputTypeChange = (nextType: OutputType) => {
    setCapturingKey(false);
    let nextValue = mapping.primaryValue;
    if (nextType === 'keyboard' && (!nextValue || MOUSE_ACTIONS.includes(nextValue))) {
      nextValue = 'Space';
    } else if (nextType === 'mouse' && !MOUSE_ACTIONS.includes(nextValue)) {
      nextValue = 'Left Click';
    } else if (nextType === 'xinput' && !XINPUT_TARGETS.includes(nextValue)) {
      nextValue = meta.defaultXInput;
    } else if (nextType === 'macro') {
      const firstMacro = macros[0];
      if (firstMacro && !mapping.macroId) {
        nextValue = firstMacro.name;
      } else {
        nextValue = mapping.outputType === 'macro' ? mapping.primaryValue : 'Ctrl + Shift + R';
      }
    } else if (nextType === 'unbound') {
      nextValue = '';
    }
    onUpdateMapping({
      ...mapping,
      outputType: nextType,
      primaryValue: nextValue,
      macroId:
        nextType === 'macro'
          ? mapping.macroId || macros[0]?.id
          : undefined,
      modifiers: nextType === 'keyboard' || nextType === 'mouse' ? mapping.modifiers : [],
    });
  };

  const toggleModifier = (mod: string) => {
    const exists = mapping.modifiers.includes(mod);
    const nextMods = exists
      ? mapping.modifiers.filter((m) => m !== mod)
      : [...mapping.modifiers, mod];
    onUpdateMapping({ ...mapping, modifiers: nextMods });
  };

  return (
    <aside className="flex flex-col rounded-xl border border-[#232C3B] bg-[#111620] p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[#1E2736] pb-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">
            {meta.group} · Gamepad #{meta.gamepadIndex}
          </p>
          <h2 className="mt-0.5 font-display text-xl font-semibold text-white truncate">
            {buttonDisplayName}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onResetButton(selectedButton)}
          title="Reset to default XInput"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#263144] bg-[#161D29] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      {/* Physical Controller Auto-Select Toggle */}
      <div className="mt-4 flex items-center justify-between gap-3 border-b border-[#1E2736] pb-4">
        <div>
          <p className="text-sm font-medium text-slate-200">Listen on Controller</p>
          <p className="text-xs text-slate-400">
            Press any PS4/PS5 button to select it here
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={listenControllerMode}
          onClick={onToggleListenController}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150 ${
            listenControllerMode
              ? 'border-[#2E90FA] bg-[#2E90FA]'
              : 'border-[#2E3A4E] bg-[#1A2230]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-150 ${
              listenControllerMode ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Current Output Preview */}
      <div className="mt-4 flex items-center justify-between border-b border-[#1E2736] pb-4">
        <span className="text-xs font-medium text-slate-400">Assigned PC Output</span>
        <span className="font-mono text-sm font-semibold text-[#60A5FA]">
          {formatMappingSummary(mapping)}
        </span>
      </div>

      {/* Output Type Segmented Bar */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Output Target Type
        </label>
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-[#0A0D12] p-1 border border-[#1E2736]">
          {OUTPUT_MODES.map((mode) => {
            const Icon = mode.icon;
            const active = mapping.outputType === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleOutputTypeChange(mode.id)}
                className={`flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors duration-150 whitespace-nowrap ${
                  active
                    ? 'bg-[#1D283A] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode-Specific Controls */}
      {mapping.outputType === 'keyboard' && (
        <div className="mt-4 space-y-4">
          <div>
            <button
              type="button"
              onClick={() => setCapturingKey((v) => !v)}
              className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                capturingKey
                  ? 'border-[#2E90FA] bg-[#2E90FA]/15 text-[#93C5FD]'
                  : 'border-[#2B374B] bg-[#161D29] text-slate-100 hover:border-[#2E90FA]/70'
              }`}
            >
              {capturingKey
                ? 'Press any key on your PC keyboard…'
                : `Capture Key (Current: ${mapping.primaryValue || 'None'})`}
            </button>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-400 mb-2">
              Modifiers
            </span>
            <div className="flex items-center gap-2">
              {MODIFIER_KEYS.map((mod) => {
                const active = mapping.modifiers.includes(mod);
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleModifier(mod)}
                    className={`flex-1 rounded-md border py-1.5 font-mono text-xs font-medium transition-colors ${
                      active
                        ? 'border-[#2E90FA] bg-[#2E90FA]/20 text-white'
                        : 'border-[#232C3B] bg-[#0D1118] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mod}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-400 mb-2">
              Quick-Pick PC Gaming Keys
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {QUICK_KEYBOARD_KEYS.map((key) => {
                const active = mapping.primaryValue === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      onUpdateMapping({ ...mapping, primaryValue: key })
                    }
                    className={`rounded-md border py-1.5 font-mono text-xs transition-colors truncate px-1 ${
                      active
                        ? 'border-[#2E90FA] bg-[#2E90FA] text-white font-semibold'
                        : 'border-[#232C3B] bg-[#0D1118] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mapping.outputType === 'mouse' && (
        <div className="mt-4 space-y-3">
          <span className="block text-xs font-medium text-slate-400">
            Mouse Action
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {MOUSE_ACTIONS.map((action) => {
              const active = mapping.primaryValue === action;
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() =>
                    onUpdateMapping({ ...mapping, primaryValue: action })
                  }
                  className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors truncate ${
                    active
                      ? 'border-[#2E90FA] bg-[#2E90FA]/20 text-white'
                      : 'border-[#232C3B] bg-[#0D1118] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {action}
                </button>
              );
            })}
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-400 mb-2">
              Optional Modifiers
            </span>
            <div className="flex items-center gap-2">
              {MODIFIER_KEYS.map((mod) => {
                const active = mapping.modifiers.includes(mod);
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleModifier(mod)}
                    className={`flex-1 rounded-md border py-1.5 font-mono text-xs font-medium transition-colors ${
                      active
                        ? 'border-[#2E90FA] bg-[#2E90FA]/20 text-white'
                        : 'border-[#232C3B] bg-[#0D1118] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mod}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mapping.outputType === 'xinput' && (
        <div className="mt-4">
          <span className="block text-xs font-medium text-slate-400 mb-2">
            Virtual Xbox 360 (XInput) Button
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {XINPUT_TARGETS.map((target) => {
              const active = mapping.primaryValue === target;
              return (
                <button
                  key={target}
                  type="button"
                  onClick={() =>
                    onUpdateMapping({ ...mapping, primaryValue: target })
                  }
                  className={`rounded-md border px-2 py-2 font-mono text-xs transition-colors truncate ${
                    active
                      ? 'border-[#2E90FA] bg-[#2E90FA] text-white font-semibold'
                      : 'border-[#232C3B] bg-[#0D1118] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {target}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mapping.outputType === 'macro' && (
        <div className="mt-4 space-y-3">
          {macros.length > 0 && (
            <div>
              <span className="block text-xs font-medium text-slate-400 mb-1.5">
                Recorded Macro Sequence
              </span>
              <div className="space-y-1.5">
                {macros.map((m) => {
                  const isBound = mapping.macroId === m.id;
                  const totalMs = m.steps.reduce((acc, s) => acc + s.delayMs, 0);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        onUpdateMapping({
                          ...mapping,
                          outputType: 'macro',
                          macroId: m.id,
                          primaryValue: m.name,
                        })
                      }
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        isBound
                          ? 'border-[#2E90FA] bg-[#2E90FA]/20 text-white'
                          : 'border-[#232C3B] bg-[#0D1118] text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0 ml-2">
                        {m.steps.length} steps · {totalMs} ms
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {macros.length > 0 ? 'Or Custom Quick Macro Label' : 'Key Sequence'}
            </label>
            <input
              type="text"
              value={mapping.primaryValue}
              onChange={(e) =>
                onUpdateMapping({
                  ...mapping,
                  macroId: undefined,
                  primaryValue: e.target.value,
                })
              }
              placeholder="e.g. Shift + R -> Space"
              className="w-full rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-[#2E90FA] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={onOpenMacrosTab}
            className="w-full rounded-lg border border-[#263144] bg-[#161D29] px-3 py-2 text-xs font-medium text-[#60A5FA] transition-colors hover:border-[#2E90FA] hover:text-white"
          >
            Open Macro Sequencer &amp; Recorder →
          </button>
        </div>
      )}

      {mapping.outputType === 'unbound' && (
        <div className="mt-4 rounded-lg border border-[#1E2736] bg-[#0D1118] p-3 text-xs text-slate-400">
          This input will be ignored by the PC bridge so native game bindings do not double-fire.
        </div>
      )}

      {/* Trigger Behavior & Custom Label */}
      {mapping.outputType !== 'unbound' && (
        <div className="mt-5 space-y-4 border-t border-[#1E2736] pt-4">
          <div>
            <span className="block text-xs font-medium text-slate-400 mb-2">
              Activation Behavior
            </span>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-[#0A0D12] p-1 border border-[#1E2736]">
              {BEHAVIORS.map((b) => {
                const active = mapping.behavior === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      onUpdateMapping({ ...mapping, behavior: b.id })
                    }
                    className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#1D283A] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          {mapping.behavior === 'turbo' && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-400">Turbo Repeat Interval</span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {mapping.turboRateMs} ms ({Math.round(1000 / mapping.turboRateMs)} Hz)
                </span>
              </div>
              <input
                type="range"
                min={25}
                max={300}
                step={5}
                value={mapping.turboRateMs}
                onChange={(e) =>
                  onUpdateMapping({
                    ...mapping,
                    turboRateMs: Number(e.target.value),
                  })
                }
                className="studio-slider w-full"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              In-Game Action Note
            </label>
            <input
              type="text"
              value={mapping.label}
              onChange={(e) =>
                onUpdateMapping({ ...mapping, label: e.target.value })
              }
              placeholder="e.g. Jump, Reload, Parry"
              className="w-full rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-[#2E90FA] focus:outline-none"
            />
          </div>
        </div>
      )}
    </aside>
  );
}
