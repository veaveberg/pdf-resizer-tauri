import React, { useRef, useLayoutEffect, useState } from 'react';

const A_SERIES = [
  { name: 'A0', width: 841, height: 1189 },
  { name: 'A1', width: 594, height: 841 },
  { name: 'A2', width: 420, height: 594 },
  { name: 'A3', width: 297, height: 420 },
  { name: 'A4', width: 210, height: 297 },
  { name: 'A5', width: 148, height: 210 },
  { name: 'A6', width: 105, height: 148 },
];

const MODES = [
  { label: 'Fill', value: 'fill' },
  { label: 'Set Width', value: 'fitHeight' },
  { label: 'Set Height', value: 'fitWidth' },
];

function formatMM(val: number) {
  if (!Number.isFinite(val)) return '';
  return val.toFixed(2).replace('.', ',');
}

function formatMMInput(val: string | number) {
  // For displaying as user types: allow up to 2 decimals, always use comma as separator
  if (typeof val === 'number') val = val.toString();
  val = val.replace('.', ','); // Always use comma
  // If user is typing and ends with separator, preserve it
  const match = val.match(/^(\d+)([.,])?(\d{0,2})?$/);
  if (!match) return val;
  let result = match[1];
  if (typeof match[2] !== 'undefined') result += ','; // Always comma
  if (typeof match[3] !== 'undefined') result += match[3];
  return result;
}

