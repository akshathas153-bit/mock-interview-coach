'use client';

import { useRef, useEffect, useState } from 'react';

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
        </div>
      )}
    </div>
  );
}