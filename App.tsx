import { useCallback, useEffect, useMemo, useState } from 'react';
import BoardCanvas from './components/BoardCanvas';
import Flashcards from './components/Flashcards';
import MockTest from './components/MockTest';
import ChatPanel from './components/ChatPanel';
import UploadPanel from './components/UploadPanel';
import ListenPanel from './components/ListenPanel';
import ProgressPanel from './components/ProgressPanel';
import ResultsPanel from './components/ResultsPanel';
import { ElloFace, CloseIcon, SparkIcon } from './components/Icons';
import { gradeLocalQuiz, localQuiz } from './lib/local-tutor';
import { recordExam, recordStudyDay, studyStreak, type ProgressState } from './lib/progress';
import {
  GeminiError,
  generateBoard,
  generateCards,
  getGeminiKey,
  getGeminiModel,
  hasGeminiKey,
  setGeminiKey,
  setGeminiModel,
} from './lib/gemini';
import type { Board, CanvasState, CardStatus, Flashcard, Quiz } from './types';

const CANVAS_KEY = 'ello.workspace.canvas';
const CARDS_KEY = 'ello.workspace.cards';
const BOARD_KEY = 'ello.workspace.board';
const SOURCE_KEY = 'ello.workspace.source';

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeStored = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — the workspace still works for this tab */
  }
};

const readText = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

const writeText = (key: string, value: string) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

type WorkspaceTab = 'board' | 'cards' | 'test' | 'chat' | 'upload' | 'listen' | 'results' | 'progress';

const TABS: { id: WorkspaceTab; label: string; hint: string }[] = [
  { id: 'board', label: '🎨 Live board', hint: 'The lesson, drawn out' },
  { id: 'cards', label: '🗂 Flashcards', hint: 'Flip, then sort' },
  { id: 'test', label: '📝 Mock exam', hint: 'Marked at the end' },
  { id: 'chat', label: '💬 Chat', hint: 'Ask a question' },
  { id: 'upload', label: '📄 Upload PDF', hint: 'Add your notes' },
  { id: 'listen', label: '🔊 Listen', hint: 'Hear the board' },
  { id: 'results', label: '📈 Results', hint: 'Marked papers' },
  { id: 'progress', label: '📊 Progress', hint: 'Streak and scores' },
];

const GUIDE_STEPS: { title: string; body: string; go: WorkspaceTab }[] = [
  { title: 'Add your notes', body: 'Paste a chapter, or drop a PDF, slide deck or photo.', go: 'upload' },
  { title: 'Read the board', body: 'Plain-language notes, formulas and diagrams.', go: 'board' },
  { title: 'Check yourself', body: 'Flip flashcards, then sit a ten-question mock exam.', go: 'test' },
  { title: 'Ask when stuck', body: 'Chat for a step-by-step explanation, or press Listen.', go: 'chat' },
];

const GUIDE_KEY = 'ello.guide.dismissed';

const errorText = (err: unknown): string =>
  err instanceof GeminiError || err instanceof Error
    ? err.message
    : 'Something went wrong. Try again.';

