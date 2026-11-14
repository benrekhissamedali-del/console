import React, { useRef, useState } from 'react';
import {
  ButtonMapping,
  ControllerModel,
  LiveInputState,
  PSButtonId,
} from '../types/controller';
import { formatMappingSummary } from '../data/presets';

interface ControllerSchematicProps {
  model: ControllerModel;
  lightbarColor: string;
  selectedButton: PSButtonId;
  onSelectButton: (id: PSButtonId) => void;
  mappings: Record<PSButtonId, ButtonMapping>;
  liveInput: LiveInputState;
  onVirtualButton: (id: PSButtonId, pressed: boolean, analogVal?: number) => void;
  onVirtualStick: (stick: 'left' | 'right', x: number, y: number) => void;
  onVirtualTrigger: (trigger: 'l2' | 'r2', value: number) => void;
}

export function ControllerSchematic({
  model,
  lightbarColor,
  selectedButton,
  onSelectButton,
  mappings,
  liveInput,
  onVirtualButton,
  onVirtualStick,
  onVirtualTrigger,
}: ControllerSchematicProps) {
  const isPS5 = model === 'ps5-dualsense';
  const [draggingStick, setDraggingStick] = useState<'left' | 'right' | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const isPressed = (id: PSButtonId) => liveInput.buttonsPressed[id];
  const isSelected = (id: PSButtonId) => selectedButton === id;

  const getStroke = (id: PSButtonId, defaultStroke = '#334155') => {
    if (isPressed(id)) return '#2E90FA';
    if (isSelected(id)) return '#60A5FA';
    return defaultStroke;
  };

  const getFill = (id: PSButtonId, baseFill: string) => {
    if (isPressed(id)) return '#1D4ED8';
    if (isSelected(id)) return '#1E293B';
    return baseFill;
  };

  const handleStickPointer = (
    stick: 'left' | 'right',
    e: React.PointerEvent<SVGCircleElement>
  ) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const viewX = ((e.clientX - rect.left) / rect.width) * 760;
    const viewY = ((e.clientY - rect.top) / rect.height) * 460;
    const centerX = stick === 'left' ? 270 : 490;
    const centerY = 278;
    const maxR = 30;
    const dx = viewX - centerX;
    const dy = viewY - centerY;
    const dist = Math.hypot(dx, dy);
    const scale = dist > maxR ? maxR / dist : 1;
    onVirtualStick(
      stick,
      Number(((dx * scale) / maxR).toFixed(2)),
      Number(((dy * scale) / maxR).toFixed(2))
    );
  };

  const renderCallout = (
    id: PSButtonId,
    x: number,
    y: number,
    align: 'left' | 'right' | 'center' = 'center'
  ) => {
    const map = mappings[id];
    const summary = formatMappingSummary(map);
    const active = isSelected(id) || isPressed(id);
    const textAnchor = align === 'left' ? 'end' : align === 'right' ? 'start' : 'middle';
    const truncated = summary.length > 14 ? `${summary.slice(0, 13)}…` : summary;

    return (
      <g
        className="pointer-events-none select-none"
        opacity={active ? 1 : 0.72}
      >
        <text
          x={x}
          y={y}
          textAnchor={textAnchor}
          fill={active ? '#93C5FD' : '#94A3B8'}
          fontSize="11"
          fontFamily="JetBrains Mono, monospace"
          fontWeight={active ? 600 : 500}
        >
          {truncated}
        </text>
      </g>
    );
  };

  const bindHandlers = (id: PSButtonId) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelectButton(id);
      onVirtualButton(id, true, id === 'l2' || id === 'r2' ? 1 : undefined);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      onVirtualButton(id, false, 0);
    },
    onPointerLeave: () => {
      if (isPressed(id)) {
        onVirtualButton(id, false, 0);
      }
    },
    style: { cursor: 'pointer' },
  });

  const l2Val = liveInput.buttonValues.l2 || 0;
  const r2Val = liveInput.buttonValues.r2 || 0;

  return (
    <div className="relative flex flex-col items-center justify-center rounded-xl border border-[#232C3B] bg-[#0F141C] p-4 sm:p-6">
      {/* Top interactive analog L2 / R2 trigger travel strips */}
      <div className="mb-3 flex w-full max-w-[680px] items-center justify-between gap-6">
        <div className="flex flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => onSelectButton('l2')}
            className={`font-mono text-xs font-medium whitespace-nowrap transition-colors ${
              isSelected('l2') ? 'text-[#60A5FA]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            L2 {Math.round(l2Val * 100)}%
          </button>
          <input
            type="range"
            aria-label="Test L2 Trigger Travel"
            min={0}
            max={100}
            value={Math.round(l2Val * 100)}
            onChange={(e) => {
              onSelectButton('l2');
              onVirtualTrigger('l2', Number(e.target.value) / 100);
            }}
            onPointerUp={() => onVirtualTrigger('l2', 0)}
            className="studio-slider w-full max-w-[140px]"
          />
          <span className="font-mono text-[11px] text-slate-400 truncate max-w-[110px]">
            {formatMappingSummary(mappings.l2)}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
          <span>{isPS5 ? 'PS5 DualSense' : 'PS4 DualShock 4'}</span>
          <span aria-hidden="true">·</span>
          <span>Click any control to map</span>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <span className="font-mono text-[11px] text-slate-400 truncate max-w-[110px] text-right">
            {formatMappingSummary(mappings.r2)}
          </span>
          <input
            type="range"
            aria-label="Test R2 Trigger Travel"
            min={0}
            max={100}
            value={Math.round(r2Val * 100)}
            onChange={(e) => {
              onSelectButton('r2');
              onVirtualTrigger('r2', Number(e.target.value) / 100);
            }}
            onPointerUp={() => onVirtualTrigger('r2', 0)}
            className="studio-slider w-full max-w-[140px]"
          />
          <button
            type="button"
            onClick={() => onSelectButton('r2')}
            className={`font-mono text-xs font-medium whitespace-nowrap transition-colors ${
              isSelected('r2') ? 'text-[#60A5FA]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            R2 {Math.round(r2Val * 100)}%
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 760 460"
        className="w-full max-w-[740px] select-none"
        role="img"
        aria-label={isPS5 ? 'PlayStation 5 DualSense Interactive Schematic' : 'PlayStation 4 DualShock 4 Interactive Schematic'}
      >
        <defs>
          <linearGradient id="ds5Shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E2533" />
            <stop offset="100%" stopColor="#131822" />
          </linearGradient>
          <linearGradient id="ds4Shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#191F2B" />
            <stop offset="100%" stopColor="#10141C" />
          </linearGradient>
          <filter id="ledGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* L2 & R2 Trigger Housings */}
        <g {...bindHandlers('l2')}>
          <path
            d="M 162 84 C 166 56, 186 44, 212 44 C 236 44, 250 56, 254 84 Z"
            fill={getFill('l2', '#171E2B')}
            stroke={getStroke('l2', '#334155')}
            strokeWidth={isSelected('l2') ? 2 : 1.5}
          />
          <path
            d="M 162 84 C 166 56, 186 44, 212 44 C 236 44, 250 56, 254 84 Z"
            fill="#2E90FA"
            opacity={l2Val * 0.45}
          />
          <text x="208" y="68" textAnchor="middle" fill="#CBD5E1" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="600">
            L2
          </text>
        </g>

        <g {...bindHandlers('r2')}>
          <path
            d="M 506 84 C 510 56, 524 44, 548 44 C 574 44, 594 56, 598 84 Z"
            fill={getFill('r2', '#171E2B')}
            stroke={getStroke('r2', '#334155')}
            strokeWidth={isSelected('r2') ? 2 : 1.5}
          />
          <path
            d="M 506 84 C 510 56, 524 44, 548 44 C 574 44, 594 56, 598 84 Z"
            fill="#2E90FA"
            opacity={r2Val * 0.45}
          />
          <text x="552" y="68" textAnchor="middle" fill="#CBD5E1" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="600">
            R2
          </text>
        </g>

        {/* L1 & R1 Bumpers */}
        <g {...bindHandlers('l1')}>
          <path
            d="M 152 106 C 156 88, 178 82, 212 82 C 244 82, 260 88, 264 106 Z"
            fill={getFill('l1', '#1B2332')}
            stroke={getStroke('l1', '#3B485E')}
            strokeWidth={isSelected('l1') ? 2 : 1.5}
          />
          <text x="208" y="99" textAnchor="middle" fill="#E2E8F0" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="600">
            L1
          </text>
        </g>

        <g {...bindHandlers('r1')}>
          <path
            d="M 496 106 C 500 88, 516 82, 548 82 C 582 82, 604 88, 608 106 Z"
            fill={getFill('r1', '#1B2332')}
            stroke={getStroke('r1', '#3B485E')}
            strokeWidth={isSelected('r1') ? 2 : 1.5}
          />
          <text x="552" y="99" textAnchor="middle" fill="#E2E8F0" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="600">
            R1
          </text>
        </g>

        {/* Main Controller Chassis */}
        {isPS5 ? (
          <>
            {/* DualSense Sculpted Outer Shell */}
            <path
              d="M 142 126
                 C 146 102, 200 96, 272 106
                 L 488 106
                 C 560 96, 614 102, 618 126
                 C 634 190, 654 295, 636 376
                 C 626 418, 586 430, 558 408
                 C 530 386, 514 338, 492 316
                 L 268 316
                 C 246 338, 230 386, 202 408
                 C 174 430, 134 418, 124 376
                 C 106 295, 126 190, 142 126 Z"
              fill="url(#ds5Shell)"
              stroke="#2C374B"
              strokeWidth="2"
            />
            {/* DualSense Center Obsidian Trim */}
            <path
              d="M 248 232
                 L 292 232
                 C 314 232, 326 244, 332 268
                 L 340 316
                 L 420 316
                 L 428 268
                 C 434 244, 446 232, 468 232
                 L 512 232
                 L 492 316
                 L 268 316 Z"
              fill="#0B0F17"
              stroke="#1E293B"
              strokeWidth="1.2"
            />
          </>
        ) : (
          <>
            {/* DualShock 4 Classic Silhouette */}
            <path
              d="M 150 128
                 C 156 104, 208 98, 274 106
                 L 486 106
                 C 552 98, 604 104, 610 128
                 C 624 188, 640 286, 622 364
                 C 612 406, 574 418, 548 398
                 C 522 378, 506 334, 488 312
                 L 272 312
                 C 254 334, 238 378, 212 398
                 C 186 418, 148 406, 138 364
                 C 120 286, 136 188, 150 128 Z"
              fill="url(#ds4Shell)"
              stroke="#2A3446"
              strokeWidth="2"
            />
            {/* DS4 Top Lightbar Glow */}
            <rect
              x="312"
              y="103"
              width="136"
              height="5"
              rx="2.5"
              fill={lightbarColor}
              filter="url(#ledGlow)"
            />
          </>
        )}

        {/* Touchpad */}
        <g {...bindHandlers('touchpad')}>
          <path
            d={
              isPS5
                ? 'M 282 110 L 478 110 L 468 206 C 466 214, 460 218, 452 218 L 308 218 C 300 218, 294 214, 292 206 Z'
                : 'M 288 114 L 472 114 L 468 206 C 467 212, 461 216, 454 216 L 306 216 C 299 216, 293 212, 292 206 Z'
            }
            fill={getFill('touchpad', '#121824')}
            stroke={getStroke('touchpad', '#2E3A4F')}
            strokeWidth={isSelected('touchpad') ? 2 : 1.5}
          />
          {/* Subtle Touchpad Micro-Grid */}
          <circle cx="380" cy="164" r="2" fill="#334155" />
          <circle cx="364" cy="164" r="1.5" fill="#263144" />
          <circle cx="396" cy="164" r="1.5" fill="#263144" />
          <text x="380" y="144" textAnchor="middle" fill="#64748B" fontSize="10" fontFamily="JetBrains Mono, monospace">
            TOUCHPAD
          </text>
        </g>

        {/* DualSense Flanking Lightbars */}
        {isPS5 && (
          <>
            <path
              d="M 278 112 L 289 208"
              stroke={lightbarColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#ledGlow)"
            />
            <path
              d="M 482 112 L 471 208"
              stroke={lightbarColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#ledGlow)"
            />
          </>
        )}

        {/* Create / Share Button */}
        <g {...bindHandlers('share')}>
          <rect
            x="248"
            y="128"
            width="16"
            height="30"
            rx="8"
            transform="rotate(-12 256 143)"
            fill={getFill('share', '#1B2332')}
            stroke={getStroke('share', '#3B485E')}
            strokeWidth={isSelected('share') ? 2 : 1.4}
          />
          <text x="234" y="122" textAnchor="end" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
            {isPS5 ? 'CREATE' : 'SHARE'}
          </text>
        </g>

        {/* Options Button */}
        <g {...bindHandlers('options')}>
          <rect
            x="496"
            y="128"
            width="16"
            height="30"
            rx="8"
            transform="rotate(12 504 143)"
            fill={getFill('options', '#1B2332')}
            stroke={getStroke('options', '#3B485E')}
            strokeWidth={isSelected('options') ? 2 : 1.4}
          />
          <text x="526" y="122" textAnchor="start" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
            OPTIONS
          </text>
        </g>

        {/* PS Home Button */}
        <g {...bindHandlers('ps')}>
          <circle
            cx="380"
            cy="264"
            r="15"
            fill={getFill('ps', '#161D29')}
            stroke={getStroke('ps', '#3B485E')}
            strokeWidth={isSelected('ps') ? 2 : 1.5}
          />
          <text x="380" y="268" textAnchor="middle" fill="#E2E8F0" fontSize="10" fontFamily="Outfit, sans-serif" fontWeight="700">
            PS
          </text>
        </g>

        {/* Mute Button (DualSense) / Ext Button (DS4) */}
        <g {...bindHandlers('mute')}>
          <rect
            x="366"
            y="292"
            width="28"
            height="10"
            rx="5"
            fill={getFill('mute', '#1A2230')}
            stroke={getStroke('mute', '#3B485E')}
            strokeWidth={isSelected('mute') ? 2 : 1.3}
          />
          <text x="380" y="314" textAnchor="middle" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace">
            {isPS5 ? 'MUTE' : 'EXT'}
          </text>
        </g>

        {/* D-Pad Cluster */}
        <g>
          <circle cx="204" cy="204" r="48" fill="#10151E" stroke="#1E2838" strokeWidth="1.2" />
          {/* Up */}
          <g {...bindHandlers('dpad-up')}>
            <path
              d="M 190 162 L 218 162 L 218 190 L 204 201 L 190 190 Z"
              fill={getFill('dpad-up', '#1E2736')}
              stroke={getStroke('dpad-up', '#3B485E')}
              strokeWidth={isSelected('dpad-up') ? 2 : 1.3}
            />
            <path d="M 204 171 L 198 180 L 210 180 Z" fill="#94A3B8" />
          </g>
          {/* Down */}
          <g {...bindHandlers('dpad-down')}>
            <path
              d="M 190 218 L 204 207 L 218 218 L 218 246 L 190 246 Z"
              fill={getFill('dpad-down', '#1E2736')}
              stroke={getStroke('dpad-down', '#3B485E')}
              strokeWidth={isSelected('dpad-down') ? 2 : 1.3}
            />
            <path d="M 204 237 L 198 228 L 210 228 Z" fill="#94A3B8" />
          </g>
          {/* Left */}
          <g {...bindHandlers('dpad-left')}>
            <path
              d="M 162 190 L 190 190 L 201 204 L 190 218 L 162 218 Z"
              fill={getFill('dpad-left', '#1E2736')}
              stroke={getStroke('dpad-left', '#3B485E')}
              strokeWidth={isSelected('dpad-left') ? 2 : 1.3}
            />
            <path d="M 171 204 L 180 198 L 180 210 Z" fill="#94A3B8" />
          </g>
          {/* Right */}
          <g {...bindHandlers('dpad-right')}>
            <path
              d="M 218 190 L 246 190 L 246 218 L 218 218 L 207 204 Z"
              fill={getFill('dpad-right', '#1E2736')}
              stroke={getStroke('dpad-right', '#3B485E')}
              strokeWidth={isSelected('dpad-right') ? 2 : 1.3}
            />
            <path d="M 237 204 L 228 198 L 228 210 Z" fill="#94A3B8" />
          </g>
        </g>

        {/* Face Buttons Cluster */}
        <g>
          <circle cx="556" cy="204" r="52" fill="#10151E" stroke="#1E2838" strokeWidth="1.2" />

          {/* Triangle */}
          <g {...bindHandlers('triangle')}>
            <circle
              cx="556"
              cy="166"
              r="17"
              fill={getFill('triangle', '#1E2736')}
              stroke={getStroke('triangle', '#3B485E')}
              strokeWidth={isSelected('triangle') ? 2 : 1.4}
            />
            <polygon
              points="556,158 548,172 564,172"
              fill="none"
              stroke="#34D399"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>

          {/* Circle */}
          <g {...bindHandlers('circle')}>
            <circle
              cx="594"
              cy="204"
              r="17"
              fill={getFill('circle', '#1E2736')}
              stroke={getStroke('circle', '#3B485E')}
              strokeWidth={isSelected('circle') ? 2 : 1.4}
            />
            <circle
              cx="594"
              cy="204"
              r="7.5"
              fill="none"
              stroke="#FB7185"
              strokeWidth="2"
            />
          </g>

          {/* Cross */}
          <g {...bindHandlers('cross')}>
            <circle
              cx="556"
              cy="242"
              r="17"
              fill={getFill('cross', '#1E2736')}
              stroke={getStroke('cross', '#3B485E')}
              strokeWidth={isSelected('cross') ? 2 : 1.4}
            />
            <path
              d="M 550 236 L 562 248 M 562 236 L 550 248"
              stroke="#60A5FA"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>

          {/* Square */}
          <g {...bindHandlers('square')}>
            <circle
              cx="518"
              cy="204"
              r="17"
              fill={getFill('square', '#1E2736')}
              stroke={getStroke('square', '#3B485E')}
              strokeWidth={isSelected('square') ? 2 : 1.4}
            />
            <rect
              x="511.5"
              y="197.5"
              width="13"
              height="13"
              rx="1.5"
              fill="none"
              stroke="#F472B6"
              strokeWidth="2"
            />
          </g>
        </g>

        {/* Left Thumbstick (L3 + live XY vector) */}
        <g>
          <circle
            cx="270"
            cy="278"
            r="38"
            fill="#0A0E15"
            stroke={getStroke('l3', '#2B3649')}
            strokeWidth={isSelected('l3') ? 2 : 1.5}
          />
          <circle cx="270" cy="278" r="28" fill="none" stroke="#1E293B" strokeDasharray="3 3" />
          <circle
            cx={270 + liveInput.leftStick.x * 22}
            cy={278 + liveInput.leftStick.y * 22}
            r="22"
            fill={getFill('l3', '#1E2736')}
            stroke={getStroke('l3', '#475569')}
            strokeWidth="2"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectButton('l3');
              setDraggingStick('left');
              (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
              onVirtualButton('l3', true);
            }}
            onPointerMove={(e) => {
              if (draggingStick === 'left') handleStickPointer('left', e);
            }}
            onPointerUp={(e) => {
              if (draggingStick === 'left') {
                setDraggingStick(null);
                (e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId);
                onVirtualStick('left', 0, 0);
                onVirtualButton('l3', false);
              }
            }}
          />
          <text
            x={270 + liveInput.leftStick.x * 22}
            y={282 + liveInput.leftStick.y * 22}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            className="pointer-events-none"
          >
            L3
          </text>
        </g>

        {/* Right Thumbstick (R3 + live XY vector) */}
        <g>
          <circle
            cx="490"
            cy="278"
            r="38"
            fill="#0A0E15"
            stroke={getStroke('r3', '#2B3649')}
            strokeWidth={isSelected('r3') ? 2 : 1.5}
          />
          <circle cx="490" cy="278" r="28" fill="none" stroke="#1E293B" strokeDasharray="3 3" />
          <circle
            cx={490 + liveInput.rightStick.x * 22}
            cy={278 + liveInput.rightStick.y * 22}
            r="22"
            fill={getFill('r3', '#1E2736')}
            stroke={getStroke('r3', '#475569')}
            strokeWidth="2"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectButton('r3');
              setDraggingStick('right');
              (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
              onVirtualButton('r3', true);
            }}
            onPointerMove={(e) => {
              if (draggingStick === 'right') handleStickPointer('right', e);
            }}
            onPointerUp={(e) => {
              if (draggingStick === 'right') {
                setDraggingStick(null);
                (e.currentTarget as SVGCircleElement).releasePointerCapture(e.pointerId);
                onVirtualStick('right', 0, 0);
                onVirtualButton('r3', false);
              }
            }}
          />
          <text
            x={490 + liveInput.rightStick.x * 22}
            y={282 + liveInput.rightStick.y * 22}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            className="pointer-events-none"
          >
            R3
          </text>
        </g>

        {/* Precision Perimeter Callout Labels for Mapped Outputs */}
        {renderCallout('l1', 135, 96, 'left')}
        {renderCallout('r1', 625, 96, 'right')}
        {renderCallout('dpad-up', 142, 166, 'left')}
        {renderCallout('dpad-left', 142, 208, 'left')}
        {renderCallout('dpad-down', 142, 248, 'left')}
        {renderCallout('triangle', 620, 166, 'right')}
        {renderCallout('circle', 626, 208, 'right')}
        {renderCallout('cross', 620, 248, 'right')}
        {renderCallout('l3', 270, 336, 'center')}
        {renderCallout('r3', 490, 336, 'center')}
        {renderCallout('touchpad', 380, 186, 'center')}
      </svg>

      {/* Bottom Axis Telemetry Strip */}
      <div className="mt-2 flex w-full max-w-[680px] flex-wrap items-center justify-between gap-4 border-t border-[#1D2533] pt-3 text-xs text-slate-400">
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-slate-500">LS</span>
          <span>
            X {liveInput.leftStick.x >= 0 ? '+' : ''}
            {liveInput.leftStick.x.toFixed(2)}
          </span>
          <span>
            Y {liveInput.leftStick.y >= 0 ? '+' : ''}
            {liveInput.leftStick.y.toFixed(2)}
          </span>
        </div>

        <div className="text-slate-500 hidden md:block">
          Drag L3 / R3 thumbsticks or click any button to simulate hardware input
        </div>

        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-slate-500">RS</span>
          <span>
            X {liveInput.rightStick.x >= 0 ? '+' : ''}
            {liveInput.rightStick.x.toFixed(2)}
          </span>
          <span>
            Y {liveInput.rightStick.y >= 0 ? '+' : ''}
            {liveInput.rightStick.y.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
