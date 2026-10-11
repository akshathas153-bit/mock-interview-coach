export async function POST(request) {
  try {
    const { role, count } = await request.json();

    if (!role) {
      return Response.json({ error: 'No role provided' }, { status: 400 });
    }

    const questionCount = count || 5;

    const prompt = `Generate ${questionCount} realistic interview questions for this role: "${role}".

Return your response as VALID JSON ONLY (no markdown, no backticks) matching this exact shape:
{
  "questions": ["question 1", "question 2"]
}

Questions should be short, specific to the role, and suitable for a spoken mock interview.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
      return Response.json({ error: 'No questions generated' }, { status: 500 });
    }

    const parsed = JSON.parse(rawText);

    return Response.json({ questions: parsed.questions });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
