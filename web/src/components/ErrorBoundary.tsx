import React from 'react';
interface Props { children: React.ReactNode; label?: string }
export class ErrorBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) return <div className="border border-red-800 rounded-lg p-4 bg-red-950/30"><h3 className="text-sm text-red-400 mb-1">{this.props.label || 'Error'}</h3><p className="text-xs text-red-300 font-mono mb-2">{this.state.error.message}</p><button onClick={() => this.setState({ error: null })} className="text-xs px-3 py-1 rounded border border-red-700 text-red-300 hover:bg-red-900/50">Retry</button></div>;
    return this.props.children;
  }
}