export default function SizeAdjusterCard({
  adjuster,
  onChange,
  onRemove,
  isRemovable,
  aspectRatio,
  SwapIcon,
  RemoveIcon,
}: any) {
  const { mode, width, height } = adjuster;
  // Local state for input fields to allow free typing
  const [widthInput, setWidthInput] = useState(formatMMInput(width));
  const [heightInput, setHeightInput] = useState(formatMMInput(height));

  // Sync local state with props
  React.useEffect(() => {
    setWidthInput(formatMMInput(width));
  }, [width]);
  React.useEffect(() => {
    setHeightInput(formatMMInput(height));
  }, [height]);

  // Helper to parse input to number
  function parseInput(val: string) {
    return Number(val.replace(',', '.'));
  }

  // Handlers
  const handlePreset = (preset: any) => {
    if (preset === 'edit') return; // TODO: handle edit
    // Determine orientation of PDF and preset
    let pdfW = aspectRatio ? aspectRatio : 1;
    let pdfPortrait = pdfW <= 1;
    let presetPortrait = preset.width <= preset.height;
    let width = preset.width;
    let height = preset.height;
    // If orientations don't match, swap preset dimensions
    if (pdfPortrait !== presetPortrait) {
      width = preset.height;
      height = preset.width;
    }
    // Always set fill values to the (possibly swapped) preset
    onChange({ ...adjuster, width, height, mode: 'fill', source: 'pdf' });
  };
  const handleMode = (newMode: any) => {
    if (newMode === 'fitWidth' && aspectRatio) {
      // Set height to current fill height, calculate width
      onChange({ ...adjuster, mode: newMode, height, width: Number((height * aspectRatio).toFixed(2)) });
    } else if (newMode === 'fitHeight' && aspectRatio) {
      // Set width to current fill width, calculate height
      onChange({ ...adjuster, mode: newMode, width, height: Number((width / aspectRatio).toFixed(2)) });
    } else {
      onChange({ ...adjuster, mode: newMode });
    }
  };
  const handleWidth = (e: any) => {
    let val = e.target.value.replace(/[^\d.,]/g, '');
    val = val.replace(/(\d+[.,]\d{0,2}).*/, '$1'); // max 2 decimals
    setWidthInput(val);
    if (/^\d*[.,]?\d{0,2}$/.test(val)) {
      const w = parseInput(val);
      if (!isNaN(w) && val !== '' && val !== '.' && val !== ',') {
        if (mode === 'fitHeight' && aspectRatio) {
          onChange({ ...adjuster, width: w, height: Number((w / aspectRatio).toFixed(2)), source: 'manual' });
        } else {
          onChange({ ...adjuster, width: w, source: 'manual' });
        }
      }
    }
  };
  const handleWidthBlur = () => {
    const w = parseInput(widthInput);
    setWidthInput(Number.isFinite(w) ? formatMM(w) : '');
    if (Number.isFinite(w)) {
      if (mode === 'fitHeight' && aspectRatio) {
        onChange({ ...adjuster, width: w, height: Number((w / aspectRatio).toFixed(2)), source: 'manual' });
      } else {
        onChange({ ...adjuster, width: w, source: 'manual' });
      }
    }
  };
  const handleWidthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    let w = parseInput(widthInput);
    if (!Number.isFinite(w)) w = 0;
    let next = w;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      let step = 1;
      if (e.shiftKey) step = 10;
      if (e.shiftKey) {
        if (e.key === 'ArrowUp') {
          next = Math.ceil(w / 10) * 10;
          if (next === w) next += 10;
        } else {
          next = Math.floor(w / 10) * 10;
          if (next === w) next -= 10;
          if (next < 1) next = 1;
        }
      } else {
        if (e.key === 'ArrowUp') {
          next = Math.ceil(w);
          if (next === w) next += 1;
        } else {
          next = Math.floor(w);
          if (next === w) next -= 1;
          if (next < 1) next = 1;
        }
      }
      setWidthInput(formatMMInput(next));
      if (mode === 'fitHeight' && aspectRatio) {
        onChange({ ...adjuster, width: next, height: Number((next / aspectRatio).toFixed(2)), source: 'manual' });
      } else {
        onChange({ ...adjuster, width: next, source: 'manual' });
      }
      e.preventDefault();
    }
  };
  const handleHeight = (e: any) => {
    let val = e.target.value.replace(/[^\d.,]/g, '');
    val = val.replace(/(\d+[.,]\d{0,2}).*/, '$1'); // max 2 decimals
    setHeightInput(val);
    if (/^\d*[.,]?\d{0,2}$/.test(val)) {
      const h = parseInput(val);
      if (!isNaN(h) && val !== '' && val !== '.' && val !== ',') {
        if (mode === 'fitWidth' && aspectRatio) {
          onChange({ ...adjuster, height: h, width: Number((h * aspectRatio).toFixed(2)), source: 'manual' });
        } else {
          onChange({ ...adjuster, height: h, source: 'manual' });
        }
      }
    }
  };
  const handleHeightBlur = () => {
    const h = parseInput(heightInput);
    setHeightInput(Number.isFinite(h) ? formatMM(h) : '');
    if (Number.isFinite(h)) {
      if (mode === 'fitWidth' && aspectRatio) {
        onChange({ ...adjuster, height: h, width: Number((h * aspectRatio).toFixed(2)), source: 'manual' });
      } else {
        onChange({ ...adjuster, height: h, source: 'manual' });
      }
    }
  };
  const handleHeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    let h = parseInput(heightInput);
    if (!Number.isFinite(h)) h = 0;
    let next = h;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      let step = 1;
      if (e.shiftKey) step = 10;
      if (e.shiftKey) {
        if (e.key === 'ArrowUp') {
          next = Math.ceil(h / 10) * 10;
          if (next === h) next += 10;
        } else {
          next = Math.floor(h / 10) * 10;
          if (next === h) next -= 10;
          if (next < 1) next = 1;
        }
      } else {
        if (e.key === 'ArrowUp') {
          next = Math.ceil(h);
          if (next === h) next += 1;
        } else {
          next = Math.floor(h);
          if (next === h) next -= 1;
          if (next < 1) next = 1;
        }
      }
      setHeightInput(formatMMInput(next));
      if (mode === 'fitWidth' && aspectRatio) {
        onChange({ ...adjuster, height: next, width: Number((next * aspectRatio).toFixed(2)), source: 'manual' });
      } else {
        onChange({ ...adjuster, height: next, source: 'manual' });
      }
      e.preventDefault();
    }
  };
  const handleSwap = () => {
    onChange({ ...adjuster, width: height, height: width, source: 'manual' });
  };

  // Animated segmented control highlight logic
  const segmentedRef = useRef<HTMLDivElement>(null);
  const [thumbStyle, setThumbStyle] = useState({ left: 0, width: 0 });
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useLayoutEffect(() => {
    const idx = MODES.findIndex(m => m.value === mode);
    if (segmentedRef.current && buttonRefs.current[idx]) {
      const containerRect = segmentedRef.current.getBoundingClientRect();
      const btnRect = buttonRefs.current[idx]!.getBoundingClientRect();
      setThumbStyle({
        left: btnRect.left - containerRect.left,
        width: btnRect.width,
      });
    }
  }, [mode]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: 500, margin: '0 auto', marginBottom: 10 }}>
      <div style={{
        background: 'var(--button-bg)',
        borderRadius: 30,
        border: '1px solid rgba(0,0,0,0.13)',
        padding: 18,
        width: 400,
        boxSizing: 'border-box',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, width: '100%', justifyContent: 'space-between' }}>
            {/* Preset dropdown */}
            <select
              value={A_SERIES.find(p => p.width === width && p.height === height)?.name || 'presets'}
              onChange={e => {
                const preset = A_SERIES.find(p => p.name === e.target.value) || (e.target.value === 'edit' ? 'edit' : null);
                handlePreset(preset || 'edit');
              }}
              style={{ padding: '8px 8px', borderRadius: 14, border: '1px solid rgba(0,0,0,0.13)', height: 38, appearance: 'none', background: 'var(--bg-color)', color: 'var(--text-color)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              <option value="presets" disabled>Presets</option>
              {A_SERIES.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
              <option disabled>──────────</option>
              <option value="edit">Edit...</option>
            </select>
            {/* Segmented control with animated thumb */}
            <div
              ref={segmentedRef}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-color)',
                borderRadius: 14,
                padding: 4,
                gap: 4,
                minWidth: 240,
                maxWidth: 240,
                flex: 1,
                position: 'relative',
                border: 'none',
                overflow: 'hidden',
              }}
            >
              {/* Animated highlight */}
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  left: thumbStyle.left,
                  width: thumbStyle.width,
                  height: 'calc(100% - 8px)',
                  background: 'var(--secondary-color)',
                  borderRadius: 10,
                  zIndex: 0,
                  transition: 'left 0.25s cubic-bezier(.4,1.6,.6,1), width 0.25s cubic-bezier(.4,1.6,.6,1)',
                }}
              />
              {MODES.map((m, i) => (
                <button
                  key={m.value}
                  ref={el => { buttonRefs.current[i] = el; }}
                  type="button"
                  onClick={() => handleMode(m.value)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    color: mode === m.value ? '#fff' : 'var(--text-color)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 0',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontSize: 14,
                    position: 'relative',
                    zIndex: 1,
                    transition: 'color 0.2s',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 35, width: '100%', justifyContent: 'space-between' }}>
            <span>Width:</span>
            {mode === 'fitWidth' ? (
              <span style={{ width: 60, textAlign: 'right', color: 'var(--secondary-color)', display: 'inline-block' }}>{formatMM(width)}</span>
            ) : (
              <input
                type="text"
                value={widthInput}
                onChange={handleWidth}
                onBlur={handleWidthBlur}
                onKeyDown={handleWidthKeyDown}
                min={1}
                style={{ width: 60, textAlign: 'right', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, padding: '2px 4px', display: 'inline-block' }}
              />
            )}
            {/* Swap button between width and height */}
            <button
              type="button"
              onClick={handleSwap}
              style={{
                margin: '0 4px',
                opacity: mode === 'fill' ? 1 : 0,
                pointerEvents: mode === 'fill' ? 'auto' : 'none',
                background: 'none',
                border: 'none',
                color: '#000',
                cursor: 'pointer',
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                minWidth: 28,
                minHeight: 28,
              }}
              title="Swap width and height"
            >
              {SwapIcon && <SwapIcon style={{ width: 18, height: 18, display: 'block', color: '#000' }} />}
            </button>
            <span>Height:</span>
            {mode === 'fitHeight' ? (
              <span style={{ width: 60, minWidth: 60, maxWidth: 60, textAlign: 'right', color: 'var(--secondary-color)', display: 'inline-block' }}>{formatMM(height)}</span>
            ) : (
              <input
                type="text"
                value={heightInput}
                onChange={handleHeight}
                onBlur={handleHeightBlur}
                onKeyDown={handleHeightKeyDown}
                min={1}
                style={{ width: 60, minWidth: 60, maxWidth: 60, textAlign: 'right', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, padding: '2px 4px', display: 'inline-block' }}
              />
            )}
          </div>
        </div>
      </div>
      {/* Remove button outside the card, right side, vertically centered */}
      {isRemovable && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            color: 'red',
            background: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            minWidth: 36,
            minHeight: 36,
            height: 36,
            marginBottom: 60
          }}
          title="Remove"
        >
          {RemoveIcon && <RemoveIcon style={{ width: 20, height: 20, display: 'block', color: 'red' }} />}
        </button>
      )}
    </div>
  );
} 