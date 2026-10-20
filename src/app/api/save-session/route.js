import { supabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      videoUrl,
      question,
      transcript,
      analysis,
      feedback,
      audioDuration,
      level,
    } = body;

    if (!videoUrl) {
      return Response.json({ error: 'No videoUrl provided' }, { status: 400 });
    }

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