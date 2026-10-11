import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const question = formData.get('question') || null;
    const transcript = formData.get('transcript') || null;
    const analysis = formData.get('analysis') ? JSON.parse(formData.get('analysis')) : null;
    const feedback = formData.get('feedback') ? JSON.parse(formData.get('feedback')) : null;
    const audioDuration = formData.get('audioDuration') ? parseFloat(formData.get('audioDuration')) : null;
    const level = formData.get('level') || null;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload video to Supabase Storage
    const timestamp = Date.now();
    const filename = `recording-${timestamp}.webm`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(filename, arrayBuffer, {
        contentType: 'video/webm',
        upsert: false,
      });

    if (uploadError) {
      return Response.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('recordings')
      .getPublicUrl(filename);

    const videoUrl = urlData.publicUrl;

    // Insert row into sessions table
    const { data: inserted, error: insertError } = await supabase
      .from('sessions')
      .insert({
        question,
        transcript,
        analysis,
        feedback,
        video_url: videoUrl,
        audio_duration: audioDuration,
        level,
      })
      .select()
      .single();

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({ session: inserted });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}