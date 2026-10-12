export async function POST(request) {
    try {
      const { transcript, question, level } = await request.json();
  
      if (!transcript) {
        return Response.json({ error: 'No transcript provided' }, { status: 400 });
      }
  
      const chosenLevel = level || 'intermediate';
  
      const levelGuidance = {
        basic: `Rewrite using clear, simple, correct English. Fix grammar and structure. Keep vocabulary accessible.`,
        intermediate: `Rewrite using polished, professional English suitable for a job interview. Fix grammar, improve flow, choose stronger words.`,
        advanced: `Rewrite using confident, articulate, industry-ready English. Use strong verbs, concise phrasing, and a compelling narrative structure.`,
      };
  
      const prompt = `You are helping someone improve their interview answer.
  
  ${question ? `Interview question: "${question}"\n` : ''}
  
  Their original answer:
  """
  ${transcript}
  """
  
  Task: Rewrite this answer as a polished, professional interview response.
  
  Guidelines:
  - ${levelGuidance[chosenLevel]}
  - Keep the same core meaning and examples they used — do NOT invent new facts or achievements.
  - Preserve their voice — this should sound like a better version of them, not like a corporate robot.
  - Make it natural to speak out loud (not written-essay style).
  - Aim for roughly the same length as the original — don't pad it.
  - If their original was very short, just improve what's there.
  
  Return VALID JSON ONLY (no markdown, no backticks) in this exact shape:
  {
    "rewritten": "The full rewritten answer as one string.",
    "changes": [
      "Short note on what you improved (max 4 items). E.g., 'Replaced filler words with stronger verbs', 'Added clear structure: past → present → future'."
    ],
    "tip": "One short tip for next time."
  }`;
  
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
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
        return Response.json({ error: 'No rewrite generated' }, { status: 500 });
      }
  
      const rewrite = JSON.parse(rawText);
  
      return Response.json({ rewrite });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }