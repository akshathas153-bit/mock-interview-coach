export async function POST(request) {
    try {
      const formData = await request.formData();
      const file = formData.get('file');
  
      if (!file) {
        return Response.json({ error: 'No file provided' }, { status: 400 });
      }
  
      // Convert the incoming file to a Buffer so we can forward it raw
      const arrayBuffer = await file.arrayBuffer();
  
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          'content-type': 'application/octet-stream',
        },
        body: arrayBuffer,
      });
  
      const uploadData = await uploadRes.json();
  
      if (!uploadRes.ok) {
        return Response.json({ error: uploadData }, { status: 500 });
      }
  
      // AssemblyAI returns { upload_url: "https://..." }
      return Response.json({ upload_url: uploadData.upload_url });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }