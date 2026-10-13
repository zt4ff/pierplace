import { useEffect, useRef } from 'react';
import { ArrowRight, BookOpen, CircleHelp, Leaf, Sparkles, Users } from 'lucide-react';
import { Avatar, Brand } from './shared.jsx';
import { drawPreview } from '../world.js';

const STEPS = [
  { number: '01', Icon: Sparkles, title: 'A little curiosity.', text: 'Take a short, playful test. Your next chapter starts with a small first step.' },
  { number: '02', Icon: Users, title: 'A place to belong.', text: 'Make your character, find a seat, and meet the people learning alongside you.' },
  { number: '03', Icon: BookOpen, title: 'Room to grow.', text: 'Explore new ideas, learn at your own pace, and turn a conversation into something great.' },
];

export default function Landing({ admitted, profile, onStart, onEnter, onHelp }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    drawPreview(canvasRef.current);
  }, []);

  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav className="header-actions" aria-label="Main navigation">
          <button className="button button-ghost" type="button" onClick={onHelp}>
            <CircleHelp size={17} aria-hidden="true" /> How it works
          </button>
          {admitted ? (
            <button className="button button-secondary" type="button" onClick={onEnter}>
              <Avatar profile={profile} className="header-avatar" /> Back to campus
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          ) : (
            <button className="button button-secondary" type="button" onClick={onStart}>
              Join the community <ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="landing-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> A little world. A lot of possibility.</p>
            <h1 id="landing-title">Find your people.<br /><span>Build your potential.</span></h1>
            <p className="hero-description">Good things happen when curious minds come together. Step into a cozy campus made for learning, connecting, and becoming a little more you.</p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={admitted ? onEnter : onStart}>
                {admitted ? 'Enter your campus' : 'Take the test'}
                <ArrowRight size={19} aria-hidden="true" />
              </button>
              <span className="hero-note">{admitted ? `Your seat is waiting${profile?.name ? `, ${profile.name}` : ''}.` : 'A small first step. A whole new world.'}</span>
            </div>
            <div className="hero-community">
              <span className="community-icon"><Users size={19} aria-hidden="true" /></span>
              <p>Different minds. Shared ambitions.<br /><strong>Everyone starts somewhere. Start here.</strong></p>
            </div>
          </div>

          <figure className="hero-illustration">
            <div className="illustration-label"><Leaf size={16} aria-hidden="true" /> A space to make yourself at home</div>
            <div className="preview-frame">
              <div className="preview-toolbar" aria-hidden="true">
                <span className="preview-dots"><i /><i /><i /></span>
                <span>pierplace / your next chapter</span>
                <Sparkles size={14} />
              </div>
              <canvas ref={canvasRef} width={1320} height={700} role="img" aria-label="A cozy pixel-art campus with shared tables, quiet desks, beanbags, and people learning together">
                A pixel-art preview of the PierPlace campus, with places to learn, meet, and relax.
              </canvas>
            </div>
            <figcaption className="preview-caption"><span className="status-dot" /> Your people are somewhere in here.</figcaption>
            <div className="illustration-sticker" aria-hidden="true"><Sparkles size={20} /><span>Big ideas.<br />Small pixels.</span></div>
          </figure>
        </section>

        <section className="intro-strip" aria-labelledby="journey-title">
          <div className="intro-heading">
            <p className="eyebrow">From hello to here we go</p>
            <h2 id="journey-title">Your next chapter, in three little steps.</h2>
            <p>No need to have it all figured out. Just bring your curiosity.</p>
          </div>
          <div className="journey-steps">
            {STEPS.map(({ number, Icon, title, text }) => (
              <article className="step-card" key={number}>
                <div className="step-top"><span className="step-number">{number}</span><Icon size={23} aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p><Leaf size={15} aria-hidden="true" /> Made for curious minds and kind hearts.</p>
        <span>PierPlace · A place to begin.</span>
        <button className="text-button" type="button" onClick={onHelp}>Need a hand? <ArrowRight size={14} aria-hidden="true" /></button>
      </footer>
    </div>
  );
}
