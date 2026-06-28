"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, Sparkles, User } from "lucide-react";
import api from "@/lib/api";

interface Course { id: string; title: string }
interface Message { role: "user" | "assistant"; content: string }
interface HistoryItem { id: string; prompt: string; response: string; createdAt: string }

export default function AiTutorPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Course[]>("/courses/my-year").then((r) => setCourses(r.data ?? [])).catch(() => {});
    api.get<HistoryItem[]>("/tutor/history")
      .then((r) => {
        // History is newest-first; replay oldest-first as chat bubbles
        const msgs: Message[] = [];
        [...(r.data ?? [])].reverse().forEach((h) => {
          msgs.push({ role: "user", content: h.prompt });
          msgs.push({ role: "assistant", content: h.response });
        });
        setMessages(msgs);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll on new messages (DOM side-effect, not state)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const r = await api.post<{ answer: string }>("/tutor/chat", {
        message: text,
        ...(courseId ? { courseId } : {}),
      });
      setMessages((m) => [...m, { role: "assistant", content: r.data.answer }]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Sorry, I couldn't answer that right now. Please try again.";
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--ai-dim)" }}>
          <Bot className="h-5 w-5" style={{ color: "var(--ai-primary)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-bold text-primary leading-tight">AI Tutor</h1>
          <p className="text-xs text-secondary">Powered by Gemini · grounded on your course material</p>
        </div>
        {courses.length > 0 && (
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            aria-label="Course context"
            className="text-xs rounded-lg px-2.5 py-2 outline-none"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
          >
            <option value="">General</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && !sending ? (
          <div className="glass-panel p-10 text-center mt-4">
            <Sparkles className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--ai-primary)", opacity: 0.6 }} />
            <p className="text-secondary text-sm font-medium">Ask me anything</p>
            <p className="text-muted text-xs mt-1">
              Pick a course above to ground answers on its material, or ask a general medical question.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: m.role === "user" ? "var(--teal-dim)" : "var(--ai-dim)" }}>
                {m.role === "user"
                  ? <User className="h-4 w-4" style={{ color: "var(--teal)" }} />
                  : <Bot className="h-4 w-4" style={{ color: "var(--ai-primary)" }} />}
              </div>
              <div className={`glass-panel px-4 py-3 max-w-[80%] ${m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}>
                <p className="text-sm text-primary whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--ai-dim)" }}>
              <Bot className="h-4 w-4" style={{ color: "var(--ai-primary)" }} />
            </div>
            <div className="glass-panel px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--ai-primary)" }} />
              <span className="text-sm text-muted">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="glass-panel p-2 mt-4 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a question…"
          aria-label="Message"
          rows={1}
          className="flex-1 bg-transparent resize-none px-3 py-2.5 text-sm text-primary outline-none max-h-32"
        />
        <button type="button" onClick={send} disabled={sending || !input.trim()}
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg, var(--ai-secondary), var(--ai-primary))" }}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
