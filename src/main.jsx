import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

import './styles.css';
import './popups.css';

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('PierPlace render error', error, info); }
  render() {
    if (this.state.failed) return <main className="loading-screen"><h1>Let’s give your campus a fresh start.</h1><p>Something unexpected happened. Your saved progress has not been removed.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload PierPlace</button></main>;
    return this.props.children;
  }
}
const root = createRoot(document.querySelector('#root'));
try {
  // This prototype deliberately uses the mock API in dev AND preview builds.
  const { worker } = await import('./mocks/browser.js');
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true, serviceWorker: { url: '/mockServiceWorker.js' } });
  root.render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
} catch (error) {
  console.error('Could not start the PierPlace mock server', error);
  root.render(<main className="loading-screen"><h1>The campus couldn’t open.</h1><p>The browser mock server requires service workers. Open PierPlace on localhost or HTTPS, and allow service workers.</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></main>);
}
