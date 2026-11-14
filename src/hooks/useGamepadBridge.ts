import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ControllerProfile,
  DetectedHardware,
  LiveInputState,
  PSButtonId,
  TranslatedEvent,
} from '../types/controller';
import { formatMappingSummary, PS_BUTTON_CATALOG } from '../data/presets';
import {
  detectSonyController,
  requestSonyWebHID,
  sendSonyLightbarHID,
  triggerGamepadRumble,
  WebHIDDeviceLike,
} from '../utils/gamepadHardware';

const EMPTY_PRESSED = PS_BUTTON_CATALOG.reduce((acc, b) => {
  acc[b.id] = false;
  return acc;
}, {} as Record<PSButtonId, boolean>);

const EMPTY_VALUES = PS_BUTTON_CATALOG.reduce((acc, b) => {
  acc[b.id] = 0;
  return acc;
}, {} as Record<PSButtonId, number>);

export function useGamepadBridge(
  activeProfile: ControllerProfile,
  onPhysicalButtonPress?: (btnId: PSButtonId) => void
) {
  const [hardware, setHardware] = useState<DetectedHardware>({
    connected: false,
    index: null,
    rawId: '',
    displayName: 'No Physical Controller Connected',
    detectedModel: activeProfile.targetModel,
    vendorId: '054C',
    productId: '0CE6',
    connectionHint: 'USB-C / Wired',
    pollingHz: 0,
    pollingIntervalMs: 0,
    supportsVibration: false,
    hidConnected: false,
    hidProductName: null,
    lastHidReportHex: null,
  });

  const [liveInput, setLiveInput] = useState<LiveInputState>({
    buttonsPressed: { ...EMPTY_PRESSED },
    buttonValues: { ...EMPTY_VALUES },
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
  });

  const [eventLog, setEventLog] = useState<TranslatedEvent[]>([]);
  const [virtualButtons, setVirtualButtons] = useState<Record<PSButtonId, boolean>>({
    ...EMPTY_PRESSED,
  });
  const [virtualAxes, setVirtualAxes] = useState<{
    lx: number;
    ly: number;
    rx: number;
    ry: number;
    l2: number;
    r2: number;
  }>({ lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0 });

  const prevPressedRef = useRef<Record<PSButtonId, boolean>>({ ...EMPTY_PRESSED });
  const prevLiveInputRef = useRef<LiveInputState>({
    buttonsPressed: { ...EMPTY_PRESSED },
    buttonValues: { ...EMPTY_VALUES },
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
  });
  const virtualButtonsRef = useRef<Record<PSButtonId, boolean>>({ ...EMPTY_PRESSED });
  const virtualAxesRef = useRef({ lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0 });
  const lastTimestampRef = useRef<number>(0);
  const hidDeviceRef = useRef<WebHIDDeviceLike | null>(null);
  const activeProfileRef = useRef(activeProfile);
  const onPhysicalPressRef = useRef(onPhysicalButtonPress);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  useEffect(() => {
    onPhysicalPressRef.current = onPhysicalButtonPress;
  }, [onPhysicalButtonPress]);

  useEffect(() => {
    virtualButtonsRef.current = virtualButtons;
  }, [virtualButtons]);

  useEffect(() => {
    virtualAxesRef.current = virtualAxes;
  }, [virtualAxes]);

  const appendEvent = useCallback(
    (btnId: PSButtonId, analogValue?: number) => {
      const profile = activeProfileRef.current;
      const meta = PS_BUTTON_CATALOG.find((b) => b.id === btnId);
      const mapping = profile.mappings[btnId];
      if (!meta || !mapping) return;

      const sourceName =
        profile.targetModel === 'ps5-dualsense' ? meta.ps5Name : meta.ps4Name;
      const outputSummary = formatMappingSummary(mapping);

      const now = new Date();
      const timestamp = now.toTimeString().slice(0, 8);

      const entry: TranslatedEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp,
        sourceButton: btnId,
        sourceName,
        outputSummary,
        outputType: mapping.outputType,
        behavior: mapping.behavior,
        analogValue,
      };

      setEventLog((prev) => [entry, ...prev].slice(0, 24));
    },
    []
  );

  const pressVirtualButton = useCallback(
    (btnId: PSButtonId, pressed: boolean, analogVal?: number) => {
      setVirtualButtons((prev) => {
        if (prev[btnId] === pressed) return prev;
        const next = { ...prev, [btnId]: pressed };
        virtualButtonsRef.current = next;
        return next;
      });
      if (btnId === 'l2' || btnId === 'r2') {
        const val = pressed ? (analogVal ?? 1) : 0;
        setVirtualAxes((prev) => {
          const next = { ...prev, [btnId]: val };
          virtualAxesRef.current = next;
          return next;
        });
      }
      if (pressed) {
        appendEvent(btnId, analogVal);
      }
    },
    [appendEvent]
  );

  const setVirtualStick = useCallback(
    (stick: 'left' | 'right', x: number, y: number) => {
      setVirtualAxes((prev) => {
        const next =
          stick === 'left' ? { ...prev, lx: x, ly: y } : { ...prev, rx: x, ry: y };
        virtualAxesRef.current = next;
        return next;
      });
    },
    []
  );

  const setVirtualTrigger = useCallback(
    (trigger: 'l2' | 'r2', value: number) => {
      const clamped = Math.max(0, Math.min(1, value));
      setVirtualAxes((prev) => {
        const next = { ...prev, [trigger]: clamped };
        virtualAxesRef.current = next;
        return next;
      });
      const threshold =
        trigger === 'l2'
          ? activeProfileRef.current.l2Config.actuationPoint
          : activeProfileRef.current.r2Config.actuationPoint;
      const isPressed = clamped >= threshold;
      setVirtualButtons((prev) => {
        if (prev[trigger] === isPressed) return prev;
        if (isPressed) appendEvent(trigger, clamped);
        const next = { ...prev, [trigger]: isPressed };
        virtualButtonsRef.current = next;
        return next;
      });
    },
    [appendEvent]
  );

  const connectWebHID = useCallback(async () => {
    try {
      const dev = await requestSonyWebHID();
      if (!dev) return { ok: false, message: 'No Sony controller selected' };
      hidDeviceRef.current = dev;
      setHardware((prev) => ({
        ...prev,
        hidConnected: true,
        hidProductName: dev.productName || 'Sony HID Device',
        vendorId: dev.vendorId.toString(16).toUpperCase().padStart(4, '0'),
        productId: dev.productId.toString(16).toUpperCase().padStart(4, '0'),
      }));

      dev.addEventListener('inputreport', (event) => {
        const bytes: string[] = [];
        const len = Math.min(8, event.data.byteLength);
        for (let i = 0; i < len; i++) {
          bytes.push(event.data.getUint8(i).toString(16).toUpperCase().padStart(2, '0'));
        }
        setHardware((prev) => ({
          ...prev,
          lastHidReportHex: bytes.join(' '),
        }));
      });

      await sendSonyLightbarHID(dev, activeProfileRef.current.lightbarColor, false);
      return { ok: true, message: `Direct HID linked: ${dev.productName}` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'WebHID access cancelled',
      };
    }
  }, []);

  const syncLightbarColor = useCallback(async (hexColor: string) => {
    if (hidDeviceRef.current) {
      return sendSonyLightbarHID(hidDeviceRef.current, hexColor, false);
    }
    return false;
  }, []);

  const testRumble = useCallback(
    async (strong = 0.7, weak = 0.45) => {
      if (hidDeviceRef.current) {
        const ok = await sendSonyLightbarHID(
          hidDeviceRef.current,
          activeProfileRef.current.lightbarColor,
          true
        );
        if (ok) {
          setTimeout(() => {
            sendSonyLightbarHID(
              hidDeviceRef.current,
              activeProfileRef.current.lightbarColor,
              false
            );
          }, 280);
          return { ok: true, method: 'Direct Sony WebHID Haptics' };
        }
      }
      return triggerGamepadRumble(hardware.index, strong, weak, 300);
    },
    [hardware.index]
  );

  // Sync hardware connection state
  useEffect(() => {
    const refreshPads = () => {
      let pads: (Gamepad | null)[] = [];
      try {
        pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      } catch {
        pads = [];
      }
      let found: Gamepad | null = null;
      for (const p of pads) {
        if (p && p.connected) {
          found = p;
          break;
        }
      }

      if (found) {
        const meta = detectSonyController(found.id);
        const cap = (found as Gamepad & { vibrationActuator?: unknown })
          .vibrationActuator;
        setHardware((prev) => ({
          ...prev,
          connected: true,
          index: found.index,
          rawId: found.id,
          displayName: meta.displayName,
          detectedModel: meta.model,
          vendorId: meta.vendorId,
          productId: meta.productId,
          connectionHint: meta.connectionHint,
          supportsVibration: Boolean(cap),
        }));
      } else {
        setHardware((prev) => ({
          ...prev,
          connected: false,
          index: null,
          rawId: '',
          displayName: 'No Physical Controller Connected',
          pollingHz: 0,
          pollingIntervalMs: 0,
          supportsVibration: false,
        }));
      }
    };

    refreshPads();
    window.addEventListener('gamepadconnected', refreshPads);
    window.addEventListener('gamepaddisconnected', refreshPads);
    return () => {
      window.removeEventListener('gamepadconnected', refreshPads);
      window.removeEventListener('gamepaddisconnected', refreshPads);
    };
  }, []);

  // 60/120fps polling loop that only triggers React re-renders when input values change
  useEffect(() => {
    let rafId = 0;

    const poll = () => {
      let pads: (Gamepad | null)[] = [];
      try {
        pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      } catch {
        pads = [];
      }

      let pad: Gamepad | null = null;
      for (const p of pads) {
        if (p && p.connected) {
          pad = p;
          break;
        }
      }

      if (pad) {
        if (lastTimestampRef.current > 0 && pad.timestamp > lastTimestampRef.current) {
          const delta = pad.timestamp - lastTimestampRef.current;
          if (delta > 0.5 && delta < 250) {
            const hz = Math.round(1000 / delta);
            setHardware((prev) =>
              Math.abs(prev.pollingHz - hz) > 4
                ? {
                    ...prev,
                    pollingHz: hz,
                    pollingIntervalMs: Number(delta.toFixed(1)),
                  }
                : prev
            );
          }
        }
        lastTimestampRef.current = pad.timestamp;
      }

      const vButtons = virtualButtonsRef.current;
      const vAxes = virtualAxesRef.current;
      const prevInput = prevLiveInputRef.current;

      const nextPressed = { ...EMPTY_PRESSED };
      const nextValues = { ...EMPTY_VALUES };
      let changed = false;

      for (const meta of PS_BUTTON_CATALOG) {
        const physBtn = pad?.buttons?.[meta.gamepadIndex];
        const physVal = physBtn ? physBtn.value : 0;
        const physPressed = physBtn ? physBtn.pressed : false;

        let virtVal = vButtons[meta.id] ? 1 : 0;
        if (meta.id === 'l2' && vAxes.l2 > 0) virtVal = vAxes.l2;
        if (meta.id === 'r2' && vAxes.r2 > 0) virtVal = vAxes.r2;

        const val = Math.max(physVal, virtVal);
        const isPressed = physPressed || Boolean(vButtons[meta.id]);

        nextPressed[meta.id] = isPressed;
        nextValues[meta.id] = val;

        if (
          prevInput.buttonsPressed[meta.id] !== isPressed ||
          Math.abs((prevInput.buttonValues[meta.id] || 0) - val) > 0.01
        ) {
          changed = true;
        }

        if (physPressed && !prevPressedRef.current[meta.id]) {
          appendEvent(meta.id, meta.isAnalogTrigger ? physVal : undefined);
          onPhysicalPressRef.current?.(meta.id);
        }
        prevPressedRef.current[meta.id] = physPressed;
      }

      const physLx = pad?.axes?.[0] ?? 0;
      const physLy = pad?.axes?.[1] ?? 0;
      const physRx = pad?.axes?.[2] ?? 0;
      const physRy = pad?.axes?.[3] ?? 0;

      const lx = Math.abs(vAxes.lx) > 0.01 ? vAxes.lx : physLx;
      const ly = Math.abs(vAxes.ly) > 0.01 ? vAxes.ly : physLy;
      const rx = Math.abs(vAxes.rx) > 0.01 ? vAxes.rx : physRx;
      const ry = Math.abs(vAxes.ry) > 0.01 ? vAxes.ry : physRy;

      if (
        Math.abs(prevInput.leftStick.x - lx) > 0.005 ||
        Math.abs(prevInput.leftStick.y - ly) > 0.005 ||
        Math.abs(prevInput.rightStick.x - rx) > 0.005 ||
        Math.abs(prevInput.rightStick.y - ry) > 0.005
      ) {
        changed = true;
      }

      if (changed) {
        const snapshot: LiveInputState = {
          buttonsPressed: nextPressed,
          buttonValues: nextValues,
          leftStick: { x: lx, y: ly },
          rightStick: { x: rx, y: ry },
        };
        prevLiveInputRef.current = snapshot;
        setLiveInput(snapshot);
      }

      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [appendEvent]);

  return {
    hardware,
    liveInput,
    eventLog,
    clearEventLog: () => setEventLog([]),
    pressVirtualButton,
    setVirtualStick,
    setVirtualTrigger,
    connectWebHID,
    syncLightbarColor,
    testRumble,
  };
}
