import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, Circle, Diamond, Leaf, Moon, Sparkles, Sun, Upload } from 'lucide-react';
import { Avatar, IdCard, Modal } from './shared.jsx';
import { COLORS, DEFAULT_PROFILE, QUESTIONS, isCorrect } from '../state.js';

const PALETTES = [
  { key: 'skin', label: 'Skin tone', names: ['Light peach', 'Warm tan', 'Golden brown', 'Deep brown', 'Rich brown'] },
  { key: 'hair', label: 'Hair color', names: ['Charcoal', 'Chestnut', 'Golden blonde', 'Auburn', 'Silver'] },
  { key: 'shirt', label: 'Shirt color', names: ['Sage green', 'Lavender', 'Terracotta', 'Sky blue', 'Rose'] },
];

function patternLabel(pattern) {
  if (pattern === '?') return 'Missing piece';
  if (pattern.startsWith('block')) {
    const count = Number(pattern.slice(5));
    return `${count} ${count === 1 ? 'block' : 'blocks'}`;
  }
  return pattern.charAt(0).toUpperCase() + pattern.slice(1);
}

function Pattern({ value }) {
  const Icon = { leaf: Leaf, sun: Sun, moon: Moon, diamond: Diamond, circle: Circle }[value];
  if (Icon) return <Icon aria-hidden="true" />;
  if (value.startsWith('block')) {
    return <span className="blocks" aria-hidden="true">{Array.from({ length: Number(value.slice(5)) }, (_, index) => <i key={index} />)}</span>;
  }
  return <span className="pattern-question" aria-hidden="true">?</span>;
}

export default function Onboarding({ initialProfile, editing = false, onComplete, onClose }) {
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...initialProfile }));
  const [step, setStep] = useState(0);
  const [nameError, setNameError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoPending, setPhotoPending] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const upload = useRef({ token: 0, reader: null, image: null, pending: false });
  const completed = useRef(false);
  const fileInput = useRef(null);
  const heading = useRef(null);
  const id = useId();
  const question = QUESTIONS[questionIndex];
  const allCorrect = answers.length === QUESTIONS.length && QUESTIONS.every((item, index) => isCorrect(item, answers[index]));
  const success = !editing && step === 3 && allCorrect;
  const title = success ? 'Your campus is waiting.' : step === 0 ? (editing ? 'Make yourself at home.' : 'Make a little you.') : step === 1 ? 'Your pass to possibility.' : 'A little curiosity goes a long way.';

  function cancelUpload() {
    const current = upload.current;
    current.token += 1;
    current.pending = false;
    if (current.reader) {
      current.reader.onload = current.reader.onerror = current.reader.onabort = null;
      if (current.reader.readyState === 1) current.reader.abort();
      current.reader = null;
    }
    if (current.image) {
      current.image.onload = current.image.onerror = null;
      current.image.src = '';
      current.image = null;
    }
  }

  useEffect(() => () => cancelUpload(), []);
  useEffect(() => { heading.current?.focus(); }, [step, questionIndex]);

  function close() {
    cancelUpload();
    onClose();
  }

  async function finish() {
    const name = profile.name.trim().slice(0, 24);
    if (completed.current || upload.current.pending || !name || (!editing && !success)) return;
    completed.current = true;
    setSaving(true);
    setSaveError('');
    try { await onComplete({ ...profile, name }, answers); }
    catch (error) { completed.current = false; setSaving(false); setSaveError(error.message || 'Could not save your campus pass. Please try again.'); }
  }

  function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    cancelUpload();
    setPhotoPending(false);
    setPhotoError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setPhotoError('Please choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('That photo is a little too large. Choose an image no larger than 5 MB.');
      return;
    }

    const token = upload.current.token;
    const isCurrent = () => upload.current.token === token;
    const fail = () => {
      if (!isCurrent()) return;
      cancelUpload();
      setPhotoPending(false);
      setPhotoError('We couldn’t open that image. Please try another PNG, JPEG, or WebP photo.');
    };
    upload.current.pending = true;
    setPhotoPending(true);
    try {
      const reader = new FileReader();
      upload.current.reader = reader;
      reader.onerror = fail;
      reader.onabort = fail;
      reader.onload = () => {
        if (!isCurrent()) return;
        try {
          if (typeof reader.result !== 'string') { fail(); return; }
          const image = new Image();
          upload.current.image = image;
          image.onerror = fail;
          image.onload = () => {
            if (!isCurrent()) return;
            try {
              if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
              const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
              canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
              const context = canvas.getContext('2d');
              if (!context) { fail(); return; }
              context.fillStyle = '#fffef9';
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              const photo = canvas.toDataURL('image/jpeg', 0.85);
              if (!photo.startsWith('data:image/jpeg;base64,')) { fail(); return; }
              cancelUpload();
              setProfile(previous => ({ ...previous, photo }));
              setPhotoPending(false);
            } catch { fail(); }
          };
          image.src = reader.result;
        } catch { fail(); }
      };
      reader.readAsDataURL(file);
    } catch { fail(); }
  }

  function removePhoto() {
    cancelUpload();
    setPhotoPending(false);
    setPhotoError('');
    setProfile(previous => ({ ...previous, photo: null }));
  }

  function nextProfileStep(event) {
    event.preventDefault();
    const name = profile.name.trim().slice(0, 24);
    if (!name) {
      setNameError('Add a name so your new neighbors know what to call you.');
      return;
    }
    setProfile(previous => ({ ...previous, name }));
    setNameError('');
    setStep(1);
  }

  function nextPhotoStep(event) {
    event.preventDefault();
    if (upload.current.pending) return;
    if (editing) { finish(); return; }
    setQuestionIndex(0);
    setSelected(null);
    setAnswers([]);
    setFeedback(null);
    setStep(2);
  }

  function checkAnswer(event) {
    event.preventDefault();
    if (selected === null) return;
    if (feedback === 'correct') {
      if (questionIndex === QUESTIONS.length - 1) {
        if (allCorrect) setStep(3);
      } else {
        setQuestionIndex(previous => previous + 1);
        setSelected(null);
        setFeedback(null);
      }
      return;
    }
    if (!isCorrect(question, selected)) { setFeedback('incorrect'); return; }
    setAnswers(previous => {
      const next = [...previous];
      next[questionIndex] = selected;
      return next;
    });
    setFeedback('correct');
  }

  return <Modal title={title} presentation={editing ? 'floating' : 'modal'} className={editing ? 'profile-editor-popup' : ''} onClose={() => { if (!saving) close(); }}>
      {saveError && <p className="test-feedback error" role="alert">{saveError}</p>}
    {!success && <>
      <header className="modal-header">
        <p className="eyebrow"><Sparkles size={15} aria-hidden="true" /> {editing ? 'Your campus profile' : 'Welcome to PierPlace'}</p>
        <h2 ref={heading} tabIndex={-1}>{title}</h2>
        <p>{step === 0 ? 'Pick your colors and a name. There’s no right way to be you.' : step === 1 ? 'A campus ID, made yours. A real photo is entirely optional.' : 'Three small visual puzzles. Take your time—there’s no timer, and you can try again.'}</p>
      </header>
      <div className="onboarding-progress" role="img" aria-label={`Step ${Math.min(step + 1, editing ? 2 : 3)} of ${editing ? 2 : 3}: ${['Character and name', 'Campus ID', 'Visual test'][step]}`}>
        {(editing ? ['Character', 'ID'] : ['Character', 'ID', 'Test']).map((label, index) => <span key={label} className={index < step ? 'done' : index === step ? 'active' : ''} />)}
      </div>
    </>}

    {step === 0 && <form onSubmit={nextProfileStep}>
      <div className="onboarding-grid">
        <div className="character-preview">
          <h3>Your campus character</h3>
          <div className="avatar-stage"><Avatar profile={profile} /></div>
          <p>A little pixel person, a whole lot of potential.</p>
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-name`}>What should we call you?</label>
          <input id={`${id}-name`} className="text-input" value={profile.name} maxLength={24} required autoComplete="nickname" placeholder="Your name" aria-invalid={Boolean(nameError)} aria-describedby={`${id}-name-note`} onChange={event => { setProfile(previous => ({ ...previous, name: event.target.value })); setNameError(''); }} />
          <p id={`${id}-name-note`} className="form-note" aria-live="polite">{nameError || 'Up to 24 characters. A first name or nickname is perfect.'}</p>
          {PALETTES.map(({ key, label, names }) => <div className="color-group" key={key}>
            <p id={`${id}-${key}`}>{label}</p>
            <div className="color-options" role="group" aria-labelledby={`${id}-${key}`}>
              {COLORS[key].map((color, index) => <button key={color} type="button" className={`color-swatch${profile[key] === color ? ' selected' : ''}`} style={{ backgroundColor: color }} aria-label={`${label}: ${names[index]}`} title={names[index]} aria-pressed={profile[key] === color} onClick={() => setProfile(previous => ({ ...previous, [key]: color }))} />)}
            </div>
          </div>)}
        </div>
      </div>
      <div className="modal-actions">
        <button className="quiet-button" type="button" onClick={close}>Maybe later</button>
        <button className="primary-button" type="submit" disabled={!profile.name.trim()}>Next: campus ID <ArrowRight size={17} aria-hidden="true" /></button>
      </div>
    </form>}

    {step === 1 && <form onSubmit={nextPhotoStep}>
      <div className="onboarding-grid">
        <div>
          <IdCard profile={profile} />
          <input ref={fileInput} id={`${id}-photo`} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadPhoto} />
          <button type="button" className="upload-button" onClick={() => fileInput.current?.click()} aria-describedby={`${id}-photo-note`}><Upload size={16} aria-hidden="true" /> {profile.photo ? 'Replace photo' : 'Add a real photo'}</button>
          {(profile.photo || photoPending) && <button type="button" className="quiet-button" onClick={removePhoto}>{photoPending ? 'Cancel upload / remove photo' : 'Remove photo'}</button>}
          <p id={`${id}-photo-note`} className="form-note">PNG, JPEG, or WebP · up to 5 MB. Resized on your device.</p>
          <p className={`test-feedback${photoError ? ' error' : ''}`} role="status" aria-live="polite" hidden={!photoPending && !photoError}>{photoError || 'Preparing your photo…'}</p>
        </div>
        <div className="character-preview">
          <h3>Ready for your first day</h3>
          <div className="avatar-stage"><Avatar profile={profile} /></div>
          <label className="checkbox-row"><input type="checkbox" checked={profile.wearId} onChange={event => setProfile(previous => ({ ...previous, wearId: event.target.checked }))} /> Wear my campus ID on my character</label>
          <p>Your photo stays on your ID; your pixel character stays you.</p>
        </div>
      </div>
      <p className="form-note">Your profile is stored on this device by the mock API. Your photo is processed here and is never sent to an external or third-party service.</p>
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={() => { cancelUpload(); setPhotoPending(false); setPhotoError(''); setStep(0); }}>Back</button>
        <button className="primary-button" type="submit" disabled={photoPending || saving}>{saving ? 'Saving…' : editing ? 'Save profile' : 'Next: a little curiosity'} {editing ? <Check size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}</button>
      </div>
    </form>}

    {step === 2 && !editing && <form onSubmit={checkAnswer}>
      <p className="eyebrow">Question {questionIndex + 1} of {QUESTIONS.length}</p>
      <h3 ref={heading} tabIndex={-1}>{question.title}</h3>
      <p className="form-note">{question.hint}</p>
      {question.sequence.length > 0 && <div className="question-sequence" role="group" aria-label="Pattern sequence">
        {question.sequence.map((value, index) => <div className="pattern-tile" role="img" aria-label={`${index + 1}: ${patternLabel(value)}`} key={index}><Pattern value={value} /></div>)}
      </div>}
      <div className="pattern-choices" role="group" aria-label="Choose your answer">
        {question.choices.map((value, index) => <button key={index} type="button" className={`pattern-choice${selected === index ? ' selected' : ''}`} aria-label={`Option ${index + 1}: ${patternLabel(value)}`} aria-pressed={selected === index} disabled={feedback === 'correct'} onClick={() => { setSelected(index); setFeedback(null); }}><Pattern value={value} /><span>Option {index + 1}</span></button>)}
      </div>
      {feedback && <p className={`test-feedback${feedback === 'incorrect' ? ' incorrect' : ''}`} role="status" aria-live="polite">{feedback === 'correct' ? 'That’s it! Nicely spotted.' : 'Not quite—take another look at the pattern. Choose an answer and try again.'}</p>}
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={() => setStep(1)}>Back to my ID</button>
        <button className="primary-button" type="submit" disabled={selected === null}>{feedback === 'correct' ? (questionIndex === QUESTIONS.length - 1 ? 'See my campus pass' : 'Next question') : feedback === 'incorrect' ? 'Try again' : 'Check answer'} <ArrowRight size={17} aria-hidden="true" /></button>
      </div>
    </form>}

    {success && <div className="success-screen">
      <div className="success-badge"><Check aria-hidden="true" /></div>
      <p className="eyebrow"><Sparkles size={15} aria-hidden="true" /> All three patterns solved</p>
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
      <p>Welcome, {profile.name.trim()}. Find a cozy seat, meet a curious mind, and make room for your next big idea.</p>
      <IdCard profile={profile} />
      <button className="primary-button" type="button" onClick={finish} disabled={saving}>{saving ? 'Opening campus…' : 'Enter campus'} <ArrowRight size={17} aria-hidden="true" /></button>
    </div>}
  </Modal>;
}
