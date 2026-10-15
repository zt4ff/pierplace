import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
	ArrowLeft,
	ArrowRight,
	BatteryFull,
	BookOpen,
	CheckCircle2,
	Code2,
	FileText,
	Folder,
	Globe,
	Headphones,
	Palette,
	Power,
	Save,
	Sparkles,
	StickyNote,
	Terminal,
	Volume2,
	Wifi,
	X,
} from "lucide-react";
import { Modal } from "./shared.jsx";
import Browser from "./Browser.jsx";
import { MusicWindow } from "./Music.jsx";
import "../laptop.css";
import PdfViewer from "./PdfViewer.jsx";

const CodeEditor = lazy(() => import("./CodeEditor.jsx"));
const DESKTOP_APPS = [
	{ id: "browser", title: "Browser", Icon: Globe, color: "#a9c9ed" },
	{ id: "editor", title: "Code editor", Icon: Code2, color: "#b7decf" },
	{ id: "music", title: "Music", Icon: Headphones, color: "#f3d98b" },
	{ id: "pdf", title: "PDF Reader", Icon: FileText, color: "#e1dbe8" },
];
const NOTES_KEY = "PierPlace.laptop.notes.v1";
const WELCOME_TEXT =
	"Welcome to PierPlace!\nLearn a little, take a note, and share an idea with someone at your table.\nYour learning progress is managed by PierPlace; notes stay on this device.";
const TERMINAL_GREETING =
	"PierPlace simulated terminal — no real shell or system access.\nType help to see the available commands.";
const APPS = [
	{ id: "learning", title: "Learning", Icon: BookOpen, color: "#e7ad75" },
	{ id: "notes", title: "Notes", Icon: StickyNote, color: "#f3d98b" },
	{
		id: "terminal",
		title: "Terminal · simulated",
		Icon: Terminal,
		color: "#c7dfbc",
	},
	{ id: "files", title: "Files", Icon: Folder, color: "#a9c9ed" },
];
const LESSONS = [
	{
		id: "welcome",
		title: "Make yourself at home",
		summary: "A small first step into learning together.",
		duration: "3 min",
		file: "welcome.txt",
		Icon: Sparkles,
	},
	{
		id: "web",
		title: "How a web page works",
		summary: "Meet HTML, CSS, and JavaScript.",
		duration: "5 min",
		file: "web-basics.html",
		Icon: Code2,
	},
	{
		id: "design",
		title: "Design for real people",
		summary: "Make your next idea clear and accessible.",
		duration: "4 min",
		file: "design-notes.md",
		Icon: Palette,
	},
];

function readNotes() {
	try {
		const text = window.localStorage.getItem(NOTES_KEY);
		return {
			text: text ?? "",
			status:
				text === null
					? "Notes autosave on this device."
					: "Saved on this device.",
		};
	} catch {
		return {
			text: "",
			status: "Could not load notes. Device storage may be blocked; existing notes have not been changed.",
		};
	}
}

