import Dashboard from './pages/Dashboard'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary label="Application">
      <ToastProvider>
        <Dashboard />
      </ToastProvider>
    </ErrorBoundary>
  )
}
