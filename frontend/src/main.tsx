import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import './index.css'
import { initAuthFromStorage, useAuthStore } from './store/authStore'
import { applyReduceMotion, loadPreferences } from './utils/preferences'

initAuthFromStorage()
applyReduceMotion(loadPreferences(useAuthStore.getState().user?.id).reduceMotion)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
