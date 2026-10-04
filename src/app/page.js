'use client';

import { useRef, useEffect, useState } from 'react';
import { analyzeAll } from '@/lib/analyze';

export default function Home() {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);

  // Analysis pipeline state
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null); // queued | processing | completed | error
  const [transcript, setTranscript] = useState(null);
  const [words, setWords] = useState(null);
  const [duration, setDuration] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [level, setLevel] = useState('basic');

  // Step 1: Start camera preview when page loads
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera access denied or unavailable:', err);
      }
    }
    startCamera();
  }, []);

  // Step 2: Start recording
  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];

    const recorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      setRecordedVideoUrl(URL.createObjectURL(blob));
    };

    recorder.start();
    setIsRecording(true);
  }

  // Step 3: Stop recording
  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  // Step 4: Upload + Analyze
  async function analyzeRecording() {
    if (!recordedBlob) return;

    setIsProcessing(true);
    setAnalysisError(null);
    setTranscript(null);
    setWords(null);
    setAnalysis(null);
    setFeedback(null);
    setFeedbackError(null);
    setStatus('uploading');
    try {
      // 4a: Upload video → get AssemblyAI URL
      const formData = new FormData();
      formData.append('file', recordedBlob, 'recording.webm');

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) throw new Error(uploadData.error?.message || 'Upload failed');

      // 4b: Submit transcription job
      const submitRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audioUrl: uploadData.upload_url }),
      });
      const submitData = await submitRes.json();

      if (!submitRes.ok) throw new Error(submitData.error?.error || 'Submit failed');

      setJobId(submitData.id);
      setStatus('queued');

      // 4c: Poll until completed
      pollUntilDone(submitData.id);
    } catch (err) {
      setAnalysisError(err.message);
      setIsProcessing(false);
      setStatus('error');
    }
  }
  // Step 4.5: Get AI feedback from Gemini
  async function fetchFeedback() {
    if (!transcript || !analysis) return;

    setIsLoadingFeedback(true);
    setFeedbackError(null);
    setFeedback(null);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript,
          analysis,
          level,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.error?.message || data.error || 'Feedback failed');

      setFeedback(data.feedback);
    } catch (err) {
      setFeedbackError(err.message);
    } finally {
      setIsLoadingFeedback(false);
    }
  }
  // Step 5: Poll the status route every 3 seconds
  async function pollUntilDone(id) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/transcribe/${id}`);
        const data = await res.json();

        setStatus(data.status);

        if (data.status === 'completed') {
          setTranscript(data.text);
          setWords(data.words);
          setDuration(data.audio_duration);

          // Run the analysis right away
          const result = analyzeAll({
            transcript: data.text,
            words: data.words,
            durationSec: data.audio_duration,
          });
          setAnalysis(result);

          setIsProcessing(false);
          clearInterval(interval);
        } else if (data.status === 'error') {
          setAnalysisError(data.error || 'Transcription failed');
          setIsProcessing(false);
          clearInterval(interval);
        }
      } catch (err) {
        setAnalysisError(err.message);
        setIsProcessing(false);
        clearInterval(interval);
      }
    }, 3000);
  }

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-zinc-50 p-8 gap-6">
      <h1 className="text-3xl font-bold">Mock Interview Coach</h1>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="rounded-lg shadow-lg w-full max-w-2xl bg-black"
      />

      <div className="flex gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-6 py-3 bg-zinc-800 text-white rounded-lg font-semibold hover:bg-zinc-900"
          >
            Stop Recording
          </button>
        )}
      </div>

      {recordedVideoUrl && (
        <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
          <h2 className="text-xl font-semibold">Your Recording</h2>
          <video
            src={recordedVideoUrl}
            controls
            className="rounded-lg shadow-lg w-full"
          />

          <button
            onClick={analyzeRecording}
            disabled={isProcessing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Analyzing...' : 'Upload & Analyze'}
          </button>
        </div>
      )}

      {status && (
        <div className="w-full max-w-2xl p-4 bg-white rounded-lg shadow">
          <p className="text-sm text-zinc-600">
            <span className="font-semibold">Status:</span> {status}
            {jobId && <span className="ml-2 text-zinc-400">(job {jobId.slice(0, 8)}...)</span>}
          </p>
        </div>
      )}

      {analysisError && (
        <div className="w-full max-w-2xl p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-semibold">Error</p>
          <p className="text-red-600 text-sm">{analysisError}</p>
        </div>
      )}

      {transcript && (
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div className="p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-2">Transcript</h2>
            <p className="text-zinc-700 whitespace-pre-wrap">{transcript}</p>
            {duration && (
              <p className="text-sm text-zinc-500 mt-2">
                Duration: {duration.toFixed(1)}s
              </p>
            )}
          </div>

          {words && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-2">Word Stats</h2>
              <p className="text-zinc-700">
                Total words: <span className="font-mono">{words.length}</span>
              </p>
            </div>
          )}

          {analysis && (
            <>
              {/* Filler words panel */}
              <div className="p-4 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-3">
                  Filler Words
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    ({analysis.fillers.total} total)
                  </span>
                </h2>

                {analysis.fillers.total === 0 ? (
                  <p className="text-green-600 font-medium">
                    🎉 No filler words detected — great job!
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(analysis.fillers.counts).map(([word, count]) => (
                      <span
                        key={word}
                        className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-sm text-amber-800"
                      >
                        {word} <span className="font-bold">×{count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Pauses panel */}
              <div className="p-4 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-3">
                  Pauses
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    ({analysis.pauses.total} total)
                  </span>
                </h2>

                <div className="flex gap-4 mb-3 text-sm">
                  <span className="text-zinc-600">
                    Minor (1.5–3s): <span className="font-bold">{analysis.pauses.minor}</span>
                  </span>
                  <span className="text-orange-600">
                    Long (3–5s): <span className="font-bold">{analysis.pauses.long}</span>
                  </span>
                  <span className="text-red-600">
                    Very long (5s+): <span className="font-bold">{analysis.pauses.veryLong}</span>
                  </span>
                </div>

                {analysis.pauses.pauses.length > 0 && (
                  <ul className="text-sm text-zinc-600 space-y-1">
                    {analysis.pauses.pauses.slice(0, 5).map((p, i) => (
                      <li key={i}>
                        {p.durationSec}s pause after &ldquo;{p.after}&rdquo; (at {p.atSec}s)
                      </li>
                    ))}
                  </ul>
                )}
              </div>

                           {/* Pace panel */}
                           <div className="p-4 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-2">Speaking Pace</h2>
                <p className="text-zinc-700">
                  <span className="font-mono text-2xl">{analysis.pace.wpm}</span>
                  <span className="ml-2 text-zinc-500">words per minute</span>
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  Rating: <span className="font-semibold">{analysis.pace.rating}</span>
                  <span className="ml-2 text-zinc-400">(ideal: 120–160 wpm)</span>
                </p>
              </div>

              {/* Level selector + Get AI Feedback */}
              <div className="p-4 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-3">AI Feedback</h2>

                <label className="block text-sm text-zinc-600 mb-2">
                  Choose feedback level:
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full mb-3 px-3 py-2 border border-zinc-300 rounded-lg bg-white"
                >
                  <option value="basic">Basic — filler words + simple fixes</option>
                  <option value="intermediate">Intermediate — grammar + clarity</option>
                  <option value="advanced">Advanced — professional polish</option>
                </select>

                <button
                  onClick={fetchFeedback}
                  disabled={isLoadingFeedback}
                  className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
                >
                  {isLoadingFeedback ? 'Getting feedback...' : 'Get AI Feedback'}
                </button>
              </div>

              {/* Feedback error */}
              {feedbackError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-semibold">Feedback Error</p>
                  <p className="text-red-600 text-sm">{feedbackError}</p>
                </div>
              )}

              {/* Feedback display */}
              {feedback && (
                <>
                  <div className="p-4 bg-white rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-2">Overall</h2>
                    <p className="text-zinc-700">{feedback.overall}</p>
                  </div>

                  {feedback.weakSentences && feedback.weakSentences.length > 0 && (
                    <div className="p-4 bg-white rounded-lg shadow">
                      <h2 className="text-xl font-semibold mb-3">Suggested Improvements</h2>
                      <div className="space-y-4">
                        {feedback.weakSentences.map((item, i) => (
                          <div key={i} className="border-l-4 border-purple-400 pl-3">
                            <p className="text-sm text-red-600 line-through">
                              &ldquo;{item.original}&rdquo;
                            </p>
                            <p className="text-sm text-green-700 font-medium mt-1">
                              → &ldquo;{item.improved}&rdquo;
                            </p>
                            <p className="text-xs text-zinc-500 mt-1">{item.why}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {feedback.patterns && feedback.patterns.length > 0 && (
                    <div className="p-4 bg-white rounded-lg shadow">
                      <h2 className="text-xl font-semibold mb-2">Patterns to Watch</h2>
                      <ul className="list-disc list-inside text-zinc-700 space-y-1">
                        {feedback.patterns.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {feedback.encouragement && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800">{feedback.encouragement}</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}