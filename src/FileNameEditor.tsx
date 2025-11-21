import React, { useRef } from 'react';
import ArrowCounterclockwiseCircleFill from './assets/arrow.counterclockwise.circle.fill.svg?react';

interface FileNameEditorProps {
  value: string;
  originalValue: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  onRestore?: () => void;
}

// --- Token helpers ---
const SIZE_TOKEN = '*size*';
const YYMMDD_TOKEN = '*YYMMDD*';
const DDMMYY_TOKEN = '*DDMMYY*';

function stringContainsSizePattern(text: string): boolean {
  // Match _100x200_ or _100x200 or 100x200_ or 100x200 (word boundaries)
  const regexSizePattern = /(_\d+[xх]\d+_)|(_\d+[xх]\d+$)|(^\d+[xх]\d+_)|(\b\d+[xх]\d+\b)/;
  if (regexSizePattern.test(text)) return true;
  // A-series: A0-A5 with optional h/v
  const regexPaper = /(^|[_\-\s])[AА][0-5][hv]?($|[_\-\s])/;
  return regexPaper.test(text);
}
function stringContainsDatePattern(text: string): boolean {
  // 6 digit date, not part of a longer number
  return /(?<!\d)\d{6}(?!\d)/.test(text);
}
function replaceSizePattern(text: string, token: string): string {
  const regexSizePattern = /(_\d+[xх]\d+_)|(_\d+[xх]\d+$)|(^\d+[xх]\d+_)|(\b\d+[xх]\d+\b)/g;
  let replaced = text.replace(regexSizePattern, token);
  if (replaced !== text) return replaced;
  // Try A-series
  const regexPaper = /(^|[_\-\s])[AА][0-5][hv]?($|[_\-\s])/g;
  return text.replace(regexPaper, token);
}
function replaceFirstDatePattern(text: string, token: string): string {
  const regex = /(?<!\d)\d{6}(?!\d)/;
  return text.replace(regex, token);
}

const FileNameEditor: React.FC<FileNameEditorProps> = ({ value, originalValue, onChange, disabled, onRestore }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Token insert handlers ---
  const insertToken = (token: string) => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const newValue = value.slice(0, start) + token + value.slice(end);
    onChange(newValue);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  // --- Autoreplace handlers ---
  const handleAutoReplaceSize = () => {
    if (stringContainsSizePattern(value)) {
      onChange(replaceSizePattern(value, SIZE_TOKEN));
    }
  };
  const handleAutoReplaceDate = (token: string) => {
    if (stringContainsDatePattern(value)) {
      onChange(replaceFirstDatePattern(value, token));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: 400, maxWidth: '100%', margin: '24px auto 0 auto' }}>
      <label style={{ fontWeight: 500, fontSize: 16, marginBottom: 6, color: 'var(--text-color)' }}>Filename:</label>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: 400,
            fontSize: 16,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--input-border)',
            background: 'var(--input-bg)',
            color: 'var(--text-color)',
            minWidth: 0,
            boxSizing: 'border-box',
            transition: 'border 0.2s',
          }}
          spellCheck={false}
        />
        {value !== originalValue && !disabled && (
          <button
            type="button"
            onClick={() => {
              onRestore && onRestore();
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            style={{
              marginLeft: 8,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--secondary-color)',
              display: 'flex',
              alignItems: 'center',
              fontSize: 20,
            }}
            title="Restore original filename"
          >
            <ArrowCounterclockwiseCircleFill style={{ width: 22, height: 22, display: 'block' }} />
          </button>
        )}
      </div>
      {/* Token hint row and autoreplace buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, width: '100%' }}>
        <span style={{ fontSize: 13, color: 'var(--secondary-color)' }}>Insert:</span>
        <button type="button" style={{ fontSize: 13, color: 'var(--link-color)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }} onClick={() => insertToken(SIZE_TOKEN)}>{SIZE_TOKEN}</button>
        <button type="button" style={{ fontSize: 13, color: 'var(--link-color)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }} onClick={() => insertToken(YYMMDD_TOKEN)}>{YYMMDD_TOKEN}</button>
        <button type="button" style={{ fontSize: 13, color: 'var(--link-color)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }} onClick={() => insertToken(DDMMYY_TOKEN)}>{DDMMYY_TOKEN}</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, width: '100%' }}>
        <span style={{ fontSize: 13, color: 'var(--secondary-color)' }}>Autoreplace:</span>
        <button type="button"
          style={{ fontSize: 13, color: stringContainsSizePattern(value) ? 'var(--link-color)' : 'var(--secondary-color)', background: 'none', border: '1px solid var(--divider)', cursor: stringContainsSizePattern(value) ? 'pointer' : 'not-allowed', padding: '2px 8px', borderRadius: 4 }}
          disabled={!stringContainsSizePattern(value)}
          onClick={handleAutoReplaceSize}
        >Size</button>
        <button type="button"
          style={{ fontSize: 13, color: stringContainsDatePattern(value) ? 'var(--link-color)' : 'var(--secondary-color)', background: 'none', border: '1px solid var(--divider)', cursor: stringContainsDatePattern(value) ? 'pointer' : 'not-allowed', padding: '2px 8px', borderRadius: 4 }}
          disabled={!stringContainsDatePattern(value)}
          onClick={() => handleAutoReplaceDate(YYMMDD_TOKEN)}
        >YYMMDD</button>
        <button type="button"
          style={{ fontSize: 13, color: stringContainsDatePattern(value) ? 'var(--link-color)' : 'var(--secondary-color)', background: 'none', border: '1px solid var(--divider)', cursor: stringContainsDatePattern(value) ? 'pointer' : 'not-allowed', padding: '2px 8px', borderRadius: 4 }}
          disabled={!stringContainsDatePattern(value)}
          onClick={() => handleAutoReplaceDate(DDMMYY_TOKEN)}
        >DDMMYY</button>
      </div>
    </div>
  );
};

export default FileNameEditor; 