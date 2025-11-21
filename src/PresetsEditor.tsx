import React, { useState, useEffect, useRef } from 'react';
import XMarkCircleFill from './assets/xmark.circle.fill.svg?react'; // Red delete confirm
import MinusCircleFill from './assets/minus.circle.fill.svg?react'; // Grey initial delete
import PlusCircleFill from './assets/plus.circle.fill.svg?react';
import PencilIcon from './assets/pencil.svg?react';

// ... (inside component)



interface Preset {
    name: string;
    width: number;
    height: number;
}

interface PresetsEditorProps {
    presets: Preset[];
    defaultPresets: Preset[];
    onSave: (presets: Preset[]) => void;
    onClose: () => void;
    newPresetState: { name: string; width: string; height: string };
    onNewPresetStateChange: (state: { name: string; width: string; height: string }) => void;
}

export default function PresetsEditor({ presets, defaultPresets, onSave, onClose, newPresetState, onNewPresetStateChange }: PresetsEditorProps) {
    const [items, setItems] = useState(presets);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editWidth, setEditWidth] = useState('');
    const [editHeight, setEditHeight] = useState('');

    // New preset state from props
    const { name: newName, width: newWidth, height: newHeight } = newPresetState;
    const setNewName = (val: string) => onNewPresetStateChange({ ...newPresetState, name: val });
    const setNewWidth = (val: string) => onNewPresetStateChange({ ...newPresetState, width: val });
    const setNewHeight = (val: string) => onNewPresetStateChange({ ...newPresetState, height: val });

    const editInputRef = useRef<HTMLInputElement>(null);

    // Focus input when editing starts
    useEffect(() => {
        if (editingIndex !== null && editInputRef.current) {
            editInputRef.current.focus();
        }
    }, [editingIndex]);

    // Helper to format input as user types (allow digits, one comma/dot, 2 decimals)
    const formatInput = (val: string) => {
        // Remove non-numeric/non-separator chars
        val = val.replace(/[^\d.,]/g, '');
        // Ensure only one separator, convert to comma for display if needed, or keep as is?
        // SizeAdjusterCard uses comma. Let's stick to that.
        val = val.replace('.', ',');
        // Allow only one comma
        const parts = val.split(',');
        if (parts.length > 2) {
            val = parts[0] + ',' + parts.slice(1).join('');
        }
        // Limit decimals to 2
        if (parts.length > 1) {
            val = parts[0] + ',' + parts[1].slice(0, 2);
        }
        return val;
    };

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        setValue: (val: string) => void
    ) => {
        const val = formatInput(e.target.value);
        setValue(val);
    };

    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        value: string,
        setValue: (val: string) => void,
        onEnter: () => void,
        onEscape?: () => void
    ) => {
        if (e.key === 'Enter') {
            onEnter();
            return;
        }
        if (e.key === 'Escape') {
            if (onEscape) onEscape();
            return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            let val = parseFloat(value.replace(',', '.'));
            if (isNaN(val)) val = 0;
            let next = val;

            if (e.shiftKey) {
                if (e.key === 'ArrowUp') {
                    next = Math.ceil(val / 10) * 10;
                    if (next === val) next += 10;
                } else {
                    next = Math.floor(val / 10) * 10;
                    if (next === val) next -= 10;
                    if (next < 1) next = 1;
                }
            } else {
                if (e.key === 'ArrowUp') {
                    next = Math.ceil(val);
                    if (next === val) next += 1;
                } else {
                    next = Math.floor(val);
                    if (next === val) next -= 1;
                    if (next < 1) next = 1;
                }
            }

            let formatted = Number.isInteger(next) ? next.toString() : next.toFixed(2);
            formatted = formatted.replace('.', ',');
            setValue(formatted);
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        if (editingIndex !== null) return; // Disable drag while editing
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedItemIndex === null) return;
        if (draggedItemIndex === index) return;

        const newItems = [...items];
        const draggedItem = newItems[draggedItemIndex];
        newItems.splice(draggedItemIndex, 1);
        newItems.splice(index, 0, draggedItem);
        setItems(newItems);
        setDraggedItemIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
    };

    const handleDeleteClick = (index: number) => {
        if (confirmDeleteIndex === index) {
            // Second click: actually delete
            const newItems = items.filter((_, i) => i !== index);
            setItems(newItems);
            setConfirmDeleteIndex(null);
            if (editingIndex === index) cancelEdit();
        } else {
            // First click: show confirm
            setConfirmDeleteIndex(index);
            // Cancel edit if we start deleting
            if (editingIndex !== null) cancelEdit();
        }
    };

    // Reset confirm delete if clicking elsewhere (handled by not clicking the button)
    // But maybe we want to reset if they click another row?
    // For now, simple logic: clicking the button toggles state.
    // Actually, let's reset confirm if they start editing or dragging.

    const startEdit = (index: number) => {
        setConfirmDeleteIndex(null);
        setEditingIndex(index);
        setEditName(items[index].name);
        setEditWidth(items[index].width.toString());
        setEditHeight(items[index].height.toString());
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditName('');
        setEditWidth('');
        setEditHeight('');
    };

    const saveEdit = (index: number) => {
        const w = parseFloat(editWidth.replace(',', '.'));
        const h = parseFloat(editHeight.replace(',', '.'));
        if (!editName.trim() || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

        const newItems = [...items];
        newItems[index] = {
            name: editName,
            width: w,
            height: h
        };
        setItems(newItems);
        cancelEdit();
    };

    const handleAdd = () => {
        const w = parseFloat(newWidth.replace(',', '.'));
        const h = parseFloat(newHeight.replace(',', '.'));
        if (!newName.trim() || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

        setItems([...items, { name: newName, width: w, height: h }]);
        setNewName('');
        setNewWidth('');
        setNewHeight('');
    };

    const restoreDefaults = () => {
        // Merge defaults: add any missing defaults to the end, or just reset?
        // "Restore A× presets" usually implies bringing them back if deleted.
        // Let's append missing defaults to the list to preserve user custom presets?
        // Or just reset the whole list? "Restore" usually means "Reset to factory".
        // But the user said "if one of the A× presets was removed or altered".
        // Let's find missing ones and append them.

        const currentNames = new Set(items.map(i => i.name));
        const missingDefaults = defaultPresets.filter(d => !currentNames.has(d.name));

        // Also check if they are altered? The prompt says "removed or altered".
        // If altered, we should probably reset them.
        // Let's just merge: keep user custom presets (names not in default), and overwrite/add defaults.
        // Actually, simpler behavior: Add missing defaults. If they exist but are different, maybe update them?
        // Let's just add missing ones for now to avoid destroying user work.

        setItems(prev => {
            const newItems = [...prev];
            defaultPresets.forEach(d => {
                const existingIdx = newItems.findIndex(i => i.name === d.name);
                if (existingIdx === -1) {
                    newItems.push(d);
                } else {
                    // Optional: Reset dimensions if they match name but not size?
                    // Let's assume "Restore" means ensure they exist and are correct.
                    newItems[existingIdx] = d;
                }
            });
            return newItems;
        });
    };

    const isMissingDefaults = () => {
        // Check if any default preset is missing or has different values
        return defaultPresets.some(d => {
            const existing = items.find(i => i.name === d.name);
            if (!existing) return true;
            if (existing.width !== d.width || existing.height !== d.height) return true;
            return false;
        });
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'var(--modal-overlay)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                background: 'var(--modal-bg)',
                borderRadius: 16,
                width: 400,
                maxWidth: '90%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                animation: 'popIn 0.2s ease-out',
                maxHeight: '80vh',
            }}>
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--divider)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--modal-bg)'
                }}>
                    <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-color)' }}>Edit Presets</span>
                    <button
                        onClick={() => { onSave(items); onClose(); }}
                        style={{
                            background: 'none', border: 'none', color: 'var(--border-color-accent)',
                            fontWeight: 600, fontSize: 16, cursor: 'pointer', padding: 0
                        }}
                    >
                        Done
                    </button>
                </div>

                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 0,
                    background: 'var(--modal-bg)'
                }}>
                    {items.map((item, index) => (
                        <div
                            key={`${index}`} // Use index as key to avoid issues when editing name
                            draggable={editingIndex === null}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px 20px',
                                borderBottom: '1px solid var(--divider)',
                                background: draggedItemIndex === index ? 'var(--hover-bg)' : 'transparent',
                                transition: 'background 0.2s'
                            }}
                        >
                            {/* Drag Handle */}
                            <div style={{ marginRight: 12, cursor: editingIndex === null ? 'grab' : 'default', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', opacity: editingIndex === null ? 1 : 0.3 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                                </svg>
                            </div>

                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {editingIndex === index ? (
                                    <>
                                        <input
                                            ref={editInputRef}
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            placeholder="Name"
                                            style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color-accent)', fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-color)' }}
                                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(index); else if (e.key === 'Escape') cancelEdit(); }}
                                        />
                                        <input
                                            value={editWidth}
                                            onChange={e => handleInputChange(e, setEditWidth)}
                                            placeholder="W"
                                            style={{ width: 50, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color-accent)', fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-color)' }}
                                            onKeyDown={e => handleKeyDown(e, editWidth, setEditWidth, () => saveEdit(index), cancelEdit)}
                                        />
                                        <span style={{ color: 'var(--secondary-color)' }}>×</span>
                                        <input
                                            value={editHeight}
                                            onChange={e => handleInputChange(e, setEditHeight)}
                                            placeholder="H"
                                            style={{ width: 50, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color-accent)', fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-color)' }}
                                            onKeyDown={e => handleKeyDown(e, editHeight, setEditHeight, () => saveEdit(index), cancelEdit)}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, color: 'var(--text-color)', fontSize: 16 }}>{item.name}</div>
                                            <div style={{ fontSize: 13, color: 'var(--secondary-color)', marginTop: 2 }}>{item.width} × {item.height} mm</div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {editingIndex === index ? (
                                    <button
                                        onClick={() => saveEdit(index)}
                                        style={{
                                            background: 'var(--secondary-color)', border: 'none', padding: '4px 10px',
                                            borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                                        }}
                                    >
                                        Save
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => startEdit(index)}
                                            style={{
                                                background: 'none', border: 'none', padding: 6,
                                                cursor: 'pointer', color: 'var(--secondary-color)', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center'
                                            }}
                                            title="Edit preset"
                                        >
                                            <PencilIcon style={{ width: 18, height: 18 }} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(index); }}
                                            style={{
                                                background: 'none', border: 'none', padding: 6,
                                                cursor: 'pointer', color: '#FF3B30', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center'
                                            }}
                                            title={confirmDeleteIndex === index ? "Confirm delete" : "Delete preset"}
                                        >
                                            {confirmDeleteIndex === index ? (
                                                <XMarkCircleFill style={{ width: 22, height: 22, color: '#FF3B30' }} />
                                            ) : (
                                                <MinusCircleFill style={{ width: 22, height: 22, color: 'var(--secondary-color)' }} />
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Add New Row */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 20px',
                        borderBottom: '1px solid var(--divider)',
                        background: 'var(--hover-bg)'
                    }}>
                        <div style={{ marginRight: 12, width: 16 }}></div> {/* Spacer for alignment */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="New Preset"
                                style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border)', fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-color)' }}
                                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                            />
                            <input
                                value={newWidth}
                                onChange={e => handleInputChange(e, setNewWidth)}
                                placeholder="W"
                                style={{ width: 50, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border)', fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-color)' }}
                                onKeyDown={e => handleKeyDown(e, newWidth, setNewWidth, handleAdd)}
                            />
                            <span style={{ color: 'var(--secondary-color)' }}>×</span>
                            <input
                                value={newHeight}
                                onChange={e => handleInputChange(e, setNewHeight)}
                                placeholder="H"
                                style={{ width: 50, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--input-border)', fontSize: 14, background: 'var(--input-bg)', color: 'var(--text-color)' }}
                                onKeyDown={e => handleKeyDown(e, newHeight, setNewHeight, handleAdd)}
                            />
                        </div>
                        <button
                            onClick={handleAdd}
                            disabled={!newName || !newWidth || !newHeight}
                            style={{
                                background: 'none', border: 'none', padding: 6,
                                cursor: (!newName || !newWidth || !newHeight) ? 'default' : 'pointer',
                                color: (!newName || !newWidth || !newHeight) ? 'var(--secondary-color)' : 'var(--secondary-color)',
                                display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                marginLeft: 4
                            }}
                            title="Add preset"
                        >
                            <PlusCircleFill style={{ width: 24, height: 24 }} />
                        </button>
                    </div>
                </div>

                {/* Restore Defaults Button */}
                {isMissingDefaults() && (
                    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', textAlign: 'center' }}>
                        <button
                            onClick={restoreDefaults}
                            style={{
                                background: 'none', border: 'none', color: 'var(--secondary-color)',
                                fontSize: 15, fontWeight: 500, cursor: 'pointer'
                            }}
                        >
                            Restore A× presets
                        </button>
                    </div>
                )}
            </div>
            <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
        </div>
    );
}
