'use client';

import { useRef, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { analyzeAll } from '@/lib/analyze';
import { QUESTIONS } from '@/lib/questions';

export default function Home() {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const resultsRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [words, setWords] = useState(null);
  const [duration, setDuration] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [rewrite, setRewrite] = useState(null);
  const [isLoadingRewrite, setIsLoadingRewrite] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);
  const [level, setLevel] = useState('basic');
  const [selectedCategory, setSelectedCategory] = useState('General');
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedVideoUrl, setSavedVideoUrl] = useState(null);

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

  async function toggleCamera() {
    const stream = streamRef.current;
    if (!stream) return;

    if (cameraOn) {
      stream.getVideoTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });
      setCameraOn(false);
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStream.getVideoTracks().forEach((track) => stream.addTrack(track));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOn(true);
    } catch (err) {
      console.error('Camera access denied or unavailable:', err);
    }
  }

  async function toggleMic() {
    const stream = streamRef.current;
    if (!stream) return;

    if (micOn) {
      stream.getAudioTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });
      setMicOn(false);
      return;
    }

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      setMicOn(true);
    } catch (err) {
      console.error('Microphone access denied or unavailable:', err);
    }
  }

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

    setSavedVideoUrl(null);
    setSaveError(null);
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  async function analyzeRecording() {
    if (!recordedBlob) return;

    setIsProcessing(true);
    setAnalysisError(null);
    setTranscript(null);
    setWords(null);
    setAnalysis(null);
    setFeedback(null);
    setFeedbackError(null);
    setSavedVideoUrl(null);
    setRewrite(null);
    setRewriteError(null);
    setSaveError(null);
    setStatus('uploading');

    try {
           // 1. Upload directly to Supabase Storage (bypasses Vercel size limit)
           const timestamp = Date.now();
           const filename = `recording-${timestamp}.webm`;
     
           const { error: uploadError } = await supabase.storage
             .from('recordings')
             .upload(filename, recordedBlob, {
               contentType: 'video/webm',
               upsert: false,
             });
     
           if (uploadError) throw new Error('Upload failed: ' + uploadError.message);
     
           // 2. Get the public URL
           const { data: urlData } = supabase.storage
             .from('recordings')
             .getPublicUrl(filename);
     
           const publicUrl = urlData.publicUrl;
     
           // 3. Send the URL to our transcribe route
           const submitRes = await fetch('/api/transcribe', {
             method: 'POST',
             headers: { 'content-type': 'application/json' },
             body: JSON.stringify({ audioUrl: publicUrl }),
           });
      const submitData = await submitRes.json();

      if (!submitRes.ok) throw new Error(submitData.error?.error || 'Submit failed');

      setJobId(submitData.id);
      setStatus('queued');

      pollUntilDone(submitData.id);
    } catch (err) {
      setAnalysisError(err.message);
      setIsProcessing(false);
      setStatus('error');
    }
  }

  const CUSTOM_CATEGORY = 'Custom (from your role)';
  const hasCustomQuestions =
    Array.isArray(generatedQuestions) && generatedQuestions.length > 0;
  const questionOptions =
    selectedCategory === CUSTOM_CATEGORY
      ? generatedQuestions
      : QUESTIONS[selectedCategory];

  async function generateQuestions() {
    setIsGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: roleInput, count: 5 }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error?.error?.message || data.error || 'Generate failed');

      setGeneratedQuestions(data.questions);
      setSelectedCategory(CUSTOM_CATEGORY);
      setSelectedQuestion('');
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function fetchRewrite() {
    if (!transcript) return;

    setIsLoadingRewrite(true);
    setRewriteError(null);
    setRewrite(null);

    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript,
          question: selectedQuestion,
          level,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.error?.message || data.error || 'Rewrite failed');
      }

      setRewrite(data.rewrite);
    } catch (err) {
      setRewriteError(err.message);
    } finally {
      setIsLoadingRewrite(false);
    }
  }

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
          question: selectedQuestion,
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

  async function saveSession() {
    if (!recordedBlob || !transcript) return;

    setIsSaving(true);
    setSaveError(null);
    setSavedVideoUrl(null);

    try {
      // Upload video directly to Supabase (bypasses Vercel size limit)
      const timestamp = Date.now();
      const filename = `recording-${timestamp}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(filename, recordedBlob, {
          contentType: 'video/webm',
          upsert: false,
        });

      if (uploadError) throw new Error('Upload failed: ' + uploadError.message);

      const { data: urlData } = supabase.storage
        .from('recordings')
        .getPublicUrl(filename);

      const publicUrl = urlData.publicUrl;

      const res = await fetch('/api/save-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          videoUrl: publicUrl,
          question: selectedQuestion || '',
          transcript: transcript || '',
          analysis: analysis || null,
          feedback: feedback || null,
          audioDuration: duration || 0,
          level: level || 'basic',
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Save failed');

      setSavedVideoUrl(data.session.video_url);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

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
          setStatus('completed'); 

          const result = analyzeAll({
            transcript: data.text,
            words: data.words,
            durationSec: data.audio_duration,
          });
          setAnalysis(result);

          setIsProcessing(false);
          clearInterval(interval);

          setTimeout(() => {
            resultsRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }, 100);
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
      <div className="w-full max-w-2xl flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mock Interview Coach</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Practice interviews with AI feedback on your delivery.
          </p>
        </div>
        <a
          href="/history"
          className="px-4 py-2 bg-zinc-800 text-white rounded-lg font-semibold hover:bg-zinc-900 whitespace-nowrap"
        >
          📚 My Past Sessions
        </a>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-3">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">How to use:</span> Pick a role below and
            generate questions, or choose a category and question. Then record your
            answer, upload for analysis, and get AI feedback.
          </p>
        </div>

        <label className="block text-sm text-zinc-600">
          Role
          <input
            type="text"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            placeholder="e.g. Frontend Developer at a startup"
            className="mt-1 w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-800"
            suppressHydrationWarning
          />
        </label>

        <button
          type="button"
          onClick={generateQuestions}
          disabled={isGenerating}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : 'Generate Questions for This Role'}
        </button>

        {generateError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{generateError}</p>
          </div>
        )}

        <label className="block text-sm text-zinc-600">
          Category
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedQuestion('');
            }}
            className="mt-1 w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-800"
          >
            {Object.keys(QUESTIONS).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
            {hasCustomQuestions && (
              <option value={CUSTOM_CATEGORY}>{CUSTOM_CATEGORY}</option>
            )}
          </select>
        </label>

        <label className="block text-sm text-zinc-600">
          Question
          <select
            value={selectedQuestion}
            onChange={(e) => setSelectedQuestion(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-800"
          >
            <option value="">Select a question</option>
            {questionOptions.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>

        {selectedQuestion && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="font-bold text-zinc-800">{selectedQuestion}</p>
          </div>
        )}
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="rounded-lg shadow-lg w-full max-w-2xl bg-black"
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={toggleCamera}
          className="px-4 py-2 text-sm rounded-lg font-semibold bg-zinc-800 text-white hover:bg-zinc-900"
        >
          {cameraOn ? '📷 Camera On' : '📷 Camera Off'}
        </button>
        <button
          type="button"
          onClick={toggleMic}
          className="px-4 py-2 text-sm rounded-lg font-semibold bg-zinc-800 text-white hover:bg-zinc-900"
        >
          {micOn ? '🎤 Mic On' : '🎤 Mic Off'}
        </button>
      </div>

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
        <div ref={resultsRef} className="w-full max-w-2xl flex flex-col gap-4">
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
              {/* Stats grid: fillers, pauses, pace */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white rounded-lg shadow">
                  <h3 className="text-base font-semibold mb-3 flex items-baseline justify-between">
                    Filler Words
                    <span className="text-sm font-normal text-zinc-500">
                      {analysis.fillers.total}
                    </span>
                  </h3>

                  {analysis.fillers.total === 0 ? (
                    <p className="text-green-600 text-sm font-medium">
                      🎉 None — great!
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(analysis.fillers.counts)
                        .slice(0, 6)
                        .map(([word, count]) => (
                          <span
                            key={word}
                            className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800"
                          >
                            {word} <span className="font-bold">×{count}</span>
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white rounded-lg shadow">
                  <h3 className="text-base font-semibold mb-3 flex items-baseline justify-between">
                    Pauses
                    <span className="text-sm font-normal text-zinc-500">
                      {analysis.pauses.total}
                    </span>
                  </h3>

                  <ul className="text-sm space-y-1">
                    <li className="text-zinc-600">
                      Minor (1.5–3s): <span className="font-bold">{analysis.pauses.minor}</span>
                    </li>
                    <li className="text-orange-600">
                      Long (3–5s): <span className="font-bold">{analysis.pauses.long}</span>
                    </li>
                    <li className="text-red-600">
                      Very long (5s+): <span className="font-bold">{analysis.pauses.veryLong}</span>
                    </li>
                  </ul>

                  {analysis.pauses.pauses.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-2">
                      Longest: {Math.max(...analysis.pauses.pauses.map((p) => p.durationSec))}s
                    </p>
                  )}
                </div>

                <div className="p-4 bg-white rounded-lg shadow">
                  <h3 className="text-base font-semibold mb-3">Speaking Pace</h3>
                  <p className="text-zinc-700">
                    <span className="font-mono text-2xl">{analysis.pace.wpm}</span>
                    <span className="ml-1 text-zinc-500 text-sm">wpm</span>
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    Rating: <span className="font-semibold">{analysis.pace.rating}</span>
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">ideal: 120–160 wpm</p>
                </div>
              </div>

                            {/* Rewrite My Answer */}
                            <div className="p-4 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-3">Rewrite My Answer</h2>
                <p className="text-sm text-zinc-500 mb-3">
                  See how a professional interviewer would expect this answer to sound.
                </p>

                <button
                  onClick={fetchRewrite}
                  disabled={isLoadingRewrite}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isLoadingRewrite ? 'Rewriting...' : '✨ Rewrite My Answer'}
                </button>

                {rewriteError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600 text-sm">{rewriteError}</p>
                  </div>
                )}

                {rewrite && (
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <h3 className="text-sm font-semibold text-indigo-800 mb-2">
                        Polished version
                      </h3>
                      <p className="text-zinc-800 whitespace-pre-wrap">
                        {rewrite.rewritten}
                      </p>
                    </div>

                    {rewrite.changes && rewrite.changes.length > 0 && (
                      <div className="p-3 bg-zinc-50 rounded-lg">
                        <h4 className="text-xs font-semibold text-zinc-600 mb-2">
                          What changed
                        </h4>
                        <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                          {rewrite.changes.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {rewrite.tip && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800">
                          <span className="font-semibold">Tip:</span> {rewrite.tip}
                        </p>
                      </div>
                    )}
                  </div>
                )}
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

              {feedbackError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-semibold">Feedback Error</p>
                  <p className="text-red-600 text-sm">{feedbackError}</p>
                </div>
              )}

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

              <div className="p-4 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-3">Save This Session</h2>
                <button
                  onClick={saveSession}
                  disabled={isSaving || !transcript}
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Session'}
                </button>

                {saveError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600 text-sm">{saveError}</p>
                  </div>
                )}

                {savedVideoUrl && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 text-sm font-semibold">
                      ✅ Saved successfully!
                    </p>
                    <a
                      href={savedVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-700 text-sm underline break-all"
                    >
                      View saved video
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Deployment trigger: Cloudflare Proxy