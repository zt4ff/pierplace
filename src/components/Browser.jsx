import { useState } from 'react';
import { ArrowRight, ExternalLink, Home } from 'lucide-react';

export default function Browser({ onLearn }) {
  const [address, setAddress] = useState('PierPlace://home');
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  function goHome() {
    setUrl(null);
    setAddress('PierPlace://home');
    setError('');
  }
  function navigate(event) {
    event.preventDefault();
    if (address.trim() === 'PierPlace://home') return goHome();
    try {
      const next = new URL(address.includes('://') ? address.trim() : `https://${address.trim()}`);
      if (next.protocol !== 'https:' || next.username || next.password) throw new Error('Invalid address');
      setUrl(next.href);
      setAddress(next.href);
      setError('');
    } catch {
      setError('Enter a valid HTTPS website address, or PierPlace://home.');
    }
  }
  return <div className="browser-app">
    <form className="browser-toolbar" onSubmit={navigate}>
      <button type="button" className="icon-button" aria-label="Browser home" onClick={goHome}><Home size={18} /></button>
      <input aria-label="Website address" value={address} onChange={event => setAddress(event.target.value)} autoComplete="off" spellCheck={false} />
      <button type="submit" className="icon-button" aria-label="Go to website"><ArrowRight size={18} /></button>
    </form>
    {error && <p className="browser-notice" role="alert">{error}</p>}
    {url ? <>
      <p className="browser-notice">Some websites block embedded browsing. <a href={url} target="_blank" rel="noopener noreferrer">Open in a new tab <ExternalLink size={12} /></a></p>
      <iframe className="browser-page" title="Browser website" src={url} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />
    </> : <div className="learning-content browser-home">
      <p className="eyebrow">PierPlace BROWSER</p>
      <h2>Your next idea is one click away.</h2>
      <p>Explore campus lessons, or enter an HTTPS address above to visit a website.</p>
      <button type="button" className="lesson-card" onClick={onLearn}><span><strong>Learn something little</strong><small>HTML, CSS, design, and a place to start.</small></span><ArrowRight size={20} /></button>
      <p className="browser-notice">External websites use your internet connection and receive normal browsing requests. Your campus notes and code are not sent to them.</p>
    </div>}
  </div>;
}
