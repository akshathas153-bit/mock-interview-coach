export async function POST(request) {
    try {
      const { audioUrl } = await request.json();
  
      if (!audioUrl) {
        return Response.json({ error: 'No audioUrl provided' }, { status: 400 });
      }
  
      // Step 1: Submit the audio URL to AssemblyAI for transcription
      const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          // these enable the extra data we want later
          disfluencies: true,        // count "um", "uh", etc.
          punctuate: true,
          format_text: true,
        }),
      });
  
      const submitData = await submitRes.json();
  
      if (!submitRes.ok) {
        return Response.json({ error: submitData }, { status: 500 });
      }
  
      return Response.json({ id: submitData.id, status: 'submitted' });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }