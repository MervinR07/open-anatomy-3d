import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'open-anatomy-3d-react/styles.css'
import './demo.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
