export type ControllerModel = 'ps5-dualsense' | 'ps4-dualshock';

export type PSButtonId =
  | 'cross'
  | 'circle'
  | 'square'
  | 'triangle'
  | 'l1'
  | 'r1'
  | 'l2'
  | 'r2'
  | 'share'
  | 'options'
  | 'l3'
  | 'r3'
  | 'dpad-up'
  | 'dpad-down'
  | 'dpad-left'
  | 'dpad-right'
  | 'ps'
  | 'touchpad'
  | 'mute';

export type ButtonGroup =
  | 'Face'
  | 'Shoulders & Triggers'
  | 'D-Pad'
  | 'Thumbsticks'
  | 'System';

export interface PSButtonMeta {
  id: PSButtonId;
  gamepadIndex: number;
  ps5Name: string;
  ps4Name: string;
  shortGlyph: string;
  group: ButtonGroup;
  defaultXInput: string;
  isAnalogTrigger?: boolean;
}

export type OutputType = 'keyboard' | 'mouse' | 'xinput' | 'macro' | 'unbound';

export type TriggerBehavior = 'press' | 'hold' | 'toggle' | 'turbo';

export interface ButtonMapping {
  buttonId: PSButtonId;
  outputType: OutputType;
  primaryValue: string;
  modifiers: string[];
  behavior: TriggerBehavior;
  turboRateMs: number;
  label: string;
  macroId?: string;
}

export type MacroStepKind = 'keyboard' | 'mouse' | 'controller' | 'delay';

export type MacroStepAction = 'down' | 'up' | 'tap' | 'wait';

export interface MacroStep {
  id: string;
  kind: MacroStepKind;
  target: string;
  action: MacroStepAction;
  delayMs: number;
}

export interface ControllerMacro {
  id: string;
  name: string;
  repeatMode: 'once' | 'while-held' | 'toggle';
  steps: MacroStep[];
  updatedAt: string;
}

export type StickCurveType = 'linear' | 'precision' | 'aggressive' | 'cubic';

export interface StickConfig {
  innerDeadzone: number; // 0 to 0.40
  outerThreshold: number; // 0.60 to 1.00
  antiDeadzone: number; // 0 to 0.30
  sensitivity: number; // 0.50 to 2.00
  curve: StickCurveType;
  invertY: boolean;
  mode: 'left-stick' | 'right-stick' | 'wasd' | 'mouse';
}

export interface TriggerConfig {
  hairTrigger: boolean;
  actuationPoint: number; // 0.05 to 0.95
  adaptiveMode: 'off' | 'weapon' | 'resistance' | 'rigid';
}

export interface GyroConfig {
  enabled: boolean;
  activation: 'always' | 'l2-ads' | 'r1-hold' | 'touchpad';
  sensitivity: number; // 0.5 to 4.0
  smoothing: number; // 0 to 100
}

export interface ControllerProfile {
  id: string;
  name: string;
  description: string;
  targetModel: ControllerModel;
  lightbarColor: string;
  mappings: Record<PSButtonId, ButtonMapping>;
  macros: ControllerMacro[];
  leftStick: StickConfig;
  rightStick: StickConfig;
  l2Config: TriggerConfig;
  r2Config: TriggerConfig;
  gyro: GyroConfig;
  updatedAt: string;
}

export interface DetectedHardware {
  connected: boolean;
  index: number | null;
  rawId: string;
  displayName: string;
  detectedModel: ControllerModel;
  vendorId: string;
  productId: string;
  connectionHint: 'USB-C / Wired' | 'Bluetooth' | 'Standard HID';
  pollingHz: number;
  pollingIntervalMs: number;
  supportsVibration: boolean;
  hidConnected: boolean;
  hidProductName: string | null;
  lastHidReportHex: string | null;
}

export interface LiveInputState {
  buttonsPressed: Record<PSButtonId, boolean>;
  buttonValues: Record<PSButtonId, number>;
  leftStick: { x: number; y: number };
  rightStick: { x: number; y: number };
}

export interface TranslatedEvent {
  id: string;
  timestamp: string;
  sourceButton: PSButtonId;
  sourceName: string;
  outputSummary: string;
  outputType: OutputType;
  behavior: TriggerBehavior;
  analogValue?: number;
}
