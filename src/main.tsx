import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import React from 'react'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV && '__TAURI_IPC__' in window) {
  import('@tauri-apps/api/webviewWindow').then(({ getCurrent }) => {
    getCurrent().openDevtools();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
