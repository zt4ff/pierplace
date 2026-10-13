import { useLayoutEffect, useRef } from 'react';

/** Track world-space objects independently of React renders and camera movement. */
export default function ObjectPopover({ engineRef, objectId, children, className = '', label }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const panel = ref.current;
    let frame;
    let width = panel.offsetWidth;
    let height = panel.offsetHeight;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      width = panel.offsetWidth;
      height = panel.offsetHeight;
    }) : null;
    observer?.observe(panel);
    const position = () => {
      const engine = engineRef.current;
      const object = engine?.layout.objects.find(item => item.id === objectId);
      const anchor = engine?.getObjectScreenPosition(objectId);
      const center = object && engine.worldToScreen(object.x, object.y);
      const visible = Boolean(anchor && (anchor.visible || center?.visible));
      panel.style.visibility = visible ? 'visible' : 'hidden';
      panel.style.pointerEvents = visible ? 'auto' : 'none';
      if (visible) {
        const margin = 12;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const left = Math.max(margin, Math.min(screenWidth - width - margin, anchor.x - width / 2));
        let top = anchor.y - height - 10;
        let below = false;
        if (top < margin + 48) {
          below = true;
          top = engine.worldToScreen(object.x, object.y + object.h / 2 + 8).y;
        }
        top = Math.max(margin, Math.min(screenHeight - height - margin, top));
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
        panel.style.setProperty('--object-arrow', `${Math.max(18, Math.min(width - 18, anchor.x - left))}px`);
        panel.dataset.placement = below ? 'below' : 'above';
      }
      frame = requestAnimationFrame(position);
    };
    position();
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [engineRef, objectId]);
  return <section ref={ref} className={`game-popover game-object-popover ${className}`} aria-label={label} style={{ visibility: 'hidden' }}>{children}</section>;
}
