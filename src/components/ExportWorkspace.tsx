import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Upload } from 'lucide-react';
import { ControllerProfile } from '../types/controller';
import {
  exportToAHK,
  exportToDS4WindowsXML,
  exportToJSON,
  parseImportedProfile,
} from '../utils/gamepadHardware';

interface ExportWorkspaceProps {
  profile: ControllerProfile;
  onImportProfile: (imported: ControllerProfile) => void;
}

type ExportFormat = 'ds4windows' | 'ahk' | 'json';

export function ExportWorkspace({
  profile,
  onImportProfile,
}: ExportWorkspaceProps) {
  const [format, setFormat] = useState<ExportFormat>('ds4windows');
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string>('');
  const [importSuccess, setImportSuccess] = useState<string>('');

  const { code, filename, mimeType } = useMemo(() => {
    const slug = profile.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (format === 'ds4windows') {
      return {
        code: exportToDS4WindowsXML(profile),
        filename: `${slug || 'dualbridge-profile'}.xml`,
        mimeType: 'application/xml',
      };
    }
    if (format === 'ahk') {
      return {
        code: exportToAHK(profile),
        filename: `${slug || 'dualbridge-profile'}.ahk`,
        mimeType: 'text/plain',
      };
    }
    return {
      code: exportToJSON(profile),
      filename: `${slug || 'dualbridge-profile'}.json`,
      mimeType: 'application/json',
    };
  }, [format, profile]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    setImportSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseImportedProfile(content);
      if (!parsed) {
        setImportError('Invalid DualBridge JSON profile file.');
        return;
      }
      onImportProfile(parsed);
      setImportSuccess(`Imported profile "${parsed.name}".`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Export Config Preview */}
      <section className="lg:col-span-8 rounded-xl border border-[#232C3B] bg-[#111620] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2736] pb-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Export PC Gaming Configuration
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Generate ready-to-load profiles for DS4Windows, AutoHotkey v2, or DualBridge JSON backup.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#263144] bg-[#161D29] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2E90FA] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D7CE0] whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Download {filename.split('.').pop()?.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Format Tabs */}
        <div className="mt-4 flex items-center gap-1 rounded-lg bg-[#0A0D12] p-1 border border-[#1E2736] w-fit">
          <button
            type="button"
            onClick={() => setFormat('ds4windows')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              format === 'ds4windows'
                ? 'bg-[#1D283A] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DS4Windows (.xml)
          </button>
          <button
            type="button"
            onClick={() => setFormat('ahk')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              format === 'ahk'
                ? 'bg-[#1D283A] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AutoHotkey v2 (.ahk)
          </button>
          <button
            type="button"
            onClick={() => setFormat('json')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              format === 'json'
                ? 'bg-[#1D283A] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DualBridge (.json)
          </button>
        </div>

        <pre className="mt-4 max-h-[460px] overflow-auto rounded-lg border border-[#1E2736] bg-[#0A0D12] p-4 font-mono text-xs leading-relaxed text-slate-300">
          <code>{code}</code>
        </pre>
      </section>

      {/* Right: Import + PC Connectivity Guide */}
      <aside className="lg:col-span-4 space-y-6">
        <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6">
          <h3 className="font-display text-base font-semibold text-white">
            Import Saved Profile
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Restore a previously exported DualBridge `.json` configuration into your active profile switcher.
          </p>

          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#2E3A4E] bg-[#0A0D12] px-4 py-5 text-xs font-medium text-slate-300 transition-colors hover:border-[#2E90FA] hover:text-white">
            <Upload className="h-4 w-4 text-[#2E90FA]" />
            <span>Choose DualBridge .json file</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {importError && (
            <p className="mt-3 text-xs font-medium text-rose-400">{importError}</p>
          )}
          {importSuccess && (
            <p className="mt-3 text-xs font-medium text-emerald-400">{importSuccess}</p>
          )}
        </section>

        <section className="rounded-xl border border-[#232C3B] bg-[#111620] p-6 space-y-3">
          <h3 className="font-display text-base font-semibold text-white">
            PC Connectivity Notes
          </h3>
          <div className="space-y-2.5 text-xs leading-relaxed text-slate-400 border-t border-[#1E2736] pt-3">
            <p>
              <strong className="text-slate-200">USB-C Wired (250–1000 Hz):</strong>{' '}
              Plug in your PS5 DualSense or PS4 DualShock 4 via USB, then press any button on the controller to wake browser Gamepad polling.
            </p>
            <p>
              <strong className="text-slate-200">Bluetooth Pairing:</strong>{' '}
              Hold <span className="font-mono text-slate-200">Create/Share + PS</span> for 3 seconds until the lightbar double-flashes, then pair in Windows or macOS Bluetooth settings.
            </p>
            <p>
              <strong className="text-slate-200">Direct WebHID LEDs &amp; Haptics:</strong>{' '}
              Click <span className="text-slate-200">Link Direct HID</span> in the header (Chromium desktop browsers) to push lightbar RGB colors and motor pulses directly to Sony hardware.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}