function LessonContent({ id }) {
	if (id === "welcome")
		return (
			<>
				<h3>Start small. Stay curious.</h3>
				<p>
					You do not need to know everything before you begin.
					Learning works best when you try one small thing, notice
					what happens, and reflect on it.
				</p>
				<ol>
					<li>
						<strong>Choose a question.</strong> Make it specific:
						“How does a button get its color?” is easier to explore
						than “How do websites work?”
					</li>
					<li>
						<strong>Try an experiment.</strong> Change one thing at
						a time so you can connect the result to your choice.
					</li>
					<li>
						<strong>Explain what you noticed.</strong> Write a short
						note in this laptop, or share it with someone at a
						campus table.
					</li>
				</ol>
				<h3>Your first tiny challenge</h3>
				<p>
					Open Notes and write one thing you want to learn and one
					step you can take today. Come back here and mark this lesson
					complete when you are ready.
				</p>
			</>
		);
	if (id === "web")
		return (
			<>
				<h3>Three layers, one page</h3>
				<ul>
					<li>
						<strong>HTML gives meaning and structure.</strong> A
						heading, paragraph, link, and button each describe a
						different kind of content.
					</li>
					<li>
						<strong>CSS controls presentation.</strong> Colors,
						spacing, typography, and layouts help people understand
						that content.
					</li>
					<li>
						<strong>JavaScript adds behavior.</strong> It can
						respond to a click, update a counter, or save a note.
					</li>
				</ul>
				<h3>Read a tiny example</h3>
				<pre className="laptop-code-example">
					<code>
						{
							'<h1>Hello, PierPlace!</h1>\n<p>One small step today.</p>\n<button type="button">Say hello</button>\n\n/* CSS */\nbutton {\n  background: #285c50;\n  color: white;\n  padding: 12px 20px;\n}'
						}
					</code>
				</pre>
				<p>
					The heading names the page, the paragraph adds context, and
					the button suggests an action. The CSS makes the button
					recognizable; it does not make it do anything when clicked.
					That needs behavior.
				</p>
				<h3>Think it through</h3>
				<p>
					Which layer would you change to make the button blue? CSS.
					Which layer would you change to add another paragraph? HTML.
					Start with meaningful HTML before adding visual polish.
				</p>
			</>
		);
	return (
		<>
			<h3>Good design makes the next step obvious</h3>
			<p>
				A useful interface helps a person answer three questions: Where
				am I? What can I do? What happened after I did it?
			</p>
			<ul>
				<li>
					<strong>Hierarchy:</strong> use a clear heading and a
					prominent primary action. Avoid making every element compete
					for attention.
				</li>
				<li>
					<strong>Spacing:</strong> group related information together
					and leave room between different tasks.
				</li>
				<li>
					<strong>Contrast:</strong> make text readable against its
					background. Do not rely on color alone to communicate
					success or errors.
				</li>
				<li>
					<strong>Accessibility:</strong> give controls descriptive
					labels, preserve visible keyboard focus, and use real
					buttons for actions.
				</li>
				<li>
					<strong>Feedback:</strong> show when an action succeeds, is
					still working, or needs another attempt.
				</li>
			</ul>
			<h3>Try a quick design review</h3>
			<p>
				Look at the Notes app here. Its label explains what you can
				edit, and its save message tells you whether your work is
				stored. Sketch a signup screen with the same principles: one
				clear heading, labeled fields, and a specific action such as
				“Create account.”
			</p>
			<p>
				Before calling it done, ask: could someone use this with a
				keyboard, and would an error tell them how to recover?
			</p>
		</>
	);
}

