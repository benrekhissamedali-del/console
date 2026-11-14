import { useState } from 'react';
import {
  ControllerProfile,
  LiveInputState,
  StickConfig,
  StickCurveType,
  TriggerConfig,
} from '../types/controller';
import { applyStickCurve, evaluateCurveScalar } from '../utils/gamepadHardware';

interface CalibrationWorkspaceProps {
  profile: ControllerProfile;
  liveInput: LiveInputState;
  supportsVibration: boolean;
  hidConnected: boolean;
  onUpdateProfile: (next: ControllerProfile) => void;
  onTestRumble: (strong: number, weak: number) => Promise<{ ok: boolean; method: string }>;
  onSyncLightbar: (hex: string) => void;
  onVirtualStick: (stick: 'left' | 'right', x: number, y: number) => void;
}

const CURVE_OPTIONS: Array<{ id: StickCurveType; label: string; desc: string }> = [
  { id: 'linear', label: 'Linear', desc: '1:1 raw proportional response' },
  { id: 'precision', label: 'Precision', desc: 'Fine micro-aim near center' },
  { id: 'aggressive', label: 'Aggressive', desc: 'Fast snap turn acceleration' },
  { id: 'cubic', label: 'Cubic S-Curve', desc: 'Smooth ramp with stable center' },
];

const LIGHTBAR_SWATCHES = [
  { label: 'PlayStation Cobalt', hex: '#2E90FA' },
  { label: 'Emerald Active', hex: '#16A34A' },
  { label: 'Amber Telemetry', hex: '#D97706' },
  { label: 'Crimson Combat', hex: '#DC2626' },
  { label: 'Ice White', hex: '#E2E8F0' },
];

