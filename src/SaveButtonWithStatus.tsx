import React, { useState } from 'react';
import CircleDottedCircleFill from './assets/circle.dotted.circle.fill.svg?react';
import CheckmarkCircleFill from './assets/checkmark.circle.fill.svg?react';
import ExclamationmarkTriangleFill from './assets/exclamationmark.triangle.fill.svg?react';
import XmarkCircleFill from './assets/xmark.circle.fill.svg?react';

interface ConflictFile {
  fileName: string;
  isConflict: boolean;
  shouldOverwrite: boolean;
}

interface SaveButtonWithStatusProps {
  status: 'idle' | 'saving' | 'success' | 'conflict' | 'error';
  onClick: () => void;
  disabled?: boolean;
  showPopover: boolean;
  setShowPopover: (show: boolean) => void;
  conflictFiles?: ConflictFile[];
  setConflictFiles?: (files: ConflictFile[]) => void;
  onOverwrite?: () => void;
  onCancel?: () => void;
  onContinue?: () => void;
  errorMessage?: string;
  onErrorAcknowledge?: () => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  idle: <CircleDottedCircleFill style={{ color: 'var(--secondary-color)', width: 28, height: 28, opacity: 0.7, transition: 'opacity 0.3s' }} />,
  saving: <CircleDottedCircleFill style={{ color: 'var(--secondary-color)', width: 28, height: 28, opacity: 0.7, animation: 'spin 1s linear infinite' }} />,
  success: <CheckmarkCircleFill style={{ color: 'green', width: 28, height: 28, opacity: 1, transition: 'opacity 0.3s' }} />,
  conflict: <ExclamationmarkTriangleFill style={{ color: 'orange', width: 28, height: 28, opacity: 1, transition: 'opacity 0.3s' }} />, // Changed to orange for warning
  error: <XmarkCircleFill style={{ color: 'red', width: 28, height: 28, opacity: 1, transition: 'opacity 0.3s' }} />,
};

const SaveButtonWithStatus: React.FC<SaveButtonWithStatusProps> = ({
  status, onClick, disabled, showPopover, setShowPopover,
  conflictFiles = [], setConflictFiles, onOverwrite, onCancel, onContinue,
  errorMessage, onErrorAcknowledge
}) => {
  // Handlers for toggling overwrite
  const handleToggleOverwrite = (idx: number) => {
    if (!setConflictFiles) return;
    setConflictFiles(conflictFiles.map((f, i) => i === idx ? { ...f, shouldOverwrite: !f.shouldOverwrite } : f));
  };

  const hasConflictsToOverwrite = conflictFiles.some(f => f.isConflict && f.shouldOverwrite);
  const hasUnselectedConflicts = conflictFiles.some(f => f.isConflict && !f.shouldOverwrite);

  // Modal content
  let modalContent: React.ReactNode = null;
  if (status === 'conflict') {
    modalContent = (
      <div style={{ padding: 24, minWidth: 340, maxWidth: 420 }}>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 12 }}>File name conflict</div>
        <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 16 }}>
          {conflictFiles.map((f, i) => (
            <div key={f.fileName} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={f.shouldOverwrite}
                  onChange={() => handleToggleOverwrite(i)}
                  style={{ marginRight: 8 }}
                />
                <span style={{
                  flex: 1,
                  color: f.isConflict ? '#222' : '#888',
                  fontSize: 15,
                  backgroundColor: f.isConflict ? 'rgba(255, 255, 0, 0.2)' : 'transparent', // Highlight conflicting files
                  padding: '2px 4px',
                  borderRadius: 4,
                  textAlign: 'left' // Ensure left alignment
                }}>{f.fileName}</span>
              </label>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#eee', color: '#333', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
          {conflictFiles.some(f => f.isConflict && f.shouldOverwrite) ? (
            <button type="button" onClick={onOverwrite} style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#e6b800', color: '#222', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>Overwrite</button>
          ) : (
            <button type="button" onClick={onContinue} style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: 'var(--secondary-color)', color: '#fff', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>Continue</button>
          )}
        </div>
      </div>
    );
  } else if (status === 'error') {
    modalContent = (
      <div style={{ padding: 24, minWidth: 320, maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <ExclamationmarkTriangleFill style={{ color: 'red', width: 24, height: 24, marginRight: 10 }} />
          <span style={{ fontWeight: 600, fontSize: 17 }}>Error</span>
        </div>
        <div style={{ fontSize: 15, color: '#333', marginBottom: 18 }}>{errorMessage || 'An error occurred during export.'}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onErrorAcknowledge} style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: 'var(--secondary-color)', color: '#fff', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>OK</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, width: 220, margin: '32px auto 0 auto' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || status === 'saving'}
        style={{
          width: 160,
          height: 44,
          fontSize: 18,
          fontWeight: 600,
          borderRadius: 10,
          border: 'none',
          background: disabled ? '#ccc' : 'var(--secondary-color)',
          color: '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        Save
      </button>
      <span style={{ display: 'flex', alignItems: 'center', minWidth: 28, minHeight: 28, cursor: (status === 'conflict' || status === 'error') ? 'pointer' : 'default' }}
        onClick={() => (status === 'conflict' || status === 'error') && setShowPopover(true)}
      >
        {statusIcons[status]}
      </span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {showPopover && (status === 'conflict' || status === 'error') && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.18)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 4px 32px rgba(0,0,0,0.18)', minWidth: 320, maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            {modalContent}
            <button onClick={() => setShowPopover(false)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer' }} aria-label="Close">×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaveButtonWithStatus; 