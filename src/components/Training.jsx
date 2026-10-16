import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "../api.js";
import "../laptop.css";

const CodeEditor = lazy(() => import("./CodeEditor.jsx"));

const QUESTS = [
	{ id: 1, name: "Quest 1", description: "Fundamentals" },
	{ id: 2, name: "Quest 2", description: "Control flow" },
	{ id: 3, name: "Quest 3", description: "Functions" },
];

function pickRandom(list) {
	if (!list.length) return null;
	return list[Math.floor(Math.random() * list.length)];
}

function BackButton({ label, onClick }) {
	return (
		<button type="button" className="text-button" onClick={onClick}>
			<ArrowLeft size={14} aria-hidden="true" /> {label}
		</button>
	);
}

function TrainingHome({ questData, onSelectQuest, onSelectCheckpoint, loading, error, onRetry }) {
	return (
		<div className="learning-content training-home">
			<h2>Coding Training</h2>
			<p>Choose a quest to practise, or take the checkpoint exam.</p>
			{error && (
				<div className="training-error" role="alert">
					<span>{error}</span>
					<button type="button" onClick={onRetry}>
						<RefreshCw size={13} aria-hidden="true" /> Retry
					</button>
				</div>
			)}
			{QUESTS.map((quest) => {
				const questions = questData[quest.id] || [];
				return (
					<button
						key={quest.id}
						type="button"
						className="lesson-card"
						disabled={loading}
						onClick={() => onSelectQuest(quest)}
					>
						<span style={{ flex: 1 }}>
							<strong>{quest.name}</strong>
							<small>
								{quest.description} · {loading ? "loading…" : `${questions.length} questions`}
							</small>
						</span>
						<ArrowLeft size={17} aria-hidden="true" style={{ transform: "rotate(180deg)" }} />
					</button>
				);
			})}
			<button
				type="button"
				className="lesson-card"
				disabled={loading}
				onClick={onSelectCheckpoint}
			>
				<span style={{ flex: 1 }}>
					<strong>Checkpoint</strong>
					<small>Exam · 3 random questions, one from each quest</small>
				</span>
				<ArrowLeft size={17} aria-hidden="true" style={{ transform: "rotate(180deg)" }} />
			</button>
		</div>
	);
}

function QuestList({ quest, questions, progress, onBack, onSelectQuestion }) {
	return (
		<div className="learning-content training-list">
			<BackButton label="Back to training" onClick={onBack} />
			<h2>{quest.name}</h2>
			<p>{quest.description}</p>
			{questions.map((question, index) => {
				const state = progress[question.id];
				return (
					<button
						key={question.id}
						type="button"
						className="lesson-card"
						onClick={() => onSelectQuestion(question, index + 1)}
					>
						<span style={{ flex: 1 }}>
							<strong>
								Question {index + 1}
								{state?.submitted && (
									<CheckCircle2
										size={15}
										aria-label="submitted"
										style={{ marginLeft: 8, color: "#51cf66", verticalAlign: "text-bottom" }}
									/>
								)}
							</strong>
							<small>
								{state?.submitted ? `Submitted · best ${state.best_score}%` : question.prompt}
							</small>
						</span>
						<ArrowLeft size={17} aria-hidden="true" style={{ transform: "rotate(180deg)" }} />
					</button>
				);
			})}
		</div>
	);
}

function SubmissionPane({ taskId, code, setCode, identity, onSubmitted, label }) {
	const [status, setStatus] = useState("idle");
	const [result, setResult] = useState(null);

	async function submit() {
		if (!code.trim()) {
			setResult({ error: "Write a solution before submitting." });
			return;
		}
		setStatus("saving");
		setResult(null);
		try {
			const response = await api.submitTrainQuest(taskId, code, identity);
			setResult(response);
			setStatus("done");
			onSubmitted?.(response);
		} catch (error) {
			setResult({ error: error.message });
			setStatus("error");
		}
	}

	return (
		<div className="training-submit">
			<button
				type="button"
				className="primary-button"
				disabled={status === "saving"}
				onClick={submit}
			>
				{status === "saving" ? "Submitting…" : label}
			</button>
			{result?.error && (
				<p className="training-error" role="alert">
					{result.error}
				</p>
			)}
			{result && !result.error && (
				<p className="training-success" role="status">
					Submitted · score {result.score}% · +{result.xp} XP
					{result.is_best ? " · personal best" : ""}
				</p>
			)}
		</div>
	);
}

function CodeQuestionView({ questName, question, questionNum, identity, onBack, onSubmitted }) {
	const [code, setCode] = useState("");
	return (
		<div className="training-question">
			<div className="training-question-bar">
				<BackButton label="Back to questions" onClick={onBack} />
				<h2>
					{questName} · Question {questionNum}
				</h2>
			</div>
			<div className="training-split">
				<div className="training-prompt">
					<h3>Problem</h3>
					<pre>{question.prompt || "Write code to solve the problem."}</pre>
				</div>
				<div className="training-editor">
					<div className="training-editor-inner">
						<Suspense fallback={<p role="status">Loading editor…</p>}>
							<CodeEditor
								value={code}
								onChange={setCode}
								title="solution.py · Python"
								ariaLabel={`Solution editor for ${questName} question ${questionNum}`}
							/>
						</Suspense>
					</div>
					<SubmissionPane
						taskId={question.id}
						code={code}
						setCode={setCode}
						identity={identity}
						label="Submit solution"
						onSubmitted={onSubmitted}
					/>
				</div>
			</div>
		</div>
	);
}

