
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [loadingFeedbackFor, setLoadingFeedbackFor] = useState(null);
  const [feedbackErrors, setFeedbackErrors] = useState({});

  async function loadSessions() {
    try {
      const { data, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw new Error(fetchError.message);

      setSessions(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  async function deleteSession(session) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeletingId(session.id);

    try {
      if (session.video_url) {
        const parts = session.video_url.split('/');
        const filename = parts[parts.length - 1];
        await supabase.storage.from('recordings').remove([filename]);
      }

      const { error: deleteError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', session.id);

      if (deleteError) throw new Error(deleteError.message);

      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function generateFeedbackFor(session) {
    setLoadingFeedbackFor(session.id);
    setFeedbackErrors((prev) => ({ ...prev, [session.id]: null }));

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript: session.transcript,
          analysis: session.analysis,
          level: session.level || 'basic',
          question: session.question || '',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.error?.message || data.error || 'Feedback failed');
      }

      // Save the feedback back to Supabase
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ feedback: data.feedback })
        .eq('id', session.id);

      if (updateError) throw new Error(updateError.message);

      // Update local state
      setSessions((prev) =>
        prev.map((s) =>
          s.id === session.id ? { ...s, feedback: data.feedback } : s
        )
      );
    } catch (err) {
      setFeedbackErrors((prev) => ({ ...prev, [session.id]: err.message }));
    } finally {
      setLoadingFeedbackFor(null);
    }
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-zinc-50 p-8 gap-6">
      <div className="w-full max-w-3xl flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Past Sessions</h1>
        <Link
          href="/"
          className="px-4 py-2 bg-zinc-800 text-white rounded-lg font-semibold hover:bg-zinc-900"
        >
          ← Back to Recorder
        </Link>
      </div>

      {isLoading && (
        <div className="w-full max-w-3xl flex flex-col gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 bg-white rounded-lg shadow animate-pulse">
              <div className="h-3 w-32 bg-zinc-200 rounded" />
              <div className="h-3 w-full bg-zinc-200 rounded mt-3" />
              <div className="h-3 w-3/4 bg-zinc-200 rounded mt-2" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="w-full max-w-3xl p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-semibold">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {!isLoading && sessions.length === 0 && (
        <div className="w-full max-w-3xl p-8 bg-white rounded-lg shadow text-center">
          <p className="text-zinc-500">
            No saved sessions yet. Record your first mock interview and click
            &ldquo;Save Session&rdquo; to see it here.
          </p>
        </div>
      )}

      <div className="w-full max-w-3xl flex flex-col gap-4">
        {sessions.map((session) => {
          const isExpanded = expandedId === session.id;
          const isLoadingFb = loadingFeedbackFor === session.id;
          const fbError = feedbackErrors[session.id];

          return (
            <div key={session.id} className="p-4 bg-white rounded-lg shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500">
                    {new Date(session.created_at).toLocaleString()}
                  </p>
                  {session.question && (
                    <p className="text-sm font-semibold text-zinc-800 mt-1">
                      Q: {session.question}
                    </p>
                  )}
                  {session.transcript && (
                    <p className="text-sm text-zinc-700 mt-2">
                      {session.transcript.length > 200
                        ? session.transcript.slice(0, 200) + '…'
                        : session.transcript}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-500">
                    {session.audio_duration && (
                      <span>
                        Duration: {Number(session.audio_duration).toFixed(1)}s
                      </span>
                    )}
                    {session.level && <span>Level: {session.level}</span>}
                    {session.analysis?.fillers?.total !== undefined && (
                      <span>Fillers: {session.analysis.fillers.total}</span>
                    )}
                    {session.analysis?.pace?.wpm !== undefined && (
                      <span>Pace: {session.analysis.pace.wpm} wpm</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : session.id)
                    }
                    className="px-3 py-2 text-sm rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-700 hover:bg-zinc-200"
                  >
                    {isExpanded ? '▲ Hide details' : '▼ View details'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSession(session)}
                    disabled={deletingId === session.id}
                    className="px-3 py-2 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingId === session.id ? '...' : '🗑️ Delete'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4">
                  {session.video_url && (
                    <video
                      src={session.video_url}
                      controls
                      className="w-full rounded-lg bg-black"
                    />
                  )}

                  {session.transcript && (
                    <div className="p-3 bg-zinc-50 rounded-lg">
                      <h3 className="text-sm font-semibold text-zinc-700 mb-1">
                        Full Transcript
                      </h3>
                      <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                        {session.transcript}
                      </p>
                    </div>
                  )}

                  {session.analysis && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-zinc-50 rounded-lg">
                        <h4 className="text-xs font-semibold text-zinc-600 mb-2">
                          Filler Words
                        </h4>
                        <p className="text-sm text-zinc-700">
                          Total: {session.analysis.fillers?.total ?? 0}
                        </p>
                        {session.analysis.fillers?.counts &&
                          Object.keys(session.analysis.fillers.counts).length >
                            0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {Object.entries(session.analysis.fillers.counts)
                                .slice(0, 5)
                                .map(([w, c]) => (
                                  <span
                                    key={w}
                                    className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs"
                                  >
                                    {w} ×{c}
                                  </span>
                                ))}
                            </div>
                          )}
                      </div>

                      <div className="p-3 bg-zinc-50 rounded-lg">
                        <h4 className="text-xs font-semibold text-zinc-600 mb-2">
                          Pauses
                        </h4>
                        <p className="text-sm text-zinc-700">
                          Total: {session.analysis.pauses?.total ?? 0}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          Minor: {session.analysis.pauses?.minor ?? 0} · Long:{' '}
                          {session.analysis.pauses?.long ?? 0} · Very long:{' '}
                          {session.analysis.pauses?.veryLong ?? 0}
                        </p>
                      </div>

                      <div className="p-3 bg-zinc-50 rounded-lg">
                        <h4 className="text-xs font-semibold text-zinc-600 mb-2">
                          Speaking Pace
                        </h4>
                        <p className="text-sm text-zinc-700">
                          {session.analysis.pace?.wpm ?? 0} wpm
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {session.analysis.pace?.rating ?? '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {session.feedback ? (
                    <div className="flex flex-col gap-2">
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <h3 className="text-sm font-semibold text-purple-800 mb-1">
                          Overall
                        </h3>
                        <p className="text-sm text-zinc-700">
                          {session.feedback.overall}
                        </p>
                      </div>

                      {session.feedback.weakSentences?.length > 0 && (
                        <div className="p-3 bg-zinc-50 rounded-lg">
                          <h3 className="text-sm font-semibold text-zinc-700 mb-2">
                            Suggested Improvements
                          </h3>
                          <div className="space-y-3">
                            {session.feedback.weakSentences.map((item, i) => (
                              <div
                                key={i}
                                className="border-l-4 border-purple-400 pl-3"
                              >
                                <p className="text-sm text-red-600 line-through">
                                  &ldquo;{item.original}&rdquo;
                                </p>
                                <p className="text-sm text-green-700 font-medium mt-1">
                                  → &ldquo;{item.improved}&rdquo;
                                </p>
                                <p className="text-xs text-zinc-500 mt-1">
                                  {item.why}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {session.feedback.patterns?.length > 0 && (
                        <div className="p-3 bg-zinc-50 rounded-lg">
                          <h3 className="text-sm font-semibold text-zinc-700 mb-1">
                            Patterns to Watch
                          </h3>
                          <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                            {session.feedback.patterns.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {session.feedback.encouragement && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-800">
                            {session.feedback.encouragement}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800 mb-2">
                        No feedback yet for this session.
                      </p>
                      <button
                        type="button"
                        onClick={() => generateFeedbackFor(session)}
                        disabled={isLoadingFb}
                        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
                      >
                        {isLoadingFb ? 'Getting feedback...' : '✨ Get AI Feedback'}
                      </button>
                      {fbError && (
                        <p className="text-xs text-red-600 mt-2">{fbError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}