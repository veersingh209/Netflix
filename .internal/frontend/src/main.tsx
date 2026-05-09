import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { NetflixProvider } from './hooks/useNetflixStore'
import App from './components/layout/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NetflixProvider>
      <App />
    </NetflixProvider>
  </StrictMode>,
)
