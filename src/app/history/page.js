'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
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

    loadSessions();
  }, []);

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
        <p className="text-zinc-500">Loading sessions...</p>
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
            No saved sessions yet. Record your first mock interview and click &ldquo;Save Session&rdquo; to see it here.
          </p>
        </div>
      )}

      <div className="w-full max-w-3xl flex flex-col gap-4">
        {sessions.map((session) => (
          <div key={session.id} className="p-4 bg-white rounded-lg shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs text-zinc-500">
                  {new Date(session.created_at).toLocaleString()}
                </p>
                {session.question && (
                  <p className="text-sm font-semibold text-zinc-800 mt-1">
                    Q: {session.question}
                  </p>
                )}
                {session.transcript && (
                  <p className="text-sm text-zinc-700 mt-2 line-clamp-3">
                    {session.transcript}
                  </p>
                )}
                <div className="flex gap-3 mt-3 text-xs text-zinc-500">
                  {session.audio_duration && (
                    <span>Duration: {Number(session.audio_duration).toFixed(1)}s</span>
                  )}
                  {session.level && <span>Level: {session.level}</span>}
                  {session.analysis?.fillers?.total !== undefined && (
                    <span>Fillers: {session.analysis.fillers.total}</span>
                  )}
                </div>
              </div>
            </div>

            {session.video_url && (
              <video
                src={session.video_url}
                controls
                className="mt-3 w-full rounded-lg bg-black"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}