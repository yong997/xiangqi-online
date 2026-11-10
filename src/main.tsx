import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installSoundUnlock } from './ui/sound'
import './styles/global.css'

installSoundUnlock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
