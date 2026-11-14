import {
  ControllerModel,
  ControllerProfile,
  PSButtonId,
  StickConfig,
  StickCurveType,
} from '../types/controller';
import { formatMappingSummary, PS_BUTTON_CATALOG } from '../data/presets';

export interface ParsedControllerMeta {
  displayName: string;
  model: ControllerModel;
  vendorId: string;
  productId: string;
  connectionHint: 'USB-C / Wired' | 'Bluetooth' | 'Standard HID';
}

export function detectSonyController(rawId: string): ParsedControllerMeta {
  const lower = rawId.toLowerCase();
  const vendorMatch = rawId.match(/Vendor:\s*([0-9a-fA-F]{4})/i);
  const productMatch = rawId.match(/Product:\s*([0-9a-fA-F]{4})/i);
  const vendorId = vendorMatch ? vendorMatch[1].toUpperCase() : '054C';
  const productId = productMatch ? productMatch[1].toUpperCase() : '0CE6';

  let model: ControllerModel = 'ps5-dualsense';
  let displayName = 'PlayStation Controller';

  if (
    lower.includes('0df2') ||
    lower.includes('dualsense edge')
  ) {
    model = 'ps5-dualsense';
    displayName = 'DualSense Edge (PS5)';
  } else if (
    lower.includes('0ce6') ||
    lower.includes('dualsense') ||
    lower.includes('ps5')
  ) {
    model = 'ps5-dualsense';
    displayName = 'DualSense Wireless Controller (PS5)';
  } else if (
    lower.includes('09cc') ||
    lower.includes('05c4') ||
    lower.includes('dualshock') ||
    lower.includes('wireless controller')
  ) {
    model = 'ps4-dualshock';
    displayName = 'DualShock 4 (PS4)';
  } else if (rawId.trim().length > 0) {
    displayName = rawId.split('(')[0].trim() || 'HID Gamepad';
  }

  const connectionHint: ParsedControllerMeta['connectionHint'] =
    lower.includes('bluetooth') || lower.includes('bt')
      ? 'Bluetooth'
      : lower.includes('usb') || lower.includes('054c')
        ? 'USB-C / Wired'
        : 'Standard HID';

  return {
    displayName,
    model,
    vendorId,
    productId,
    connectionHint,
  };
}

export function evaluateCurveScalar(
  normMagnitude: number,
  curve: StickCurveType,
  sensitivity: number
): number {
  const clamped = Math.max(0, Math.min(1, normMagnitude));
  let curved = clamped;

  switch (curve) {
    case 'precision':
      curved = Math.pow(clamped, 1.65);
      break;
    case 'aggressive':
      curved = Math.pow(clamped, 0.68);
      break;
    case 'cubic':
      curved = clamped * clamped * (3 - 2 * clamped);
      break;
    case 'linear':
    default:
      curved = clamped;
      break;
  }

  return Math.max(0, Math.min(1, curved * sensitivity));
}

export function applyStickCurve(
  rawX: number,
  rawY: number,
  config: StickConfig
): { x: number; y: number; rawMag: number; outputMag: number; active: boolean } {
  const adjustedY = config.invertY ? -rawY : rawY;
  const rawMag = Math.min(1, Math.hypot(rawX, adjustedY));

  if (rawMag <= config.innerDeadzone) {
    return { x: 0, y: 0, rawMag, outputMag: 0, active: false };
  }

  const range = Math.max(0.05, config.outerThreshold - config.innerDeadzone);
  const normalized = Math.min(1, (rawMag - config.innerDeadzone) / range);
  const curved = evaluateCurveScalar(normalized, config.curve, config.sensitivity);
  const withAntiDeadzone =
    curved > 0
      ? Math.min(1, config.antiDeadzone + curved * (1 - config.antiDeadzone))
      : 0;

  const angle = Math.atan2(adjustedY, rawX);
  return {
    x: Math.cos(angle) * withAntiDeadzone,
    y: Math.sin(angle) * withAntiDeadzone,
    rawMag,
    outputMag: withAntiDeadzone,
    active: true,
  };
}

export async function triggerGamepadRumble(
  gamepadIndex: number | null,
  strongMagnitude = 0.65,
  weakMagnitude = 0.45,
  durationMs = 280
): Promise<{ ok: boolean; method: string }> {
  if (gamepadIndex === null) {
    return { ok: false, method: 'No physical controller connected' };
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[gamepadIndex];
  if (!pad) {
    return { ok: false, method: 'Controller slot unavailable' };
  }

  const actuator = (pad as Gamepad & {
    vibrationActuator?: {
      playEffect?: (
        type: string,
        params: {
          startDelay: number;
          duration: number;
          weakMagnitude: number;
          strongMagnitude: number;
        }
      ) => Promise<string>;
    };
  }).vibrationActuator;

  if (actuator && typeof actuator.playEffect === 'function') {
    try {
      await actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude,
        strongMagnitude,
      });
      return { ok: true, method: 'Gamepad Dual-Rumble API' };
    } catch {
      return { ok: false, method: 'Vibration blocked by browser or driver' };
    }
  }
  return { ok: false, method: 'Haptics actuator not exposed on this OS/browser' };
}