export default function Laptop({
	profile,
	lessons = [],
	onCompleteLesson,
	onClose,
}) {
	const [app, setApp] = useState(null);
	const [selectedLesson, setSelectedLesson] = useState(null);
	const [now, setNow] = useState(() => new Date());
	const [notes, setNotes] = useState(readNotes);
	const [command, setCommand] = useState("");
	const [transcript, setTranscript] = useState(TERMINAL_GREETING);
	const [completion, setCompletion] = useState({ pending: null, error: "" });
	const outputRef = useRef(null);
	const name = profile?.name?.trim() || "Learner";
	const completed = Array.isArray(lessons) ? lessons : [];
	const progress = LESSONS.filter((lesson) =>
		completed.includes(lesson.id),
	).length;
	const activeLesson = LESSONS.find((lesson) => lesson.id === selectedLesson);
	const activeApp = [...APPS, ...DESKTOP_APPS].find(
		(item) => item.id === app,
	);

	useEffect(() => {
		const interval = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(interval);
	}, []);

	useEffect(() => {
		if (app === "terminal" && outputRef.current)
			outputRef.current.scrollTop = outputRef.current.scrollHeight;
	}, [app, transcript]);

	function saveNotes(text) {
		try {
			window.localStorage.setItem(NOTES_KEY, text);
			setNotes({ text, status: "Saved on this device." });
		} catch {
			setNotes({
				text,
				status: "Not saved: device storage is unavailable or full. Keep this window open and copy your notes somewhere safe, or retry Save.",
			});
		}
	}

	function openLesson(id) {
		setSelectedLesson(id);
		setCompletion((current) => ({ ...current, error: "" }));
		setApp("learning");
	}

	async function completeLesson(id) {
		if (completed.includes(id) || completion.pending) return;
		setCompletion({ pending: id, error: "" });
		try {
			if (typeof onCompleteLesson !== "function")
				throw new Error("Completion is unavailable");
			await onCompleteLesson(id);
			setCompletion({ pending: null, error: "" });
		} catch {
			setCompletion({
				pending: null,
				error: "Could not save lesson completion. Please try again.",
			});
		}
	}

	function runCommand(event) {
		event.preventDefault();
		const input = command.trim();
		if (!input) return;
		setCommand("");
		if (input === "clear") {
			setTranscript("");
			return;
		}
		const responses = {
			help: "Simulated commands (case-sensitive):\nhelp             Show this guide\nls               List learning resources\npwd              Show the mock folder\nwhoami           Show your campus name\nclear            Clear this display\ndate             Show your device’s current date\ncat welcome.txt  Read the welcome note\n\nNo real commands, scripts, or system changes are executed.",
			ls: LESSONS.map((lesson) => lesson.file).join("\n"),
			pwd: "/home/learner/PierPlace/resources (simulated)",
			whoami: name,
			date: new Date().toLocaleString(),
			"cat welcome.txt": WELCOME_TEXT,
		};
		const result = Object.hasOwn(responses, input)
			? responses[input]
			: "Unknown simulated command. Type help for supported commands; nothing was executed.";
		setTranscript((previous) =>
			`${previous}${previous ? "\n\n" : ""}learner@PierPlace:~$ ${input}\n${result}`.slice(
				-24000,
			),
		);
	}

	return (
		<Modal
			title="Your laptop"
			presentation="floating"
			className="laptop-modal laptop-hardware-popup"
			onClose={onClose}
		>
			<div className="laptop-shell">
				<div className="laptop-camera-bar" aria-hidden="true">
					<span className="laptop-camera" />
					<span className="laptop-camera-light" />
				</div>
				<div className="laptop-screen">
					<div className="ubuntu-bar">
						<button
							type="button"
							onClick={() => setApp(null)}
							title="Show desktop"
						>
							Activities
						</button>
						<time
							dateTime={now.toISOString()}
							title={now.toLocaleString()}
						>
							{now.toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							})}{" "}
							·{" "}
							{now.toLocaleTimeString(undefined, {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</time>
						<span
							aria-label="Decorative desktop status indicators"
							style={{
								display: "flex",
								gap: 8,
								alignItems: "center",
							}}
						>
							<Wifi size={13} aria-hidden="true" />
							<Volume2 size={13} aria-hidden="true" />
							<BatteryFull size={15} aria-hidden="true" />
						</span>
					</div>
					<div className="ubuntu-desktop">
						<nav
							className="ubuntu-dock"
							aria-label="Laptop applications"
						>
							{APPS.map(({ id, title, Icon, color }) => (
								<button
									key={id}
									type="button"
									className={app === id ? "active" : ""}
									aria-label={title}
									aria-pressed={app === id}
									title={title}
									onClick={() => setApp(id)}
								>
									<Icon
										size={24}
										color={color}
										aria-hidden="true"
									/>
								</button>
							))}
							<button
								type="button"
								title="Power off — close laptop"
								aria-label="Power off — close laptop"
								onClick={onClose}
							>
								<Power size={22} aria-hidden="true" />
							</button>
						</nav>
						{!activeApp && (
							<nav
								className="desktop-icons"
								aria-label="Desktop applications"
							>
								{DESKTOP_APPS.map(
									({ id, title, Icon, color }) => (
										<button
											key={id}
											type="button"
											className="desktop-icon"
											onClick={() => setApp(id)}
										>
											<span>
												<Icon
													size={38}
													color={color}
													aria-hidden="true"
												/>
											</span>
											{title}
										</button>
									),
								)}
							</nav>
						)}
						{activeApp ? (
							<section
								className="desktop-window"
								aria-label={`${activeApp.title} app`}
							>
								<div className="window-bar">
									<span
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
										}}
									>
										<activeApp.Icon
											size={15}
											aria-hidden="true"
										/>
										{activeApp.title} · PierPlace
									</span>
									<button
										type="button"
										aria-label={`Close ${activeApp.title} window`}
										onClick={() => setApp(null)}
									>
										<X size={13} aria-hidden="true" />
									</button>
								</div>
								{app === "browser" && (
									<Browser
										onLearn={() => setApp("learning")}
									/>
								)}
								{app === "editor" && (
									<Suspense
										fallback={
											<p role="status">
												Starting Monaco…
											</p>
										}
									>
										<CodeEditor />
									</Suspense>
								)}
								{app === "music" && <MusicWindow />}
								{app === "pdf" && <PdfViewer />}
								{app === "learning" && (
									<div className="learning-content">
										<h2>Hello, {name}.</h2>
										<p>
											{progress} of {LESSONS.length}{" "}
											lessons complete · Small steps
											count.
										</p>
										{LESSONS.map(
											({
												id,
												title,
												summary,
												duration,
												Icon,
											}) => (
												<div key={id}>
													<button
														type="button"
														className="lesson-card"
														aria-expanded={
															selectedLesson ===
															id
														}
														aria-controls={`laptop-lesson-${id}`}
														onClick={() =>
															selectedLesson ===
															id
																? setSelectedLesson(
																		null,
																	)
																: openLesson(id)
														}
													>
														<Icon
															size={25}
															aria-hidden="true"
															style={{
																flexShrink: 0,
															}}
														/>
														<span
															style={{ flex: 1 }}
														>
															<strong>
																{title}
															</strong>
															<small>
																{summary} ·{" "}
																{duration}
															</small>
														</span>
														{completed.includes(
															id,
														) ? (
															<CheckCircle2
																size={20}
																aria-label="Completed"
															/>
														) : (
															<ArrowRight
																size={18}
																aria-hidden="true"
															/>
														)}
													</button>
													{activeLesson?.id ===
														id && (
														<section
															id={`laptop-lesson-${id}`}
															className="lesson-detail"
															aria-label={title}
														>
															<LessonContent
																id={id}
															/>
															<button
																type="button"
																className="primary-button"
																disabled={
																	completed.includes(
																		id,
																	) ||
																	Boolean(
																		completion.pending,
																	)
																}
																onClick={() =>
																	completeLesson(
																		id,
																	)
																}
															>
																<CheckCircle2
																	size={16}
																	aria-hidden="true"
																/>
																{completed.includes(
																	id,
																)
																	? "Completed"
																	: completion.pending ===
																		  id
																		? "Saving…"
																		: "Mark complete"}
															</button>
															{completion.error && (
																<p role="alert">
																	{
																		completion.error
																	}
																</p>
															)}
															<p>
																<button
																	type="button"
																	className="text-button"
																	onClick={() =>
																		setSelectedLesson(
																			null,
																		)
																	}
																>
																	<ArrowLeft
																		size={
																			14
																		}
																		aria-hidden="true"
																	/>{" "}
																	Back to
																	lessons
																</button>
															</p>
														</section>
													)}
												</div>
											),
										)}
									</div>
								)}
								{app === "notes" && (
									<>
										<div className="window-bar">
											<label htmlFor="laptop-notes">
												Your private device notes
											</label>
											<button
												type="button"
												aria-label="Save notes"
												title="Save notes / retry saving"
												onClick={() =>
													saveNotes(notes.text)
												}
											>
												<Save
													size={15}
													aria-hidden="true"
												/>
											</button>
										</div>
										<textarea
											id="laptop-notes"
											className="notes-editor"
											value={notes.text}
											onChange={(event) =>
												saveNotes(event.target.value)
											}
											placeholder="One thing I want to learn today…"
											aria-describedby="laptop-notes-status"
											spellCheck
										/>
										<p
											id="laptop-notes-status"
											role="status"
											style={{
												padding: "10px 16px",
												fontSize: 11,
											}}
										>
											{notes.status} Notes are not synced
											to your account.
										</p>
									</>
								)}
								{app === "terminal" && (
									<>
										<pre
											ref={outputRef}
											className="terminal-output"
											tabIndex={0}
											aria-label="Simulated terminal output"
										>
											{transcript}
										</pre>
										<form
											className="terminal-form"
											onSubmit={runCommand}
										>
											<span aria-hidden="true">~$</span>
											<input
												aria-label="Simulated terminal command"
												value={command}
												onChange={(event) =>
													setCommand(
														event.target.value,
													)
												}
												placeholder="Type help"
												autoComplete="off"
												autoCapitalize="none"
												spellCheck={false}
												maxLength={500}
											/>
											<button type="submit">Run</button>
										</form>
										<p
											style={{
												padding: "8px 16px",
												fontSize: 11,
											}}
										>
											Simulation only. No real shell,
											scripts, or filesystem access.
										</p>
									</>
								)}
								{app === "files" && (
									<div className="learning-content">
										<h2>Learning resources</h2>
										<p>
											A small shelf of ideas. Select a
											file to read its lesson.
										</p>
										{LESSONS.map((lesson) => (
											<button
												type="button"
												key={lesson.id}
												className="lesson-card"
												onClick={() =>
													openLesson(lesson.id)
												}
											>
												<FileText
													size={24}
													aria-hidden="true"
												/>
												<span style={{ flex: 1 }}>
													<strong>
														{lesson.file}
													</strong>
													<small>
														{lesson.title} ·
														Learning resource
													</small>
												</span>
												<ArrowRight
													size={17}
													aria-hidden="true"
												/>
											</button>
										))}
									</div>
								)}
							</section>
						) : (
							<div
								style={{
									margin: "auto",
									textAlign: "center",
									color: "#fff4ed",
									padding: 20,
								}}
							></div>
						)}
					</div>
				</div>
				<div className="laptop-bezel-brand" aria-hidden="true">
					DELL
				</div>
			</div>
		</Modal>
	);
}
