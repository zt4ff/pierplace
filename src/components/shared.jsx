import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Avatar({ profile, className = '' }) {
  const { skin = '#b57c54', hair = '#332c30', shirt = '#548e80', wearId = true } = profile || {};
  return <svg className={`pixel-avatar ${className}`} viewBox="0 0 32 42" shapeRendering="crispEdges" role="img" aria-label="Pixel character">
    <path fill="#00000012" d="M6 38h22v3H6z"/><path fill="#37434b" d="M10 29h6v9h-7v-3h1zm8 0h6v6h1v3h-7z"/>
    <path fill={shirt} d="M8 18h18v13H8zm-3 3h3v9H5zm21 0h3v9h-3z"/><path fill={skin} d="M10 5h14v13H10zm-3 4h3v7H7zm17 0h3v7h-3zM5 28h3v4H5zm21 0h3v4h-3z"/>
    <path fill={hair} d="M10 2h14v3H10zM7 5h20v5H7zm0 5h3v3H7zm17 0h3v3h-3z"/><path fill="#292b32" d="M12 11h2v2h-2zm8 0h2v2h-2z"/><path fill="#8b5340" d="M15 16h4v1h-4z"/>
    {wearId && <><path fill="#ded8be" d="m13 19 4 4 4-4h1l-5 6-5-6z"/><path fill="#fff6df" d="M15 24h5v5h-5z"/><path fill="#d1ad61" d="M16 25h3v1h-3z"/></>}
  </svg>;
}
export function Brand() {
  return <span className="brand"><span className="brand-mark"><svg viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M5 21V3h12v3h3v9h-3v3H9v3zm4-7h7V7H9z"/></svg></span>Pier<span>Place</span><span className="brand-beta">BETA</span></span>;
}
export function Modal({ title, children, onClose, className = '', presentation = 'modal' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement;
    const overflow = document.body.style.overflow;
    const floating = presentation === 'floating';
        if (!floating) document.body.style.overflow = 'hidden';
    const panel = ref.current;
    panel.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || floating) return;
      const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(node => !node.hidden && node.getClientRects().length);
      if (!controls.length) { event.preventDefault(); panel.focus(); return; }
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); if (prior?.isConnected) prior.focus(); };
  }, [presentation]);
  if (presentation === 'floating') return <div className="floating-layer">
    <section ref={ref} className={`floating-panel ${className}`} role="region" aria-label={title} tabIndex={-1}>
      <button className="modal-close icon-button" onClick={onClose} aria-label="Close popup"><X size={20}/></button>{children}
    </section>
  </div>;
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <button className="modal-close icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button>{children}
    </section>
  </div>;
}
export function IdCard({ profile }) {
  return <div className="id-card"><div className="id-card-head"><Brand/><span>CAMPUS PASS</span></div><div className="id-card-body"><div className="id-photo">{profile.photo ? <img src={profile.photo} alt="Your campus ID portrait"/> : <Avatar profile={profile}/>}</div><div className="id-details"><span>CURIOUS MIND / LIFELONG LEARNER</span><h3>{profile.name || 'Your name here'}</h3><p>Member of the PierPlace community</p><strong>ALL FLOORS · ALL POSSIBILITIES</strong></div></div><div className="id-card-foot"><span>YOU BELONG HERE.</span><span className="id-barcode" aria-hidden="true">▎▍▏▌▎▏▍▎▌▏▍▎▏▌▍</span></div></div>;
}
