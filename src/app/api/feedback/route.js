export async function POST(request) {
    try {
      const { transcript, analysis, level, question } = await request.json();
  
      if (!transcript) {
        return Response.json({ error: 'No transcript provided' }, { status: 400 });
      }
  
      const levelInstructions = {
        basic: `Focus only on obvious issues: filler words, awkward phrasing, and one or two simple improvements. Keep suggestions short and friendly. Don't nitpick.`,
        intermediate: `Point out grammar issues, weak vocabulary, and unclear sentences. Suggest clearer alternatives. Aim for clear, professional everyday English.`,
        advanced: `Focus on professional polish: confident phrasing, strong verbs, concise sentences. Suggest industry-ready alternatives. Assume good fluency; help them sound sharper, not simpler.`,
      };
  
      const chosenLevel = level || 'basic';
  
      const prompt = `You are helping someone improve their mock interview answer.
  
  ${question ? `The interview question they were answering was: "${question}"\n` : ''}
  
  Here is their transcript:
  """
  ${transcript}
  """
  
  Here is objective data about their speech:
  - Filler words detected: ${JSON.stringify(analysis?.fillers?.counts || {})} (${analysis?.fillers?.total || 0} total)
  - Pauses: ${analysis?.pauses?.total || 0} (minor: ${analysis?.pauses?.minor || 0}, long: ${analysis?.pauses?.long || 0}, very long: ${analysis?.pauses?.veryLong || 0})
  - Speaking pace: ${analysis?.pace?.wpm || 0} words per minute (${analysis?.pace?.rating || 'unknown'})
  
  Feedback level: ${chosenLevel.toUpperCase()}
  ${levelInstructions[chosenLevel]}
  
  Return your response as VALID JSON ONLY (no markdown, no backticks) matching this exact shape:
  {
    "overall": "One short paragraph summarizing how they did, written directly to them.",
    "weakSentences": [
      {
        "original": "exact phrase from transcript",
        "improved": "better version",
        "why": "one short sentence explaining why"
      }
    ],
    "patterns": [
      "short observation about a pattern you noticed (max 3)"
    ],
    "encouragement": "One short encouraging sentence."
  }
  
  If there are no weak sentences, return an empty array for weakSentences. Max 5 weak sentences.`;
  
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
  
      const data = await res.json();
  
      if (!res.ok) {
        return Response.json({ error: data }, { status: 500 });
      }
  
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
      if (!rawText) {
        return Response.json({ error: 'No feedback generated' }, { status: 500 });
      }
  
      const feedback = JSON.parse(rawText);
  
      return Response.json({ feedback });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }