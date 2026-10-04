export async function GET(request, { params }) {
    try {
      const { id } = await params;
  
      if (!id) {
        return Response.json({ error: 'No transcript ID provided' }, { status: 400 });
      }
  
      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
        },
      });
  
      const data = await res.json();
  
      if (!res.ok) {
        return Response.json({ error: data }, { status: 500 });
      }
  
      // AssemblyAI returns status: "queued" | "processing" | "completed" | "error"
      return Response.json({
        status: data.status,
        text: data.text || null,
        words: data.words || null,
        audio_duration: data.audio_duration || null,
        error: data.error || null,
      });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }