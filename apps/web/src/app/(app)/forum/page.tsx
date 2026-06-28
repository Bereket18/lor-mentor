"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare, Plus, ArrowLeft, Send, Loader2, Pin, CornerDownRight,
} from "lucide-react";
import api from "@/lib/api";

interface Course { id: string; title: string }
interface Author { id: string; fullName: string; role: string }
interface PostSummary {
  id: string; title: string; content: string; isPinned: boolean;
  createdAt: string; author: Author; _count: { replies: number };
}
interface Reply { id: string; content: string; createdAt: string; author: Author }
interface PostDetail {
  id: string; title: string; content: string; isPinned: boolean;
  createdAt: string; author: Author; replies: Reply[];
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export default function ForumPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [activePost, setActivePost] = useState<PostDetail | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load the student's courses once
  useEffect(() => {
    api.get<Course[]>("/courses/my-year")
      .then((r) => {
        const list = r.data ?? [];
        setCourses(list);
        if (list.length) setCourseId(list[0].id);
      })
      .catch(() => setCourses([]));
  }, []);

  // Note: does not synchronously set loading state, so it is safe to call
  // directly from an effect. Callers that want a spinner set loadingPosts
  // themselves (event handlers) — the initial state already starts true.
  const loadPosts = useCallback((id: string) => {
    if (!id) return;
    api.get<{ posts: PostSummary[] }>(`/forum/course/${id}`)
      .then((r) => setPosts(r.data.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setLoadingPosts(false));
  }, []);

  useEffect(() => { loadPosts(courseId); }, [courseId, loadPosts]);

  function openPost(id: string) {
    setLoadingPost(true);
    setActivePost(null);
    api.get<PostDetail>(`/forum/posts/${id}`)
      .then((r) => setActivePost(r.data))
      .catch(() => setActivePost(null))
      .finally(() => setLoadingPost(false));
  }

  async function submitPost() {
    if (!title.trim() || !body.trim() || !courseId) return;
    setSubmitting(true);
    try {
      await api.post("/forum/posts", { courseId, title: title.trim(), content: body.trim() });
      setTitle(""); setBody(""); setComposing(false);
      loadPosts(courseId);
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to post");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReply() {
    if (!reply.trim() || !activePost) return;
    setSubmitting(true);
    try {
      const r = await api.post<Reply>(`/forum/posts/${activePost.id}/replies`, { content: reply.trim() });
      setActivePost({ ...activePost, replies: [...activePost.replies, r.data] });
      setReply("");
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to reply");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Thread detail view ───────────────────────────────────
  if (activePost || loadingPost) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button type="button" onClick={() => setActivePost(null)}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to threads
        </button>

        {loadingPost || !activePost ? (
          <div className="h-40 rounded-2xl skeleton" />
        ) : (
          <>
            <div className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-2">
                {activePost.isPinned && <Pin className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} />}
                <h1 className="font-display text-xl font-bold text-primary">{activePost.title}</h1>
              </div>
              <p className="text-xs text-muted mb-4">
                {activePost.author.fullName} · {timeAgo(activePost.createdAt)}
              </p>
              <p className="text-sm text-secondary whitespace-pre-wrap leading-relaxed">{activePost.content}</p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-primary mb-3">
                {activePost.replies.length} {activePost.replies.length === 1 ? "Reply" : "Replies"}
              </h2>
              <div className="space-y-3">
                {activePost.replies.map((r) => (
                  <div key={r.id} className="glass-panel p-4 flex gap-3">
                    <CornerDownRight className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }} />
                    <div className="min-w-0">
                      <p className="text-xs text-muted mb-1">{r.author.fullName} · {timeAgo(r.createdAt)}</p>
                      <p className="text-sm text-secondary whitespace-pre-wrap">{r.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reply composer */}
            <div className="glass-panel p-4">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                rows={3}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary outline-none resize-none transition-all"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
                onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--teal)"; }}
                onBlur={(e) => { e.currentTarget.style.border = "1px solid var(--border-default)"; }}
              />
              <div className="flex justify-end mt-2">
                <button type="button" onClick={submitReply} disabled={submitting || !reply.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Reply
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Thread list view ─────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary mb-1">Forum</h1>
          <p className="text-secondary text-sm">Discuss course material with your classmates.</p>
        </div>
        {courses.length > 0 && (
          <button type="button" onClick={() => setComposing((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}>
            <Plus className="h-4 w-4" /> New thread
          </button>
        )}
      </div>

      {/* Course selector */}
      {courses.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {courses.map((c) => (
            <button key={c.id} type="button" onClick={() => { if (c.id !== courseId) setLoadingPosts(true); setCourseId(c.id); setComposing(false); }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={courseId === c.id
                ? { background: "var(--teal-dim)", color: "var(--teal)", border: "1px solid var(--teal-glow)" }
                : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
              {c.title}
            </button>
          ))}
        </div>
      )}

      {/* Compose form */}
      {composing && (
        <div className="glass-panel p-4 space-y-3">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Thread title" aria-label="Thread title"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary outline-none transition-all"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--teal)"; }}
            onBlur={(e) => { e.currentTarget.style.border = "1px solid var(--border-default)"; }}
          />
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="What would you like to discuss?" rows={4} aria-label="Thread content"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary outline-none resize-none transition-all"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--teal)"; }}
            onBlur={(e) => { e.currentTarget.style.border = "1px solid var(--border-default)"; }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setComposing(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-secondary hover:text-primary transition-colors">
              Cancel
            </button>
            <button type="button" onClick={submitPost} disabled={submitting || !title.trim() || !body.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Post
            </button>
          </div>
        </div>
      )}

      {/* Threads */}
      {courses.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <MessageSquare className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--teal)", opacity: 0.4 }} />
          <p className="text-secondary text-sm font-medium">No courses yet</p>
          <p className="text-muted text-xs mt-1">Course forums appear once you have enrolled courses.</p>
        </div>
      ) : loadingPosts ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>
      ) : posts.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <MessageSquare className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--teal)", opacity: 0.4 }} />
          <p className="text-secondary text-sm font-medium">No threads yet</p>
          <p className="text-muted text-xs mt-1">Be the first to start a discussion in this course.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <button key={p.id} type="button" onClick={() => openPost(p.id)}
              className="glass-panel glass-panel-hover w-full text-left p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--teal-dim)" }}>
                  <MessageSquare className="h-4 w-4" style={{ color: "var(--teal)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {p.isPinned && <Pin className="h-3 w-3 flex-shrink-0" style={{ color: "var(--teal)" }} />}
                    <p className="text-sm font-semibold text-primary truncate">{p.title}</p>
                  </div>
                  <p className="text-xs text-muted truncate mt-0.5">{p.content}</p>
                  <p className="text-[11px] text-muted mt-1.5">
                    {p.author.fullName} · {timeAgo(p.createdAt)} · {p._count.replies} replies
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