function CheckpointView({ questions, identity, onBack }) {
	const [index, setIndex] = useState(0);
	const [code, setCode] = useState("");
	const [results, setResults] = useState([]);
	const [done, setDone] = useState(false);

	const question = questions[index];

	function advance(result) {
		setResults((previous) => [...previous, result]);
		if (index < questions.length - 1) {
			setIndex(index + 1);
			setCode("");
		} else {
			setDone(true);
		}
	}

	if (!questions.length) {
		return (
			<div className="learning-content training-list">
				<BackButton label="Back to training" onClick={onBack} />
				<h2>Checkpoint</h2>
				<p>The checkpoint needs questions from each quest. Load the quests first.</p>
			</div>
		);
	}

	if (done) {
		const total = results.reduce((sum, item) => sum + (item?.score ?? 0), 0);
		const score = Math.round(total / results.length);
		return (
			<div className="learning-content training-list">
				<BackButton label="Back to training" onClick={onBack} />
				<h2>Checkpoint complete</h2>
				<p>
					Average score {score}% across {results.length} questions.
				</p>
			</div>
		);
	}

	return (
		<div className="training-question">
			<div className="training-question-bar">
				<BackButton label="Back to training" onClick={onBack} />
				<h2>
					Checkpoint · {index + 1}/{questions.length}
				</h2>
			</div>
			<div className="training-split">
				<div className="training-prompt">
					<h3>Problem</h3>
					<pre>{question.prompt || "Write code to solve the problem."}</pre>
				</div>
				<div className="training-editor">
					<div className="training-editor-inner">
						<Suspense fallback={<p role="status">Loading editor…</p>}>
							<CodeEditor
								value={code}
								onChange={setCode}
								title="checkpoint.py · Python"
								ariaLabel={`Checkpoint solution editor ${index + 1}`}
							/>
						</Suspense>
					</div>
					<SubmissionPane
						taskId={question.id}
						code={code}
						setCode={setCode}
						identity={identity}
						label={index < questions.length - 1 ? "Submit & continue" : "Submit & finish"}
						onSubmitted={advance}
					/>
				</div>
			</div>
		</div>
	);
}

export default function TrainingApp({ profile } = {}) {
	const identity = useMemo(
		() => ({
			name: profile?.name,
			skin: profile?.skin,
			hair: profile?.hair,
			shirt: profile?.shirt,
		}),
		[profile],
	);
	const [view, setView] = useState("home");
	const [selectedQuest, setSelectedQuest] = useState(null);
	const [selectedQuestion, setSelectedQuestion] = useState(null);
	const [selectedQuestionNum, setSelectedQuestionNum] = useState(1);
	const [questData, setQuestData] = useState({ 1: [], 2: [], 3: [] });
	const [progress, setProgress] = useState({});
	const [checkpointQuestions, setCheckpointQuestions] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");
		Promise.all([
			api.getQuestTasks({ quest_number: 1 }),
			api.getQuestTasks({ quest_number: 2 }),
			api.getQuestTasks({ quest_number: 3 }),
			identity.name ? api.trainProgress(identity.name) : Promise.resolve({}),
		])
			.then(([q1, q2, q3, saved]) => {
				if (!active) return;
				setQuestData({ 1: q1 || [], 2: q2 || [], 3: q3 || [] });
				setProgress(saved || {});
			})
			.catch((loadError) => {
				if (active) setError(loadError.message || "Could not load quests.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [identity.name, reloadKey]);

	function markSubmitted(taskId, result) {
		setProgress((previous) => {
			const best = previous[taskId]?.best_score ?? -1;
			return {
				...previous,
				[taskId]: { submitted: true, best_score: Math.max(best, result.score ?? 0) },
			};
		});
	}

	function back() {
		if (view === "question") setView("questList");
		else setView("home");
	}

	if (view === "questList") {
		return (
			<QuestList
				quest={selectedQuest}
				questions={questData[selectedQuest?.id] || []}
				progress={progress}
				onBack={back}
				onSelectQuestion={(question, num) => {
					setSelectedQuestion(question);
					setSelectedQuestionNum(num);
					setView("question");
				}}
			/>
		);
	}

	if (view === "question" && selectedQuestion) {
		return (
			<CodeQuestionView
				questName={selectedQuest?.name}
				question={selectedQuestion}
				questionNum={selectedQuestionNum}
				identity={identity}
				onBack={back}
				onSubmitted={(result) => markSubmitted(selectedQuestion.id, result)}
			/>
		);
	}

	if (view === "checkpoint") {
		return (
			<CheckpointView
				questions={checkpointQuestions}
				identity={identity}
				onBack={() => setView("home")}
			/>
		);
	}

	return (
		<TrainingHome
			questData={questData}
			loading={loading}
			error={error}
			onRetry={() => setReloadKey((key) => key + 1)}
			onSelectQuest={(quest) => {
				setSelectedQuest(quest);
				setView("questList");
			}}
			onSelectCheckpoint={() => {
				const picked = [1, 2, 3]
					.map((questId) => pickRandom(questData[questId] || []))
					.filter(Boolean);
				setCheckpointQuestions(picked);
				setView("checkpoint");
			}}
		/>
	);
}
