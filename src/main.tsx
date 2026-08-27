import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ANALYSIS_SETTINGS_STORAGE_KEY } from './storageKeys'

type ErrorBoundaryState = {
  error: Error | null
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  reloadApp = () => {
    window.location.reload()
  }

  resetWorkspace = () => {
    try {
      window.localStorage.removeItem(ANALYSIS_SETTINGS_STORAGE_KEY)
    } catch {
      // Recovery should still work when storage is unavailable.
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-error-shell" role="alert">
        <section className="app-error-card">
          <p className="app-error-kicker">Web Chess</p>
          <h1>Something went wrong.</h1>
          <p>
            The board could not finish rendering. Reload the app, or reset saved workspace settings if the issue
            started after changing engine or layout controls.
          </p>
          <div className="app-error-actions">
            <button type="button" onClick={this.reloadApp}>Reload</button>
            <button type="button" onClick={this.resetWorkspace}>Reset Workspace</button>
          </div>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
)