export default function App() {
  const [tab, setTab] = useState<WorkspaceTab>('board');
  const [canvas, setCanvas] = useState<CanvasState>(() => readStored<CanvasState>(CANVAS_KEY, {}));
  const [cards, setCards] = useState<Flashcard[]>(() => readStored<Flashcard[]>(CARDS_KEY, []));
  const [board, setBoard] = useState<Board | null>(() => readStored<Board | null>(BOARD_KEY, null));
  const [source, setSource] = useState<string>(() => readText(SOURCE_KEY));
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(() => recordStudyDay());
  const [drawing, setDrawing] = useState(false);
  const [cardsBusy, setCardsBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState(() => getGeminiKey());
  const [modelDraft, setModelDraft] = useState(() => getGeminiModel());
  const [keyPresent, setKeyPresent] = useState(() => hasGeminiKey());
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_KEY) !== 'yes';
    } catch {
      return true;
    }
  });
  const [showComposer, setShowComposer] = useState(() => !readStored<Board | null>(BOARD_KEY, null));
  const [docCount, setDocCount] = useState(() => {
    try {
      const raw = localStorage.getItem('ello.workspace.uploads');
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  });

  const streak = useMemo(() => studyStreak(progress.activity), [progress.activity]);

  const dismissGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem(GUIDE_KEY, 'yes');
    } catch {
      /* ignore */
    }
  };

  const handleSaveCanvas = useCallback((next: CanvasState) => {
    setCanvas(next);
    writeStored(CANVAS_KEY, next);
  }, []);

  const handleSourceChange = useCallback((value: string) => {
    setSource(value);
    writeText(SOURCE_KEY, value);
  }, []);

  const handleSetCardStatus = useCallback((cardId: string, status: CardStatus) => {
    setCards((current) => {
      const next = current.map((card) => (card.id === cardId ? { ...card, status } : card));
      writeStored(CARDS_KEY, next);
      return next;
    });
  }, []);

  const handleSaveSettings = () => {
    setGeminiKey(keyDraft);
    setGeminiModel(modelDraft);
    setKeyPresent(Boolean(keyDraft.trim()));
    setSettingsOpen(false);
    setNotice(keyDraft.trim() ? 'Gemini key saved in this browser.' : 'Gemini key removed.');
  };

  const drawBoard = async () => {
    if (drawing) return;
    if (!hasGeminiKey()) {
      setSettingsOpen(true);
      setNotice('Add your Gemini API key once and Ello can draw from any notes.');
      return;
    }
    setDrawing(true);
    setNotice(null);
    try {
      const result = await generateBoard(source);
      setBoard(result.board);
      writeStored(BOARD_KEY, result.board);
      setShowComposer(false);
      setNotice(`Board drawn with ${result.model}. Nothing leaves this device except the notes you sent to Gemini.`);
    } catch (err) {
      setNotice(errorText(err));
    } finally {
      setDrawing(false);
    }
  };

  const makeCards = async () => {
    if (cardsBusy) return;
    const material = source.trim() || (board ? [board.headline, board.subtitle, ...board.sections.map((s) => `${s.title}: ${s.body}`)].join('\n') : '');
    if (!material) {
      setNotice('Paste your notes on the Live board tab first, then Ello can build cards.');
      return;
    }
    setCardsBusy(true);
    setNotice(null);
    try {
      let next: Flashcard[];
      if (hasGeminiKey()) {
        next = await generateCards(material);
        setNotice(`${next.length} cards written by Gemini and saved on this device.`);
      } else if (board) {
        next = board.sections.map((section, index) => ({
          id: `card-${Date.now()}-${index}`,
          term: section.title,
          definition: section.body,
          hint: board.recap[index] ?? board.focus.note,
          status: 'new' as const,
        }));
        setNotice('Cards built from your board. Add a Gemini key for deeper questions.');
      } else {
        setNotice('Add your Gemini API key to write cards from your notes.');
        setSettingsOpen(true);
        return;
      }
      setCards(next);
      writeStored(CARDS_KEY, next);
    } catch (err) {
      setNotice(errorText(err));
    } finally {
      setCardsBusy(false);
    }
  };

  const boardPassages = board
    ? [
        { title: board.focus.label, body: `${board.focus.value}. ${board.focus.note}` },
        ...board.sections.map((section) => ({ title: section.title, body: section.body })),
      ]
    : [];

  return (
    <main className="app-dashboard">
      <header className="app-dashboard-header">
        <div className="app-dashboard-brand">
          <ElloFace size={30} />
          <strong>Ello AI</strong>
          <span className="live-tag">LIVE BOARD</span>
        </div>
        <div className="app-dashboard-user">
          <span className="app-streak">🔥 {streak} day streak</span>
          <span className="offline-tag">saved on this device</span>
          <button type="button" onClick={() => setSettingsOpen((open) => !open)}>
            {keyPresent ? 'Gemini ✓' : 'Add Gemini key'}
          </button>
        </div>
      </header>

      {settingsOpen && (
        <section className="gemini-settings" aria-label="Gemini settings">
          <div className="gemini-settings-head">
            <span className="panel-eyebrow">
              <SparkIcon size={14} /> gemini flash · stored locally
            </span>
            <button type="button" className="guide-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
              <CloseIcon size={14} />
            </button>
          </div>
          <label>
            API key
            <input
              type="password"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder="Paste your Gemini API key"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Model
            <input
              value={modelDraft}
              onChange={(event) => setModelDraft(event.target.value)}
              placeholder="gemini-2.5-flash"
              spellCheck={false}
            />
          </label>
          <div className="gemini-settings-actions">
            <button type="button" onClick={handleSaveSettings}>
              Save on this device
            </button>
            <span>
              The key is kept in this browser’s storage only — it is not compiled into the app or shared anywhere else.
              Get one free at aistudio.google.com/apikey.
            </span>
          </div>
        </section>
      )}

      <div className="workspace-tabs" role="tablist" aria-label="Workspace sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'workspace-tab active' : 'workspace-tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && (
        <p className="workspace-notice" role="status">
          {notice}
        </p>
      )}

      <section id="dashboard-canvas" className="app-workspace">
        {tab === 'board' && showGuide && (
          <div className="guide-card">
            <div className="guide-head">
              <div>
                <span className="panel-eyebrow">new here?</span>
                <h2 className="guide-title">Four steps to your first board</h2>
              </div>
              <button type="button" className="guide-close" onClick={dismissGuide} aria-label="Dismiss guide">
                <CloseIcon size={14} />
              </button>
            </div>
            <ol className="guide-steps">
              {GUIDE_STEPS.map((step, index) => (
                <li key={step.title}>
                  <button type="button" onClick={() => setTab(step.go)}>
                    <span className="guide-num">{index + 1}</span>
                    <strong>{step.title}</strong>
                    <span>{step.body}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === 'board' && (
          <>
            {showComposer ? (
              <div className="board-compose">
                <textarea
                  value={source}
                  onChange={(event) => handleSourceChange(event.target.value)}
                  placeholder="Paste your notes, a chapter summary, or just a topic — e.g. “Newton’s three laws with a worked example”."
                  rows={3}
                  aria-label="Notes for the board"
                />
                <div className="board-compose-actions">
                  <button type="button" onClick={drawBoard} disabled={drawing || !source.trim()}>
                    {drawing ? 'Drawing…' : 'Draw my board'}
                  </button>
                  <span>
                    {keyPresent
                      ? `Gemini ${getGeminiModel()} · saved on this device`
                      : 'Add a Gemini key to draw from your notes.'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="board-compose-bar">
                <span>Board saved on this device.</span>
                <button type="button" onClick={() => setShowComposer(true)}>
                  New board from notes
                </button>
              </div>
            )}
            <BoardCanvas board={board} canvas={canvas} onSaveCanvas={handleSaveCanvas} hasFile={Boolean(source.trim()) || docCount > 0} />
          </>
        )}

        {tab === 'cards' && (
          <Flashcards
            cards={cards}
            loading={cardsBusy}
            onGenerate={makeCards}
            onSetStatus={handleSetCardStatus}
            hasFile={Boolean(source.trim()) || docCount > 0 || Boolean(board)}
            onNotice={setNotice}
          />
        )}

        {tab === 'test' && (
          <MockTest
            quiz={quiz}
            loading={false}
            onGenerate={() => {
              setQuiz(localQuiz());
              setNotice('Your mock paper is ready — ten questions, marked at the end.');
            }}
            onGrade={async (answers) => {
              const result = gradeLocalQuiz(answers);
              setProgress(recordExam(result));
              return result;
            }}
            hasFile
            onNotice={setNotice}
          />
        )}

        {tab === 'chat' && <ChatPanel context={source || board?.headline || ''} />}

        {tab === 'upload' && <UploadPanel onCountChange={setDocCount} />}

        {tab === 'results' && (
          <ResultsPanel
            exams={progress.exams}
            onStartExam={() => {
              setQuiz(localQuiz());
              setTab('test');
            }}
          />
        )}

        {tab === 'progress' && (
          <ProgressPanel
            activity={progress.activity}
            exams={progress.exams}
            cards={cards}
            docCount={docCount}
            onNavigate={(target) => setTab(target)}
          />
        )}

        {tab === 'listen' && <ListenPanel headline={board?.headline ?? ''} passages={boardPassages} />}
      </section>
    </main>
  );
}
