import React, { useRef, useState, useEffect } from 'react';
import { GlobalWorkerOptions, getDocument, version as pdfjsVersion } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import SizeAdjusterCard from './SizeAdjusterCard';
import ArrowLeftArrowRight from './assets/arrow.left.arrow.right.svg?react';
import MinusCircleFill from './assets/minus.circle.fill.svg?react';
import PlusCircleFill from './assets/plus.circle.fill.svg?react';
import ArrowCounterclockwiseCircleFill from './assets/arrow.counterclockwise.circle.fill.svg?react';
import ArrowCounterclockwise from './assets/arrow.counterclockwise.svg?react';
import FileNameEditor from './FileNameEditor';
import SaveButtonWithStatus from './SaveButtonWithStatus';
import './pdf-skeleton.css';
import { PDFDocument } from 'pdf-lib';
import { save } from '@tauri-apps/plugin-dialog';
import { writeBinaryFile, exists } from '@tauri-apps/api/fs';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';

// Set the workerSrc to the local bundled worker URL for pdf.js
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const PREVIEW_WIDTH = 250;
const PREVIEW_HEIGHT = 200;
const MM_PER_POINT = 25.4 / 72;

// --- Filename token replacement ---
const SIZE_TOKEN = '*size*';
const YYMMDD_TOKEN = '*YYMMDD*';
const DDMMYY_TOKEN = '*DDMMYY*';

