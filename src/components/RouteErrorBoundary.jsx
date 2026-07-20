import React from 'react'
import { ErrorState } from './PageState'

export class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[route-error]', { error, componentStack: info.componentStack })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <ErrorState
            message={this.state.error?.message || 'Falha inesperada nesta aba.'}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      )
    }
    return this.props.children
  }
}
