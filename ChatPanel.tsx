import { useEffect, useRef, useState } from 'react';
import { localTutorReply } from '../lib/local-tutor';
import { askTutor, hasGeminiKey } from '../lib/gemini';
import { SendIcon, SparkIcon } from './Icons';
import type { ChatMessage } from '../types';

const STORE_KEY = 'ello.workspace.chat';

const readMessages = (): ChatMessage[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
};

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Ask me anything from tonight’s chapter — I will break it down step by step. Paste notes on the Live board tab and I will answer from them too.',
};

interface Props {
  /** Notes or board headline used as context for the answer. */
  context?: string;
}

export default function ChatPanel({ context = '' }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const stored = readMessages();
    return stored.length ? stored : [WELCOME];
  });
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* storage blocked */
    }
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || thinking) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const history = messages.filter((message) => message.id !== 'welcome');
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setThinking(true);

    if (!hasGeminiKey()) {
      timer.current = window.setTimeout(() => {
        const reply: ChatMessage = {
          id: `msg-${Date.now()}-r`,
          role: 'assistant',
          content: localTutorReply(text),
        };
        setMessages((current) => [...current, reply]);
        setThinking(false);
      }, 450);
      return;
    }

    try {
      const answer = await askTutor(
        text,
        history.map((message) => ({ role: message.role, content: message.content })),
        context,
      );
      setMessages((current) => [
        ...current,
        { id: `msg-${Date.now()}-r`, role: 'assistant', content: answer },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ello could not answer that right now.';
      setMessages((current) => [
        ...current,
        {
          id: `msg-${Date.now()}-e`,
          role: 'assistant',
          content: `${message} Here is the offline answer instead:\n\n${localTutorReply(text)}`,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="chat-panel">
      <header className="panel-head">
        <div>
          <span className="panel-eyebrow">
            <SparkIcon size={14} /> tutor chat
          </span>
          <h2 className="panel-title">Ask Ello</h2>
        </div>
        <button type="button" className="ghost-action" onClick={() => setMessages([WELCOME])}>
          Clear
        </button>
      </header>

      <div className="chat-log" ref={scroller}>
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'chat-row user' : 'chat-row'}>
            <p className="chat-bubble">{message.content}</p>
          </div>
        ))}
        {thinking && (
          <div className="chat-row">
            <p className="chat-bubble typing">
              Ello is thinking<span className="dots">…</span>
            </p>
          </div>
        )}
      </div>

      <form className="chat-compose" onSubmit={send}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="e.g. why is the net force zero when the block moves steadily?"
          aria-label="Message Ello"
        />
        <button type="submit" disabled={thinking || !draft.trim()} aria-label="Send message">
          <SendIcon size={17} />
        </button>
      </form>
    </div>
  );
}