export interface WebHIDDeviceLike {
  opened: boolean;
  productName: string;
  vendorId: number;
  productId: number;
  open: () => Promise<void>;
  close: () => Promise<void>;
  sendReport: (reportId: number, data: BufferSource) => Promise<void>;
  addEventListener: (
    event: string,
    handler: (ev: { data: DataView; reportId: number }) => void
  ) => void;
}

export function isWebHIDSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

export async function requestSonyWebHID(): Promise<WebHIDDeviceLike | null> {
  if (!isWebHIDSupported()) return null;
  const navHid = (
    navigator as Navigator & {
      hid: {
        requestDevice: (opts: {
          filters: Array<{ vendorId: number; productId?: number }>;
        }) => Promise<WebHIDDeviceLike[]>;
      };
    }
  ).hid;

  const devices = await navHid.requestDevice({
    filters: [
      { vendorId: 0x054c, productId: 0x0ce6 }, // DualSense
      { vendorId: 0x054c, productId: 0x0df2 }, // DualSense Edge
      { vendorId: 0x054c, productId: 0x09cc }, // DualShock 4 v2
      { vendorId: 0x054c, productId: 0x05c4 }, // DualShock 4 v1
      { vendorId: 0x054c },
    ],
  });

  if (!devices || devices.length === 0) return null;
  const device = devices[0];
  if (!device.opened) {
    await device.open();
  }
  return device;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (Number.isNaN(num)) return [46, 144, 250];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export async function sendSonyLightbarHID(
  device: WebHIDDeviceLike | null,
  hexColor: string,
  rumblePulse = false
): Promise<boolean> {
  if (!device || !device.opened) return false;
  const [r, g, b] = hexToRgb(hexColor);
  try {
    if (device.productId === 0x0ce6 || device.productId === 0x0df2) {
      // DualSense USB Output Report 0x02 (47 bytes payload)
      const data = new Uint8Array(47);
      data[0] = 0xff; // valid_flag0 (motors + triggers)
      data[1] = 0xf7; // valid_flag1 (lightbar + player leds)
      data[2] = rumblePulse ? 90 : 0; // right motor
      data[3] = rumblePulse ? 110 : 0; // left motor
      data[41] = 0x02; // lightbar fade/control
      data[43] = 0x04; // player LED 1
      data[44] = r;
      data[45] = g;
      data[46] = b;
      await device.sendReport(0x02, data);
      return true;
    } else {
      // DualShock 4 USB Output Report 0x05 (31 bytes payload)
      const data = new Uint8Array(31);
      data[0] = 0xff;
      data[3] = rumblePulse ? 90 : 0;
      data[4] = rumblePulse ? 110 : 0;
      data[5] = r;
      data[6] = g;
      data[7] = b;
      await device.sendReport(0x05, data);
      return true;
    }
  } catch {
    return false;
  }
}

const DS4_WINDOWS_BUTTON_MAP: Record<PSButtonId, string> = {
  cross: 'Cross',
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  l1: 'L1',
  r1: 'R1',
  l2: 'L2',
  r2: 'R2',
  share: 'Share',
  options: 'Options',
  l3: 'L3',
  r3: 'R3',
  'dpad-up': 'DpadUp',
  'dpad-down': 'DpadDown',
  'dpad-left': 'DpadLeft',
  'dpad-right': 'DpadRight',
  ps: 'PS',
  touchpad: 'TouchUpper',
  mute: 'Mute',
};

export function exportToDS4WindowsXML(profile: ControllerProfile): string {
  const [r, g, b] = hexToRgb(profile.lightbarColor);
  const controlLines = PS_BUTTON_CATALOG.map((meta) => {
    const map = profile.mappings[meta.id];
    const xmlTag = DS4_WINDOWS_BUTTON_MAP[meta.id];
    const summary = formatMappingSummary(map);
    const comment = map.label ? ` <!-- ${map.label} -->` : '';
    const macroAttr = map.macroId ? ` MacroRef="${map.macroId}"` : '';
    return `    <Control Action="${summary}" Trigger="${map.behavior}" TurboMs="${map.turboRateMs}"${macroAttr}>${xmlTag}</Control>${comment}`;
  }).join('\n');

  const macroXml = (profile.macros || [])
    .map((m) => {
      const stepsXml = m.steps
        .map(
          (s) =>
            `      <Step Kind="${s.kind}" Target="${s.target}" Action="${s.action}" DelayMs="${s.delayMs}" />`
        )
        .join('\n');
      return `    <Macro Id="${m.id}" Name="${m.name}" RepeatMode="${m.repeatMode}">\n${stepsXml}\n    </Macro>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by DualBridge PC Controller Remapper -->
<DS4Windows app_version="3.3.3" config_version="5">
  <ProfileName>${profile.name}</ProfileName>
  <ControllerModel>${profile.targetModel === 'ps5-dualsense' ? 'DualSense' : 'DualShock4'}</ControllerModel>
  <LightbarColor Red="${r}" Green="${g}" Blue="${b}" />
  <LSDeadZone>${profile.leftStick.innerDeadzone.toFixed(2)}</LSDeadZone>
  <RSDeadZone>${profile.rightStick.innerDeadzone.toFixed(2)}</RSDeadZone>
  <LSAntiDeadZone>${profile.leftStick.antiDeadzone.toFixed(2)}</LSAntiDeadZone>
  <RSAntiDeadZone>${profile.rightStick.antiDeadzone.toFixed(2)}</RSAntiDeadZone>
  <LSCurve>${profile.leftStick.curve}</LSCurve>
  <RSCurve>${profile.rightStick.curve}</RSCurve>
  <L2TriggerDeadZone>${profile.l2Config.actuationPoint.toFixed(2)}</L2TriggerDeadZone>
  <R2TriggerDeadZone>${profile.r2Config.actuationPoint.toFixed(2)}</R2TriggerDeadZone>
  <GyroMouse Enabled="${profile.gyro.enabled}" Activation="${profile.gyro.activation}" Sensitivity="${profile.gyro.sensitivity.toFixed(2)}" />
  <ControlAssignments>
${controlLines}
  </ControlAssignments>
  <Macros>
${macroXml}
  </Macros>
</DS4Windows>`;
}

export function exportToAHK(profile: ControllerProfile): string {
  const macrosById = new Map((profile.macros || []).map((m) => [m.id, m]));

  const lines = PS_BUTTON_CATALOG.map((meta, idx) => {
    const map = profile.mappings[meta.id];
    const joyIndex = idx + 1;
    if (map.outputType === 'unbound') {
      return `; Joy${joyIndex} (${meta.ps5Name}) -> Unbound`;
    }
    const target = formatMappingSummary(map);
    if (map.outputType === 'macro') {
      const macro = map.macroId ? macrosById.get(map.macroId) : undefined;
      if (macro && macro.steps.length > 0) {
        const body = macro.steps
          .map((s) => {
            const waitLine = s.delayMs > 0 ? `  Sleep(${s.delayMs})\n` : '';
            if (s.kind === 'delay') return `  Sleep(${s.delayMs})`;
            if (s.kind === 'mouse') {
              const btn =
                s.target === 'Left Click'
                  ? 'LButton'
                  : s.target === 'Right Click'
                    ? 'RButton'
                    : 'MButton';
              const dir = s.action === 'down' ? ' Down' : s.action === 'up' ? ' Up' : '';
              return `${waitLine}  Click("${btn}${dir}")`;
            }
            const keyName = s.target === 'Space' ? 'Space' : s.target;
            const suffix = s.action === 'down' ? ' down' : s.action === 'up' ? ' up' : '';
            return `${waitLine}  Send("{${keyName}${suffix}}")`;
          })
          .join('\n');
        return `Joy${joyIndex}:: { ; ${meta.ps5Name} -> Macro: ${macro.name}\n${body}\n}`;
      }
      return `; Joy${joyIndex} (${meta.ps5Name}) -> ${target}`;
    }
    if (map.outputType === 'keyboard') {
      const key = map.primaryValue === 'Space' ? 'Space' : map.primaryValue;
      return `Joy${joyIndex}::Send("{${key}}") ; ${meta.ps5Name} -> ${target}${map.label ? ` (${map.label})` : ''}`;
    }
    if (map.outputType === 'mouse') {
      const mouseBtn =
        map.primaryValue === 'Left Click'
          ? 'LButton'
          : map.primaryValue === 'Right Click'
            ? 'RButton'
            : map.primaryValue === 'Middle Click'
              ? 'MButton'
              : 'XButton1';
      return `Joy${joyIndex}::Click("${mouseBtn}") ; ${meta.ps5Name} -> ${target}`;
    }
    return `; Joy${joyIndex} (${meta.ps5Name}) -> ${target} (${map.outputType})`;
  });

  return `; DualBridge AutoHotkey v2 PC Controller Bridge
; Profile: ${profile.name}
; Hardware: ${profile.targetModel === 'ps5-dualsense' ? 'PS5 DualSense' : 'PS4 DualShock 4'}
#Requires AutoHotkey v2.0
#SingleInstance Force

${lines.join('\n')}`;
}

export function exportToJSON(profile: ControllerProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function parseImportedProfile(rawJson: string): ControllerProfile | null {
  try {
    const parsed = JSON.parse(rawJson) as Partial<ControllerProfile>;
    if (!parsed || typeof parsed.name !== 'string' || !parsed.mappings) {
      return null;
    }
    return {
      ...parsed,
      macros: Array.isArray(parsed.macros) ? parsed.macros : [],
      id: parsed.id || `imported-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    } as ControllerProfile;
  } catch {
    return null;
  }
}