function replaceFilenameTokens(name: string, width: number, height: number) {
  // Ensure tokens are surrounded by underscores if not already
  let result = name
    .replace(/\*size\*/g, '_*size*_')
    .replace(/\*YYMMDD\*/g, '_*YYMMDD*_')
    .replace(/\*DDMMYY\*/g, '_*DDMMYY*_');

  // Remove duplicate underscores from token insertion
  result = result.replace(/_+/g, '_');

  // Replace *size* with e.g. 210x297
  result = result.replace(/_\*size\*_/g, `_${Math.round(width)}x${Math.round(height)}_`);
  // Replace *YYMMDD* and *DDMMYY* with today's date
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  result = result.replace(/_\*YYMMDD\*_/g, `_${y}${m}${d}_`);
  result = result.replace(/_\*DDMMYY\*_/g, `_${d}${m}${y}_`);

  // Remove any double underscores
  result = result.replace(/_+/g, '_');
  // Remove underscores at the start or end
  result = result.replace(/^_+|_+$/g, '');

  return result;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSizePoints(width: number, height: number): string {
  function fmt(val: number) {
    return Number.isInteger(val)
      ? val.toString().replace('.', ',')
      : val.toFixed(1).replace('.', ',');
  }
  return `${fmt(width)} × ${fmt(height)} mm`;
}

function getTrimmedSize(pdfSize: { width: number; height: number } | null, trimMM: number = 0) {
  if (!pdfSize) return null;
  const trimmedWidth = Math.max(pdfSize.width - 2 * trimMM, 1);
  const trimmedHeight = Math.max(pdfSize.height - 2 * trimMM, 1);
  return { width: trimmedWidth, height: trimmedHeight };
}

interface Adjuster {
  id: string;
  mode: string;
  width: number;
  height: number;
  source: string;
}

function PDFDropZone() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [originalFileName, setOriginalFileName] = useState('');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pdfSize, setPdfSize] = useState<{ width: number; height: number } | null>(null);
  const [trim, setTrim] = useState(0); // in mm
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSelection, setPageSelection] = useState<'single' | 'all'>('single');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<any>(null); // store loaded pdf.js doc
  const [adjusters, setAdjusters] = useState<Adjuster[]>([{ id: crypto.randomUUID(), mode: 'fill', width: 210, height: 297, source: 'pdf' }]);
  const [trimInput, setTrimInput] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'conflict' | 'error'>(
    'idle'
  );
  const fadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportFolder, setExportFolder] = useState('');
  const [useSubfolder, setUseSubfolder] = useState(false);
  const [subfolderName, setSubfolderName] = useState('PDF');
  const [showPopover, setShowPopover] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictFiles, setConflictFiles] = useState<Array<{ fileName: string; isConflict: boolean; shouldOverwrite: boolean; originalPath?: string }>>([]);

  // Sync local state with trim
  useEffect(() => {
    setTrimInput(formatTrimInput(trim));
  }, [trim]);

  function formatTrim(val: number): string {
    if (!Number.isFinite(val)) return '';
    return val.toFixed(2).replace('.', ',');
  }
  function formatTrimInput(val: string | number): string {
    if (typeof val === 'number') val = val.toString();
    val = val.replace('.', ',');
    const match = val.match(/^(\d+)([.,])?(\d{0,2})?$/);
    if (!match) return val;
    let result = match[1];
    if (typeof match[2] !== 'undefined') result += ',';
    if (typeof match[3] !== 'undefined') result += match[3];
    return result;
  }
  function parseTrimInput(val: string): number {
    return Number(val.replace(',', '.'));
  }

  // Handle file selection
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pdfFile = files[0];
    if (pdfFile.type !== 'application/pdf') return;
    setFile(pdfFile);
    setFileName(pdfFile.name);
    setOriginalFileName(pdfFile.name);
    setFileSize(pdfFile.size);
    setTrim(0);
    setCurrentPage(0);
    setTotalPages(1);
    setPdfSize(null);
    pdfDocRef.current = null;
    // Set export folder to imported PDF's location (Tauri only, if available)
    if (isTauri && (pdfFile as any).path) {
      const path = (pdfFile as any).path;
      const folder = path.substring(0, path.lastIndexOf('/'));
      setExportFolder(folder);
    }
  };

  // Render PDF preview using pdf.js
  const renderPDFPreview = async (pdfFile: File, pageNum: number) => {
    setIsLoading(true);
    setRenderError(null);
    try {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      const CANVAS_WIDTH = (PREVIEW_WIDTH - 6);
      const CANVAS_HEIGHT = (PREVIEW_HEIGHT - 6);
      canvas.width = CANVAS_WIDTH * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      canvas.style.width = CANVAS_WIDTH + 'px';
      canvas.style.height = CANVAS_HEIGHT + 'px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_WIDTH * dpr, CANVAS_HEIGHT * dpr);
      // const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || '#ECECEC';
      // ctx.fillStyle = bg;
      // ctx.fillRect(0, 0, CANVAS_WIDTH * dpr, CANVAS_HEIGHT * dpr);

      // Load the PDF only once
      let pdf = pdfDocRef.current;
      if (!pdf) {
        try {
          const arrayBuffer = await pdfFile.arrayBuffer();
          pdf = await getDocument({ data: arrayBuffer }).promise;
          pdfDocRef.current = pdf;
          setTotalPages(pdf.numPages);
        } catch (err) {
          console.error('Error loading PDF:', err);
          setRenderError('Failed to load PDF.');
          return;
        }
      }
      // Clamp pageNum
      const pageIndex = Math.max(0, Math.min(pageNum, pdf.numPages - 1));
      let page;
      try {
        page = await pdf.getPage(pageIndex + 1);
      } catch (err) {
        console.error('Error loading PDF page:', err);
        setRenderError('Failed to load PDF page.');
        return;
      }
      // Use the page's rotation property for correct orientation
      const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
      setPdfSize({ width: viewport.width * MM_PER_POINT, height: viewport.height * MM_PER_POINT });
      // Calculate scale to fit the preview area (in device pixels)
      let scale = Math.min(
        (CANVAS_WIDTH * dpr) / viewport.width,
        (CANVAS_HEIGHT * dpr) / viewport.height
      );
      // For large PDFs, render at lower scale
      if (pdfFile.size > 20 * 1024 * 1024) { // 20MB threshold
        scale = scale * 0.5;
      }
      const scaledViewport = page.getViewport({ scale, rotation: page.rotate });
      // Center the PDF page in the canvas
      const offsetX = (CANVAS_WIDTH * dpr - scaledViewport.width) / 2;
      const offsetY = (CANVAS_HEIGHT * dpr - scaledViewport.height) / 2;
      ctx.save();
      ctx.translate(offsetX, offsetY);
      try {
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (err) {
        console.error('Error rendering PDF page:', err);
        setRenderError('Failed to render PDF page.');
        return;
      }
      ctx.restore();
    } finally {
      setIsLoading(false);
    }
  };

  // Use effect to render preview when file, canvas, or currentPage are ready
  useEffect(() => {
    if (file && canvasRef.current) {
      renderPDFPreview(file, currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, currentPage]);

  // Redraw PDF preview on theme change
  useEffect(() => {
    if (!file) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      renderPDFPreview(file, currentPage);
    };
    mql.addEventListener('change', handler);
    return () => {
      mql.removeEventListener('change', handler);
    };
  }, [file, currentPage]);

  // Keyboard navigation for multipage
  useEffect(() => {
    if (!file || totalPages <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentPage > 0) {
        setCurrentPage(p => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight' && currentPage < totalPages - 1) {
        setCurrentPage(p => Math.min(totalPages - 1, p + 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, currentPage, totalPages]);

  // Calculate trimmed size for aspect ratio (avoid redeclaration)
  const trimmedForAspect = trim > 0 && pdfSize ? getTrimmedSize(pdfSize, trim) : pdfSize;
  const aspectRatio = trimmedForAspect ? trimmedForAspect.width / trimmedForAspect.height : 1;

  // Drag and drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };
  const onClick = () => {
    inputRef.current?.click();
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  useEffect(() => {
    if (pdfSize && file) {
      setAdjusters(adjs => {
        if (adjs.length === 1 && (adjs[0].source === 'pdf' || adjs[0].source === 'trimmed')) {
          return [{
            ...adjs[0],
            width: Number(pdfSize.width.toFixed(2)),
            height: Number(pdfSize.height.toFixed(2)),
            source: 'pdf',
          }];
        }
        return adjs;
      });
    }
  }, [pdfSize, file]);

  // Add handlers above the return statement
  const handleSetToPdfDimensions = () => {
    if (!pdfSize) return;
    setAdjusters(adjs => [
      {
        ...adjs[0],
        width: Number(pdfSize.width.toFixed(2)),
        height: Number(pdfSize.height.toFixed(2)),
        source: 'pdf',
      },
      ...adjs.slice(1)
    ]);
  };
  const handleSetToTrimmedDimensions = () => {
    if (!pdfSize) return;
    const trimmedWidth = Math.max(pdfSize.width - 2 * trim, 1);
    const trimmedHeight = Math.max(pdfSize.height - 2 * trim, 1);
    setAdjusters(adjs => [
      {
        ...adjs[0],
        width: Number(trimmedWidth.toFixed(2)),
        height: Number(trimmedHeight.toFixed(2)),
        source: 'trimmed',
      },
      ...adjs.slice(1)
    ]);
  };

  // Update adjusters when aspect ratio changes (e.g., when trim changes)
  useEffect(() => {
    setAdjusters(adjs => adjs.map(adj => {
      if (adj.mode === 'fitHeight' && aspectRatio) {
        return { ...adj, height: Number((adj.width / aspectRatio).toFixed(2)) };
      }
      if (adj.mode === 'fitWidth' && aspectRatio) {
        return { ...adj, width: Number((adj.height * aspectRatio).toFixed(2)) };
      }
      return adj;
    }));
  }, [aspectRatio]);

  // When a new file is loaded, set the filename and original filename
  useEffect(() => {
    if (file) {
      const base = file.name.replace(/\.[^.]+$/, '');
      setFileName(base);
      setOriginalFileName(base);
      // Default export folder to the imported PDF's location (Tauri only)
      // (Moved to handleFiles)
    } else {
      setFileName('');
      setOriginalFileName('');
    }
  }, [file]);

  // Reset status to idle on new file
  useEffect(() => {
    setSaveStatus('idle');
    if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
  }, [file]);

  // If conflict is resolved (filename changed from 'conflict'), fade to idle
  // This useEffect is no longer needed as the popover is dismissed by user action.
  // Keeping it commented out for reference if needed in the future.
  /*
  useEffect(() => {
    if (saveStatus === 'conflict' && fileName.trim().toLowerCase() !== 'conflict') {
      fadeTimeout.current = setTimeout(() => setSaveStatus('idle'), 1200);
    }
  }, [fileName, saveStatus]);
  */

  // If error, reset to idle on new save attempt or new file
  useEffect(() => {
    if (saveStatus === 'error') {
      const reset = () => setSaveStatus('idle');
      return () => reset();
    }
  }, [file, fileName]);

  // Reset saveStatus on export location change
  useEffect(() => {
    if (saveStatus !== 'idle') setSaveStatus('idle');
    // eslint-disable-next-line
  }, [exportFolder, useSubfolder, subfolderName]);

  // Folder picker handler (uses input type="file" with webkitdirectory for now)
  const folderInputRef = useRef<HTMLInputElement>(null);
  const handleFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Use the parent directory of the first file as the folder
      const path = files[0].webkitRelativePath.split('/')[0];
      setExportFolder(path);
    }
  };

  const handlePickFolder = async () => {
    // @ts-ignore
    if (window && window.__TAURI_IPC__) {
      // Running in Tauri
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select export folder',
      });
      if (typeof selected === 'string') {
        setExportFolder(selected);
      }
    } else {
      // Fallback for web: trigger the hidden file input
      folderInputRef.current?.click();
    }
  };

  // Helper to detect Tauri
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_IPC__);

  // Helper function to perform the actual PDF saving
  const performSave = async (folder: string, adjustersToSave: Adjuster[], pagesToProcess: number[], fileToSave: File, baseFileName: string, currentTrim: number, currentPageNum: number, pageSelectionType: 'single' | 'all') => {
    const arrayBuffer = await fileToSave.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);

    for (const adj of adjustersToSave) {
      const newPdf = await PDFDocument.create();
      let pages: number[] = [];
      if (pageSelectionType === 'all') {
        pages = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
      } else {
        pages = [currentPageNum];
      }

      for (const pageIdx of pages) {
        const srcPage = pdfDoc.getPage(pageIdx);
        let { width: srcWidth, height: srcHeight } = srcPage.getSize();
        let cropX = 0, cropY = 0, cropWidth = srcWidth, cropHeight = srcHeight;
        if (currentTrim > 0) {
          const POINTS_PER_MM = 1 / MM_PER_POINT;
          const trimPoints = currentTrim * POINTS_PER_MM;
          cropX = trimPoints;
          cropY = trimPoints;
          cropWidth = Math.max(srcWidth - 2 * trimPoints, 1);
          cropHeight = Math.max(srcHeight - 2 * trimPoints, 1);
        }
        let targetWidth = cropWidth, targetHeight = cropHeight;
        if (adj) {
          const POINTS_PER_MM = 1 / MM_PER_POINT;
          targetWidth = adj.width * POINTS_PER_MM;
          targetHeight = adj.height * POINTS_PER_MM;
        }
        const [embeddedPage] = await newPdf.embedPages([srcPage], [
          {
            left: cropX,
            bottom: cropY,
            right: cropX + cropWidth,
            top: cropY + cropHeight,
          },
        ]);
        let scaleX = 1, scaleY = 1;
        let offsetX = 0, offsetY = 0;

        if (adj.mode === 'fill') {
          const scale = Math.max(targetWidth / cropWidth, targetHeight / cropHeight);
          scaleX = scale;
          scaleY = scale;
          offsetX = (targetWidth - cropWidth * scale) / 2;
          offsetY = (targetHeight - cropHeight * scale) / 2;
        } else { // 'fitWidth' or 'fitHeight' (current stretching behavior)
          scaleX = targetWidth / cropWidth;
          scaleY = targetHeight / cropHeight;
        }

        const newPage = newPdf.addPage([targetWidth, targetHeight]);
        newPage.drawPage(embeddedPage, {
          x: offsetX,
          y: offsetY,
          xScale: scaleX,
          yScale: scaleY,
        });
      }
      const pdfBytes = await newPdf.save();
      const processedFileName = replaceFilenameTokens(baseFileName.trim() ? baseFileName.trim() : 'output', adj.width, adj.height);
      const savePath = folder.replace(/\/+$/, '') + '/' + processedFileName + '.pdf';

      if (isTauri) {
        await writeBinaryFile({ path: savePath, contents: pdfBytes });
      } else {
        // Browser fallback: trigger download
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = processedFileName + '.pdf';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 5000);
      }
    }
  };

  // Tauri-based export handler
  const handleSave = async () => {
    if (!file) return;
    setSaveStatus('saving');
    setErrorMessage(null);
    if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
    try {
      console.log('[Export] Starting export. isTauri:', isTauri);
      let folder = exportFolder;
      if (!folder) {
        const selected = await open({ directory: true, multiple: false, title: 'Select export folder' });
        if (typeof selected === 'string') {
          folder = selected;
          setExportFolder(selected);
        } else {
          setSaveStatus('idle');
          return;
        }
      }
      if (useSubfolder && subfolderName.trim()) {
        folder = folder.replace(/\/+$/, '') + '/' + subfolderName.trim().replace(/\/+$/, '');
      }

      const filePathsToCheck: string[] = [];
      const proposedFiles: Array<{ fileName: string; isConflict: boolean; shouldOverwrite: boolean; originalPath?: string }> = [];

      for (const adj of adjusters) {
        const processedFileName = replaceFilenameTokens(fileName.trim() ? fileName.trim() : 'output', adj.width, adj.height);
        const savePath = folder.replace(/\/+$/, '') + '/' + processedFileName + '.pdf';
        filePathsToCheck.push(savePath);
        proposedFiles.push({
          fileName: processedFileName + '.pdf',
          isConflict: false, // Will be updated after check
          shouldOverwrite: true, // Default to true
          originalPath: savePath,
        });
      }

      if (isTauri) {
        const existenceResults: boolean[] = await invoke('check_file_existence', { filePaths: filePathsToCheck });
        let hasConflicts = false;
        const updatedConflictFiles = proposedFiles.map((file, index) => {
          const isConflict = existenceResults[index];
          if (isConflict) hasConflicts = true;
          return { ...file, isConflict, shouldOverwrite: true }; // Default to overwrite all files
        });

        if (hasConflicts) {
          setConflictFiles(updatedConflictFiles);
          setSaveStatus('conflict');
          setShowPopover(true);
          return; // Stop here, wait for user decision
        }
      }

      // If no conflicts or in browser, proceed with saving
      const pagesToProcess: number[] = pageSelection === 'all'
        ? Array.from({ length: pdfDocRef.current?.numPages || 1 }, (_, i) => i)
        : [currentPage];

      await performSave(folder, adjusters, pagesToProcess, file, fileName, trim, currentPage, pageSelection);
      setSaveStatus('success');
      fadeTimeout.current = setTimeout(() => setSaveStatus('idle'), 5000);

    } catch (err: any) {
      console.error('[Export] Error during export:', err);
      setErrorMessage(err?.message || String(err));
      setSaveStatus('error');
      setShowPopover(true);
    }
  };

  const handleContinueSave = async () => {
    if (!file) return;
    setSaveStatus('saving');
    setShowPopover(false);
    setErrorMessage(null);

    try {
      const adjustersToSave = adjusters.filter((_, idx) => conflictFiles[idx].shouldOverwrite);
      const pagesToProcess: number[] = pageSelection === 'all'
        ? Array.from({ length: pdfDocRef.current?.numPages || 1 }, (_, i) => i)
        : [currentPage];

      let folder = exportFolder;
      if (useSubfolder && subfolderName.trim()) {
        folder = folder.replace(/\/+$/, '') + '/' + subfolderName.trim().replace(/\/+$/, '');
      }

      await performSave(folder, adjustersToSave, pagesToProcess, file, fileName, trim, currentPage, pageSelection);
      setSaveStatus('success');
      fadeTimeout.current = setTimeout(() => setSaveStatus('idle'), 5000);
      setConflictFiles([]); // Clear conflicts after saving
    } catch (err: any) {
      setErrorMessage(err?.message || String(err));
      setSaveStatus('error');
      setShowPopover(true);
    }
  };

  // Handler for canceling overwrite
  const handleCancelOverwrite = () => {
    setSaveStatus('idle');
    setShowPopover(false);
    setConflictFiles([]); // Clear conflicts on cancel
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      minHeight: '100vh',
      width: '100%',
      boxSizing: 'border-box',
      paddingTop: 32,
      background: '#ECECEC',
    }}>
      {/* Title: always show in Tauri */}
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, color: '#222', letterSpacing: 0.5 }}>PDF Resizer</h1>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          border: dragActive ? '1px dashed var(--border-color-accent)' : '1px solid var(--secondary-color)',
          borderRadius: 16,
          background: 'var(--bg-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'border 0.2s',
          position: 'relative',
          boxSizing: 'border-box',
          marginBottom: 0,
          padding: 2,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        {file ? (
          <>
            {isLoading && (
              <div className="pdf-skeleton-loader" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: 16,
                zIndex: 10,
                pointerEvents: 'none',
              }} />
            )}
            {renderError && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red', background: 'rgba(255,255,255,0.8)', zIndex: 20, borderRadius: 16, fontWeight: 600, fontSize: 16 }}>
                {renderError}
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={PREVIEW_WIDTH - 6}
              height={PREVIEW_HEIGHT - 6}
              style={{
                display: 'block',
                background: 'transparent',
                borderRadius: 13,
                pointerEvents: 'none',
                width: '100%',
                height: '100%',
              }}
            />
            {/* Pagination overlay */}
            {totalPages > 1 && (
              <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto',
                zIndex: 3,
                userSelect: 'none',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(0,0,0,0.5)',
                  borderRadius: 8,
                  padding: '0 8px',
                  height: 32,
                  minWidth: 100,
                }}>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setCurrentPage(p => Math.max(0, p - 1)); }}
                    disabled={currentPage === 0}
                    style={{
                      background: 'none',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      width: 28,
                      height: 28,
                      marginRight: 4,
                      cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                      opacity: currentPage === 0 ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    tabIndex={-1}
                    aria-label="Previous page"
                  >
                    ←
                  </button>
                  <span style={{ color: '#fff', fontSize: 15, fontWeight: 500, minWidth: 48, textAlign: 'center', letterSpacing: 0.5 }}>
                    {currentPage + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages - 1, p + 1)); }}
                    disabled={currentPage === totalPages - 1}
                    style={{
                      background: 'none',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      width: 28,
                      height: 28,
                      marginLeft: 4,
                      cursor: currentPage === totalPages - 1 ? 'not-allowed' : 'pointer',
                      opacity: currentPage === totalPages - 1 ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    tabIndex={-1}
                    aria-label="Next page"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setFile(null); setFileName(''); setFileSize(null); setPdfSize(null); setTrim(0); setCurrentPage(0); setTotalPages(1); pdfDocRef.current = null; }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                padding: 0,
                border: 'none',
                background: 'transparent',
                borderRadius: '50%',
                color: 'var(--secondary-color)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
                transition: 'background 0.2s',
                lineHeight: 1,
                textAlign: 'center',
              }}
              aria-label="Close PDF preview"
            >
              <svg width="22" height="22" viewBox="0 0 20.2832 19.9316" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
                <g>
                  <rect height="19.9316" opacity="0" width="20.2832" x="0" y="0"/>
                  <path d="M19.9219 9.96094C19.9219 15.4492 15.459 19.9219 9.96094 19.9219C4.47266 19.9219 0 15.4492 0 9.96094C0 4.46289 4.47266 0 9.96094 0C15.459 0 19.9219 4.46289 19.9219 9.96094ZM12.7051 6.11328L9.96094 8.83789L7.23633 6.12305C7.08008 5.97656 6.9043 5.89844 6.67969 5.89844C6.23047 5.89844 5.87891 6.24023 5.87891 6.69922C5.87891 6.91406 5.95703 7.10938 6.11328 7.26562L8.81836 9.9707L6.11328 12.6855C5.95703 12.832 5.87891 13.0371 5.87891 13.252C5.87891 13.7012 6.23047 14.0625 6.67969 14.0625C6.9043 14.0625 7.10938 13.9844 7.26562 13.8281L9.96094 11.1133L12.666 13.8281C12.8125 13.9844 13.0176 14.0625 13.2422 14.0625C13.7012 14.0625 14.0625 13.7012 14.0625 13.252C14.0625 13.0273 13.9844 12.8223 13.8184 12.6758L11.1133 9.9707L13.8281 7.25586C14.0039 7.08008 14.0723 6.9043 14.0723 6.67969C14.0723 6.23047 13.7109 5.87891 13.2617 5.87891C13.0469 5.87891 12.8711 5.94727 12.7051 6.11328Z" fill="currentColor" fillOpacity="0.85"/>
                </g>
              </svg>
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--secondary-color)', fontSize: 18, userSelect: 'none' }}>
            Drop PDF here or click to select
          </span>
        )}
      </div>
      {/* Filename under preview: always show originalFileName if file is loaded */}
      {file && originalFileName && (
        <div style={{
          marginTop: 12,
          color: 'var(--text-color)',
          fontSize: 16,
          textAlign: 'center',
          width: '100%',
          maxWidth: 'none',
          wordBreak: 'break-all',
          alignSelf: 'center',
        }}>
          {originalFileName}
        </div>
      )}
      {file && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 16 }}>
          <span style={{ color: 'var(--secondary-color)', fontSize: 14 }}>Process:</span>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
            <input
              type="radio"
              checked={pageSelection === 'single'}
              onChange={() => setPageSelection('single')}
              style={{ marginRight: 4 }}
            />
            Single Page
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
            <input
              type="radio"
              checked={pageSelection === 'all'}
              onChange={() => setPageSelection('all')}
              style={{ marginRight: 4 }}
            />
            All Pages
          </label>
        </div>
      )}
      {file && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: 'none',
          margin: '0 auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 8, width: '100%' }}>
            {/* Show PDF dimensions if available */}
            <span style={{ color: 'var(--secondary-color)', fontSize: 14 }}>
              {pdfSize ? formatSizePoints(pdfSize.width, pdfSize.height) : ''}
            </span>
            {/* Pinch button, only if trim is 0 */}
            {trim === 0 && (
              <button type="button" onClick={handleSetToPdfDimensions} style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', marginRight: 0 }} title="Reset size adjuster to PDF dimensions">
                <svg width="18" height="14" viewBox="0 0 22.3773 17.8571" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
                  <g>
                    <rect height="17.8571" opacity="0" width="22.3773" x="0" y="0"/>
                    <path d="M2.46305 0.271327C1.35954 1.53109 0.509927 3.07406 0.0314117 4.68539C-0.212729 5.535 1.03727 5.97445 1.33024 4.99789C1.75016 3.59164 2.50211 2.26351 3.47868 1.15023C4.12321 0.417811 3.10758-0.451329 2.46305 0.271327ZM2.46305 14.2362C3.10758 14.9686 4.12321 14.0995 3.47868 13.3573C2.50211 12.2537 1.75016 10.9256 1.33024 9.51937C1.03727 8.53305-0.212729 8.9725 0.0314117 9.83187C0.509927 11.4432 1.35954 12.9862 2.46305 14.2362Z" fill="currentColor" fillOpacity="0.85"/>
                    <path d="M14.299 17.6248C17.922 17.6248 22.0138 15.3202 22.0138 10.3104C22.0138 7.89828 20.7443 2.60531 19.1037 2.60531C18.8205 2.60531 18.6252 2.78109 18.6935 2.97641L18.9084 3.61117C19.1037 4.20687 18.342 4.45101 18.1173 3.88461L17.7463 2.97641C17.2091 1.67758 15.9396 1.56039 15.2463 1.87289C15.0705 1.96078 15.0412 2.10726 15.1095 2.22445C15.4318 2.80062 15.6955 3.35726 15.9591 3.93344C16.2521 4.58773 15.3634 5.00766 15.0021 4.3143C14.7775 3.87484 14.4845 3.33773 14.1916 2.97641C13.1173 1.57016 11.2912 1.17953 9.30876 1.69711L6.28141 2.48812C4.29899 3.01547 5.1193 5.36898 6.95524 4.98812L9.90446 4.39242C10.8029 4.20687 11.5744 4.43148 12.0041 4.98812C12.6681 5.8768 13.3517 7.25375 13.3517 8.24984C13.3517 9.63656 12.5119 11.2772 10.7443 11.2772C9.87516 11.2772 8.85954 10.8768 7.87321 9.91L5.96891 8.04476C4.79704 6.89242 2.75602 8.39633 4.10368 9.96859L7.31657 13.7381C9.62126 16.4432 11.9552 17.6248 14.299 17.6248Z" fill="currentColor" fillOpacity="0.85"/>
                  </g>
                </svg>
              </button>
            )}
            <span style={{ color: 'var(--secondary-color)', marginLeft: 10, fontSize: 14 }}>Trim:</span>
            <input
              type="text"
              min={0}
              max={20}
              value={trimInput}
              onChange={e => {
                let val = e.target.value.replace(/[^\d.,]/g, '');
                val = val.replace(/(\d+[.,]\d{0,2}).*/, '$1');
                setTrimInput(val);
                if (/^\d*[.,]?\d{0,2}$/.test(val)) {
                  const t = parseTrimInput(val);
                  if (!isNaN(t) && val !== '' && val !== '.' && val !== ',') {
                    setTrim(t);
                    if (pdfSize && adjusters.length > 0 && (adjusters[0].source === 'pdf' || adjusters[0].source === 'trimmed')) {
                      const trimmedWidth = Math.max(pdfSize.width - 2 * t, 1);
                      const trimmedHeight = Math.max(pdfSize.height - 2 * t, 1);
                      setAdjusters(adjs => [
                        {
                          ...adjs[0],
                          width: Number(trimmedWidth.toFixed(2)),
                          height: Number(trimmedHeight.toFixed(2)),
                          source: 'trimmed',
                        },
                        ...adjs.slice(1)
                      ]);
                    }
                  }
                }
              }}
              onBlur={() => {
                const t = parseTrimInput(trimInput);
                setTrimInput(Number.isFinite(t) ? formatTrim(t) : '');
                if (Number.isFinite(t)) setTrim(t);
              }}
              onKeyDown={e => {
                let t = parseTrimInput(trimInput);
                if (!Number.isFinite(t)) t = 0;
                let next = t;
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  let step = 1;
                  if (e.shiftKey) step = 10;
                  if (e.shiftKey) {
                    if (e.key === 'ArrowUp') {
                      next = Math.ceil(t / 10) * 10;
                      if (next === t) next += 10;
                    } else {
                      next = Math.floor(t / 10) * 10;
                      if (next === t) next -= 10;
                      if (next < 0) next = 0;
                    }
                  } else {
                    if (e.key === 'ArrowUp') {
                      next = Math.ceil(t);
                      if (next === t) next += 1;
                    } else {
                      next = Math.floor(t);
                      if (next === t) next -= 1;
                      if (next < 0) next = 0;
                    }
                  }
                  setTrimInput(formatTrimInput(next));
                  setTrim(next);
                  if (pdfSize && adjusters.length > 0 && (adjusters[0].source === 'pdf' || adjusters[0].source === 'trimmed')) {
                    const trimmedWidth = Math.max(pdfSize.width - 2 * next, 1);
                    const trimmedHeight = Math.max(pdfSize.height - 2 * next, 1);
                    setAdjusters(adjs => [
                      {
                        ...adjs[0],
                        width: Number(trimmedWidth.toFixed(2)),
                        height: Number(trimmedHeight.toFixed(2)),
                        source: 'trimmed',
                      },
                      ...adjs.slice(1)
                    ]);
                  }
                  e.preventDefault();
                }
              }}
              style={{ width: 36, fontSize: 14, padding: '2px 2px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'right', marginRight: 0 }}
            />
            {/* Show trimmed size and pinch icon only if trim > 0 */}
            {trimmedForAspect && trim > 0 && (
              <>
                <span style={{ color: 'var(--secondary-color)', fontSize: 14}}>→</span>
                <span style={{ color: 'var(--secondary-color)', fontSize: 14}}>{formatSizePoints(trimmedForAspect.width, trimmedForAspect.height)}</span>
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--secondary-color)' }}>
                  <button type="button" onClick={handleSetToTrimmedDimensions} style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center' }} title="Reset size adjuster to trimmed dimensions">
                    <svg width="18" height="14" viewBox="0 0 22.3773 17.8571" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
                      <g>
                        <rect height="17.8571" opacity="0" width="22.3773" x="0" y="0"/>
                        <path d="M2.46305 0.271327C1.35954 1.53109 0.509927 3.07406 0.0314117 4.68539C-0.212729 5.535 1.03727 5.97445 1.33024 4.99789C1.75016 3.59164 2.50211 2.26351 3.47868 1.15023C4.12321 0.417811 3.10758-0.451329 2.46305 0.271327ZM2.46305 14.2362C3.10758 14.9686 4.12321 14.0995 3.47868 13.3573C2.50211 12.2537 1.75016 10.9256 1.33024 9.51937C1.03727 8.53305-0.212729 8.9725 0.0314117 9.83187C0.509927 11.4432 1.35954 12.9862 2.46305 14.2362Z" fill="currentColor" fillOpacity="0.85"/>
                        <path d="M14.299 17.6248C17.922 17.6248 22.0138 15.3202 22.0138 10.3104C22.0138 7.89828 20.7443 2.60531 19.1037 2.60531C18.8205 2.60531 18.6252 2.78109 18.6935 2.97641L18.9084 3.61117C19.1037 4.20687 18.342 4.45101 18.1173 3.88461L17.7463 2.97641C17.2091 1.67758 15.9396 1.56039 15.2463 1.87289C15.0705 1.96078 15.0412 2.10726 15.1095 2.22445C15.4318 2.80062 15.6955 3.35726 15.9591 3.93344C16.2521 4.58773 15.3634 5.00766 15.0021 4.3143C14.7775 3.87484 14.4845 3.33773 14.1916 2.97641C13.1173 1.57016 11.2912 1.17953 9.30876 1.69711L6.28141 2.48812C4.29899 3.01547 5.1193 5.36898 6.95524 4.98812L9.90446 4.39242C10.8029 4.20687 11.5744 4.43148 12.0041 4.98812C12.6681 5.8768 13.3517 7.25375 13.3517 8.24984C13.3517 9.63656 12.5119 11.2772 10.7443 11.2772C9.87516 11.2772 8.85954 10.8768 7.87321 9.91L5.96891 8.04476C4.79704 6.89242 2.75602 8.39633 4.10368 9.96859L7.31657 13.7381C9.62126 16.4432 11.9552 17.6248 14.299 17.6248Z" fill="currentColor" fillOpacity="0.85"/>
                      </g>
                    </svg>
                  </button>
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {file && (
        <div style={{ width: '100%', maxWidth: 400, margin: '32px auto 0 auto' }}>
          {adjusters.map((adjuster, idx) => (
            <SizeAdjusterCard
              key={adjuster.id}
              adjuster={adjuster}
              onChange={(updated: any) => {
                setAdjusters(adjs => adjs.map((a, i) => i === idx ? { ...a, ...updated } : a));
              }}
              onRemove={() => setAdjusters(adjs => adjs.filter((_, i) => i !== idx))}
              isRemovable={adjusters.length > 1}
              aspectRatio={aspectRatio}
              SwapIcon={ArrowLeftArrowRight}
              RemoveIcon={MinusCircleFill}
            />
          ))}
          <button
            type="button"
            onClick={() => setAdjusters(adjs => {
              const last = adjs[adjs.length - 1];
              return [
                ...adjs,
                { ...last, id: crypto.randomUUID() }
              ];
            })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, margin: '8px auto 0 auto', background: 'none', border: 'none', color: 'black', fontSize: 16, cursor: 'pointer', fontWeight: 500
            }}
          >
            <PlusCircleFill style={{ width: 20, height: 20, display: 'block', color: 'var(--secondary-color)' }} />
            <span style={{ color: 'black' }}>Add Size</span>
          </button>
        </div>
      )}
      {/* Filename Editor Section */}
      {file && (
        <FileNameEditor
          value={fileName}
          originalValue={originalFileName}
          onChange={setFileName}
          disabled={!file}
          onRestore={() => setFileName(originalFileName)}
        />
      )}
      {/* Export location section */}
      {file && isTauri && (
        <div style={{ width: 400, maxWidth: '100%', margin: '24px auto 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <label style={{ fontWeight: 500, fontSize: 16, marginBottom: 6, color: '#222' }}>Export location:</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <button
              type="button"
              onClick={handlePickFolder}
              disabled={!file}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ccc', color: '#222', fontWeight: 500, fontSize: 15, cursor: !file ? 'not-allowed' : 'pointer', width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left', display: 'inline-block' }}
            >
              <span style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}>{exportFolder ? exportFolder : 'Browse…'}</span>
            </button>
            {/* fallback file input for browser */}
            <input
              ref={folderInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFolderPick}
              disabled={!file}
            />
            <label style={{ display: 'flex', alignItems: 'center', fontSize: 15, gap: 2, marginLeft: 6 }}>
              <input
                type="checkbox"
                checked={useSubfolder}
                onChange={e => setUseSubfolder(e.target.checked)}
                disabled={!file}
              />
              Subfolder
            </label>
            <input
              type="text"
              value={subfolderName}
              onChange={e => setSubfolderName(e.target.value)}
              disabled={!file || !useSubfolder}
              style={{ fontSize: 15, borderRadius: 6, border: '1px solid #ccc', padding: '4px 10px', width: 60}}
              placeholder="Subfolder name"
            />
          </div>
        </div>
      )}
      {/* Save Button Section */}
      {file && (
        <SaveButtonWithStatus
          status={saveStatus}
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          showPopover={showPopover}
          setShowPopover={setShowPopover}
          conflictFiles={conflictFiles}
          setConflictFiles={setConflictFiles}
          onOverwrite={handleContinueSave}
          onCancel={handleCancelOverwrite}
          onContinue={handleContinueSave}
          onErrorAcknowledge={() => {
            setShowPopover(false);
            setSaveStatus('idle');
          }}
        />
      )}
    </div>
  );
}

export default PDFDropZone; 