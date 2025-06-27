import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import PDFDropZone from './PDFDropZone'

function App() {
  const [count, setCount] = useState(0)

  return <PDFDropZone />
}

export default App