function StickCircularityPlot({
  title,
  rawX,
  rawY,
  config,
  onDragTest,
}: {
  title: string;
  rawX: number;
  rawY: number;
  config: StickConfig;
  onDragTest: (x: number, y: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const solved = applyStickCurve(rawX, rawY, config);
  const size = 180;
  const center = size / 2;
  const maxR = 72;

  const updateFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * size;
    const py = ((e.clientY - rect.top) / rect.height) * size;
    const dx = px - center;
    const dy = py - center;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(maxR, dist);
    const angle = Math.atan2(dy, dx);
    onDragTest(
      Number(((Math.cos(angle) * clampedDist) / maxR).toFixed(2)),
      Number(((Math.sin(angle) * clampedDist) / maxR).toFixed(2))
    );
  };

  // Build curve preview path
  const curvePoints: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const xPx = 12 + t * 156;
    let out = 0;
    if (t > config.innerDeadzone) {
      const range = Math.max(0.05, config.outerThreshold - config.innerDeadzone);
      const norm = Math.min(1, (t - config.innerDeadzone) / range);
      const curved = evaluateCurveScalar(norm, config.curve, config.sensitivity);
      out = Math.min(1, config.antiDeadzone + curved * (1 - config.antiDeadzone));
    }
    const yPx = 76 - out * 64;
    curvePoints.push(`${i === 0 ? 'M' : 'L'} ${xPx.toFixed(1)} ${yPx.toFixed(1)}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-white">{title}</h3>
        <span className="font-mono text-xs text-slate-400 tabular-nums">
          Raw {solved.rawMag.toFixed(2)} → Out {solved.outputMag.toFixed(2)}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="shrink-0 cursor-crosshair rounded-lg border border-[#1E2736] bg-[#0A0D12]"
          onPointerDown={(e) => {
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            updateFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (dragging) updateFromPointer(e);
          }}
          onPointerUp={(e) => {
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
            onDragTest(0, 0);
          }}
        >
          {/* Crosshairs */}
          <line x1={center} y1={10} x2={center} y2={size - 10} stroke="#1E2736" strokeWidth="1" />
          <line x1={10} y1={center} x2={size - 10} y2={center} stroke="#1E2736" strokeWidth="1" />

          {/* Full physical circle */}
          <circle cx={center} cy={center} r={maxR} fill="none" stroke="#283346" strokeWidth="1.2" />

          {/* Outer threshold ring */}
          <circle
            cx={center}
            cy={center}
            r={maxR * config.outerThreshold}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.55"
          />

          {/* Inner deadzone circle */}
          <circle
            cx={center}
            cy={center}
            r={maxR * config.innerDeadzone}
            fill="#DC2626"
            fillOpacity="0.12"
            stroke="#F87171"
            strokeWidth="1"
            opacity="0.7"
          />

          {/* Raw input vector */}
          <circle
            cx={center + rawX * maxR}
            cy={center + rawY * maxR}
            r="4.5"
            fill="#94A3B8"
          />

          {/* Output calibrated vector */}
          <line
            x1={center}
            y1={center}
            x2={center + solved.x * maxR}
            y2={center + solved.y * maxR}
            stroke="#2E90FA"
            strokeWidth="2"
          />
          <circle
            cx={center + solved.x * maxR}
            cy={center + solved.y * maxR}
            r="5.5"
            fill="#2E90FA"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        </svg>

        {/* Response Curve Transfer Graph */}
        <div className="flex-1 w-full">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Response Curve Transfer</span>
            <span className="font-mono text-slate-300">{config.curve}</span>
          </div>
          <svg
            viewBox="0 0 180 88"
            className="w-full h-[88px] rounded-lg border border-[#1E2736] bg-[#0A0D12]"
          >
            <line x1="12" y1="76" x2="168" y2="12" stroke="#1E2736" strokeDasharray="3 3" strokeWidth="1" />
            <path d={curvePoints.join(' ')} fill="none" stroke="#2E90FA" strokeWidth="2.2" strokeLinecap="round" />
            {solved.rawMag > 0 && (
              <circle
                cx={12 + Math.min(1, solved.rawMag) * 156}
                cy={76 - solved.outputMag * 64}
                r="4"
                fill="#FFFFFF"
                stroke="#2E90FA"
                strokeWidth="2"
              />
            )}
          </svg>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Drag inside the circular plot to test deadzone &amp; curve response.
          </p>
        </div>
      </div>
    </div>
  );
}

export function CalibrationWorkspace({
  profile,
  liveInput,
  supportsVibration,
  hidConnected,
  onUpdateProfile,
  onTestRumble,
  onSyncLightbar,
  onVirtualStick,
}: CalibrationWorkspaceProps) {
  const [rumbleStatus, setRumbleStatus] = useState<string>('');

  const updateStick = (side: 'leftStick' | 'rightStick', patch: Partial<StickConfig>) => {
    onUpdateProfile({
      ...profile,
      [side]: { ...profile[side], ...patch },
      updatedAt: new Date().toISOString(),
    });
  };

  const updateTrigger = (side: 'l2Config' | 'r2Config', patch: Partial<TriggerConfig>) => {
    onUpdateProfile({
      ...profile,
      [side]: { ...profile[side], ...patch },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleRumbleClick = async (strong: number, weak: number) => {
    const res = await onTestRumble(strong, weak);
    setRumbleStatus(res.ok ? `Sent via ${res.method}` : res.method);
  };

  const renderStickControls = (side: 'leftStick' | 'rightStick') => {
    const cfg = profile[side];
    return (
      <div className="mt-5 space-y-4 border-t border-[#1E2736] pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Stick Output Mode</label>
            <select
              value={cfg.mode}
              onChange={(e) =>
                updateStick(side, { mode: e.target.value as StickConfig['mode'] })
              }
              className="w-full rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-2 text-xs font-medium text-white focus:border-[#2E90FA] focus:outline-none"
            >
              <option value="left-stick">XInput Left Stick</option>
              <option value="right-stick">XInput Right Stick</option>
              <option value="wasd">Keyboard WASD</option>
              <option value="mouse">Mouse Camera / Aim</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Response Curve</label>
            <select
              value={cfg.curve}
              onChange={(e) =>
                updateStick(side, { curve: e.target.value as StickCurveType })
              }
              className="w-full rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-2 text-xs font-medium text-white focus:border-[#2E90FA] focus:outline-none"
            >
              {CURVE_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Inner Deadzone</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {Math.round(cfg.innerDeadzone * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={Math.round(cfg.innerDeadzone * 100)}
              onChange={(e) =>
                updateStick(side, { innerDeadzone: Number(e.target.value) / 100 })
              }
              className="studio-slider w-full"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Outer Threshold</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {Math.round(cfg.outerThreshold * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={100}
              value={Math.round(cfg.outerThreshold * 100)}
              onChange={(e) =>
                updateStick(side, { outerThreshold: Number(e.target.value) / 100 })
              }
              className="studio-slider w-full"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Anti-Deadzone Boost</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {Math.round(cfg.antiDeadzone * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={Math.round(cfg.antiDeadzone * 100)}
              onChange={(e) =>
                updateStick(side, { antiDeadzone: Number(e.target.value) / 100 })
              }
              className="studio-slider w-full"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Sensitivity Multiplier</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {cfg.sensitivity.toFixed(2)}×
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={Math.round(cfg.sensitivity * 100)}
              onChange={(e) =>
                updateStick(side, { sensitivity: Number(e.target.value) / 100 })
              }
              className="studio-slider w-full"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
          <input
            type="checkbox"
            checked={cfg.invertY}
            onChange={(e) => updateStick(side, { invertY: e.target.checked })}
            className="h-4 w-4 rounded border-[#2E3A4E] bg-[#0A0D12] accent-[#2E90FA]"
          />
          Invert Y-Axis
        </label>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stick Circularity & Response Curves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6">
          <StickCircularityPlot
            title="Left Analog Stick (LS)"
            rawX={liveInput.leftStick.x}
            rawY={liveInput.leftStick.y}
            config={profile.leftStick}
            onDragTest={(x, y) => onVirtualStick('left', x, y)}
          />
          {renderStickControls('leftStick')}
        </section>

        <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6">
          <StickCircularityPlot
            title="Right Analog Stick (RS)"
            rawX={liveInput.rightStick.x}
            rawY={liveInput.rightStick.y}
            config={profile.rightStick}
            onDragTest={(x, y) => onVirtualStick('right', x, y)}
          />
          {renderStickControls('rightStick')}
        </section>
      </div>

      {/* Triggers, Gyro & Hardware Lightbar/Haptics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* L2 & R2 Trigger Actuation */}
        <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6 space-y-5">
          <h3 className="font-display text-base font-semibold text-white">
            L2 / R2 Trigger Actuation
          </h3>

          {(['l2Config', 'r2Config'] as const).map((side) => {
            const cfg = profile[side];
            const label = side === 'l2Config' ? 'L2 Left Trigger' : 'R2 Right Trigger';
            const liveVal =
              side === 'l2Config'
                ? liveInput.buttonValues.l2 || 0
                : liveInput.buttonValues.r2 || 0;

            return (
              <div key={side} className="space-y-3 border-t border-[#1E2736] pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">{label}</span>
                  <span className="font-mono text-xs text-[#60A5FA] tabular-nums">
                    Live {Math.round(liveVal * 100)}%
                  </span>
                </div>

                {/* Live travel gauge */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#0A0D12]">
                  <div
                    className="h-full bg-[#2E90FA] transition-[width] duration-75"
                    style={{ width: `${Math.round(liveVal * 100)}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                    style={{ left: `${Math.round(cfg.actuationPoint * 100)}%` }}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Actuation Point</span>
                    <span className="font-mono text-slate-200 tabular-nums">
                      {Math.round(cfg.actuationPoint * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={Math.round(cfg.actuationPoint * 100)}
                    onChange={(e) =>
                      updateTrigger(side, { actuationPoint: Number(e.target.value) / 100 })
                    }
                    className="studio-slider w-full"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.hairTrigger}
                      onChange={(e) => updateTrigger(side, { hairTrigger: e.target.checked })}
                      className="h-4 w-4 rounded border-[#2E3A4E] bg-[#0A0D12] accent-[#2E90FA]"
                    />
                    Hair-Trigger Rapid Snap
                  </label>

                  {profile.targetModel === 'ps5-dualsense' && (
                    <select
                      value={cfg.adaptiveMode}
                      onChange={(e) =>
                        updateTrigger(side, {
                          adaptiveMode: e.target.value as TriggerConfig['adaptiveMode'],
                        })
                      }
                      className="rounded-md border border-[#263144] bg-[#0A0D12] px-2.5 py-1 text-xs text-slate-200 focus:border-[#2E90FA] focus:outline-none"
                    >
                      <option value="off">Adaptive: Off</option>
                      <option value="weapon">Adaptive: Weapon Break</option>
                      <option value="resistance">Adaptive: Linear Force</option>
                      <option value="rigid">Adaptive: Short Stop</option>
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Gyro Aim Bridge */}
        <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-white">
              Motion Gyro-to-Mouse
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={profile.gyro.enabled}
              onClick={() =>
                onUpdateProfile({
                  ...profile,
                  gyro: { ...profile.gyro, enabled: !profile.gyro.enabled },
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                profile.gyro.enabled
                  ? 'border-[#2E90FA] bg-[#2E90FA]'
                  : 'border-[#2E3A4E] bg-[#1A2230]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  profile.gyro.enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            Translates DualSense / DualShock 4 6-axis IMU pitch and yaw into pixel-accurate PC mouse movement.
          </p>

          <div className="space-y-4 border-t border-[#1E2736] pt-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Gyro Activation Trigger
              </label>
              <select
                value={profile.gyro.activation}
                onChange={(e) =>
                  onUpdateProfile({
                    ...profile,
                    gyro: {
                      ...profile.gyro,
                      activation: e.target.value as ControllerProfile['gyro']['activation'],
                    },
                  })
                }
                className="w-full rounded-lg border border-[#263144] bg-[#0A0D12] px-3 py-2 text-xs font-medium text-white focus:border-[#2E90FA] focus:outline-none"
              >
                <option value="l2-ads">Hold L2 (Aim Down Sights)</option>
                <option value="r1-hold">Hold R1 Bumper</option>
                <option value="touchpad">Touchpad Contact</option>
                <option value="always">Always Active</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Gyro Sensitivity (RWS)</span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {profile.gyro.sensitivity.toFixed(1)}×
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={40}
                value={Math.round(profile.gyro.sensitivity * 10)}
                onChange={(e) =>
                  onUpdateProfile({
                    ...profile,
                    gyro: {
                      ...profile.gyro,
                      sensitivity: Number(e.target.value) / 10,
                    },
                  })
                }
                className="studio-slider w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Jitter Smoothing</span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {profile.gyro.smoothing}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={profile.gyro.smoothing}
                onChange={(e) =>
                  onUpdateProfile({
                    ...profile,
                    gyro: {
                      ...profile.gyro,
                      smoothing: Number(e.target.value),
                    },
                  })
                }
                className="studio-slider w-full"
              />
            </div>
          </div>
        </section>

        {/* Lightbar LED & Hardware Haptics Test */}
        <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-white">
            Lightbar &amp; Haptic Motors
          </h3>

          <div className="space-y-3 border-t border-[#1E2736] pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Profile LED Color</span>
              <span className="font-mono text-xs text-slate-200">
                {profile.lightbarColor.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {LIGHTBAR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  onClick={() => {
                    onUpdateProfile({ ...profile, lightbarColor: swatch.hex });
                    onSyncLightbar(swatch.hex);
                  }}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    profile.lightbarColor.toLowerCase() === swatch.hex.toLowerCase()
                      ? 'border-white'
                      : 'border-[#232C3B]'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}

              <input
                type="color"
                aria-label="Custom Lightbar Color"
                value={profile.lightbarColor}
                onChange={(e) => {
                  onUpdateProfile({ ...profile, lightbarColor: e.target.value });
                  onSyncLightbar(e.target.value);
                }}
                className="h-7 w-9 cursor-pointer rounded border border-[#263144] bg-transparent p-0"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-[#1E2736] pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Hardware Haptics Test</span>
              <span className="text-slate-400">
                {hidConnected
                  ? 'Direct HID Ready'
                  : supportsVibration
                    ? 'Gamepad API Ready'
                    : 'Connect via USB/BT'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleRumbleClick(0.85, 0.2)}
                className="rounded-lg border border-[#263144] bg-[#161D29] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-[#2E90FA] hover:text-white"
              >
                Pulse Left (Heavy)
              </button>
              <button
                type="button"
                onClick={() => handleRumbleClick(0.2, 0.85)}
                className="rounded-lg border border-[#263144] bg-[#161D29] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-[#2E90FA] hover:text-white"
              >
                Pulse Right (Light)
              </button>
            </div>

            {rumbleStatus && (
              <p className="font-mono text-[11px] text-slate-400">{rumbleStatus}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
