"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare, Plus, ArrowLeft, Send, Loader2, Pin, CornerDownRight,
  Trash2, Flag, X,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Course { id: string; title: string }
interface Author { id: string; fullName: string; role: string }
interface ReactionSummary { counts: Record<string, number>; mine: string[] }
interface PostSummary {
  id: string; title: string; content: string; isPinned: boolean;
  createdAt: string; author: Author; _count: { replies: number };
  reactions: ReactionSummary;
}
interface Reply {
  id: string; content: string; createdAt: string; author: Author;
  reactions?: ReactionSummary;
}
interface PostDetail {
  id: string; title: string; content: string; isPinned: boolean;
  createdAt: string; author: Author; replies: Reply[]; reactions: ReactionSummary;
}

const REACTIONS = [
  { type: "LIKE", emoji: "👍" },
  { type: "LOVE", emoji: "❤️" },
  { type: "TARGET", emoji: "🎯" },
  { type: "FIRE", emoji: "🔥" },
];
const REPORT_REASONS = [
  { value: "SPAM", label: "Spam" },
  { value: "OFFENSIVE", label: "Offensive" },
  { value: "OFF_TOPIC", label: "Off-topic" },
  { value: "OTHER", label: "Other" },
];
const emptyReactions: ReactionSummary = { counts: {}, mine: [] };

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

function ReactionBar({ summary, onToggle }: {
  summary: ReactionSummary;
  onToggle: (type: string) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {REACTIONS.map((r) => {
        const count = summary.counts[r.type] ?? 0;
        const mine = summary.mine.includes(r.type);
        return (
          <button key={r.type} type="button" onClick={() => onToggle(r.type)}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all"
            style={mine
              ? { background: "var(--teal-dim)", border: "1px solid var(--teal-glow)", color: "var(--teal)" }
              : { background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
            <span>{r.emoji}</span>{count > 0 && <span className="font-semibold">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function ForumPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "TEACHER";
  const canModerate = ["TEACHER", "ADMIN", "SUPER_ADMIN"].includes(user?.role ?? "");

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
  // Report picker target: { postId } | { replyId }
  const [reportTarget, setReportTarget] = useState<{ postId?: string; replyId?: string } | null>(null);

  // Teachers see their assigned courses; students see their department's
  useEffect(() => {
    const endpoint = isTeacher ? "/courses/mine" : "/courses/my-year";
    api.get<Course[]>(endpoint)
      .then((r) => {
        const list = r.data ?? [];
        setCourses(list);
        if (list.length) setCourseId(list[0].id);
        else setLoadingPosts(false);
      })
      .catch(() => { setCourses([]); setLoadingPosts(false); });
  }, [isTeacher]);

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
      setActivePost({ ...activePost, replies: [...activePost.replies, { ...r.data, reactions: emptyReactions }] });
      setReply("");
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to reply");
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePostReaction(postId: string, type: string) {
    try {
      const r = await api.post<ReactionSummary>("/forum/reactions", { postId, type });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, reactions: r.data } : p));
      setActivePost((p) => p && p.id === postId ? { ...p, reactions: r.data } : p);
    } catch { /* ignore */ }
  }

  async function toggleReplyReaction(replyId: string, type: string) {
    try {
      const r = await api.post<ReactionSummary>("/forum/reactions", { replyId, type });
      setActivePost((p) => p ? {
        ...p,
        replies: p.replies.map((rep) => rep.id === replyId ? { ...rep, reactions: r.data } : rep),
      } : p);
    } catch { /* ignore */ }
  }

  async function submitReport(reason: string) {
    if (!reportTarget) return;
    try {
      const res = await api.post<{ message: string }>("/forum/reports", { ...reportTarget, reason });
      alert(res.data.message ?? "Report submitted");
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to report");
    } finally {
      setReportTarget(null);
    }
  }

  async function deletePost(postId: string) {
    if (!confirm("Remove this thread?")) return;
    try {
      await api.delete(`/forum/posts/${postId}`);
      setActivePost(null);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to remove");
    }
  }

  async function deleteReply(replyId: string) {
    if (!confirm("Remove this reply?")) return;
    try {
      await api.delete(`/forum/replies/${replyId}`);
      setActivePost((p) => p ? { ...p, replies: p.replies.filter((r) => r.id !== replyId) } : p);
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to remove");
    }
  }

  const canDelete = (author: Author) => author.id === user?.id || canModerate;

  // ── Report reason picker overlay ─────────────────────────
  const reportOverlay = reportTarget && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setReportTarget(null)}>
      <div className="glass-panel p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-primary">Report content</h3>
          <button type="button" onClick={() => setReportTarget(null)} aria-label="Close">
            <X className="h-4 w-4 text-muted" />
          </button>
        </div>
        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <button key={r.value} type="button" onClick={() => submitReport(r.value)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-secondary hover:text-primary transition-colors"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Thread detail view ───────────────────────────────────
  if (activePost || loadingPost) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        {reportOverlay}
        <button type="button" onClick={() => setActivePost(null)}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to threads
        </button>

        {loadingPost || !activePost ? (
          <div className="h-40 rounded-2xl skeleton" />
        ) : (
          <>
            <div className="glass-panel p-6">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {activePost.isPinned && <Pin className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} />}
                  <h1 className="font-display text-xl font-bold text-primary">{activePost.title}</h1>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button type="button" onClick={() => setReportTarget({ postId: activePost.id })}
                    aria-label="Report thread" title="Report"
                    className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors">
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                  {canDelete(activePost.author) && (
                    <button type="button" onClick={() => deletePost(activePost.id)}
                      aria-label="Remove thread" title="Remove"
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "var(--state-error)" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted mb-4">
                {activePost.author.fullName} · {timeAgo(activePost.createdAt)}
              </p>
              <p className="text-sm text-secondary whitespace-pre-wrap leading-relaxed mb-4">{activePost.content}</p>
              <ReactionBar summary={activePost.reactions} onToggle={(t) => togglePostReaction(activePost.id, t)} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-primary mb-3">
                {activePost.replies.length} {activePost.replies.length === 1 ? "Reply" : "Replies"}
              </h2>
              <div className="space-y-3">
                {activePost.replies.map((r) => (
                  <div key={r.id} className="glass-panel p-4">
                    <div className="flex gap-3">
                      <CornerDownRight className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted mb-1">{r.author.fullName} · {timeAgo(r.createdAt)}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button type="button" onClick={() => setReportTarget({ replyId: r.id })}
                              aria-label="Report reply" title="Report"
                              className="p-1 rounded text-muted hover:text-primary transition-colors">
                              <Flag className="h-3 w-3" />
                            </button>
                            {canDelete(r.author) && (
                              <button type="button" onClick={() => deleteReply(r.id)}
                                aria-label="Remove reply" title="Remove"
                                className="p-1 rounded transition-colors" style={{ color: "var(--state-error)" }}>
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-secondary whitespace-pre-wrap mb-2">{r.content}</p>
                        <ReactionBar summary={r.reactions ?? emptyReactions} onToggle={(t) => toggleReplyReaction(r.id, t)} />
                      </div>
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
                aria-label="Reply"
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
      {reportOverlay}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary mb-1">Forum</h1>
          <p className="text-secondary text-sm">Discuss course material with the class.</p>
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
          <p className="text-muted text-xs mt-1">
            {isTeacher ? "Course forums appear for courses assigned to you." : "Course forums appear once you have courses."}
          </p>
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
          {posts.map((p) => {
            const totalReactions = Object.values(p.reactions.counts).reduce((s, n) => s + n, 0);
            return (
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
                      {totalReactions > 0 && ` · ${totalReactions} reactions`}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
