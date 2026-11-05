const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.5-transcribe',
];
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(key, model, audio, mimeType) {
  const startedAt = Date.now();
  console.log(`[transcribe] → ${model} (audio ${(audio.length / 1024).toFixed(0)}KB)`);
  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: audio } },
            {
              text: 'Transcribe this audio verbatim. Output only the spoken words as plain text, no commentary, no thinking blocks. If there is no intelligible speech, output an empty string.',
            },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.log(
      `[transcribe] ✗ ${model} ${res.status} in ${Date.now() - startedAt}ms — ${detail.slice(0, 150)}`
    );
    throw new Error(`${model} ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const transcript = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  console.log(
    `[transcribe] ✓ ${model} in ${Date.now() - startedAt}ms — "${transcript.slice(0, 80)}"`
  );
  return transcript;
}

export async function POST(request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: 'GEMINI_API_KEY is not set in .env.local' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { audio, mimeType } = body;
  if (!audio || !mimeType) {
    return Response.json(
      { error: 'audio (base64) and mimeType are required' },
      { status: 400 }
    );
  }

  const errors = [];
  let anySucceeded = false;
  const totalStartedAt = Date.now();

  for (const model of GEMINI_MODELS) {
    try {
      const transcript = await callGemini(key, model, audio, mimeType);
      if (transcript) {
        console.log(`[transcribe] done in ${Date.now() - totalStartedAt}ms via ${model}`);
        return Response.json({ transcript, model });
      }
      anySucceeded = true;
      errors.push(`${model} returned empty`);
    } catch (err) {
      errors.push(err.message);
    }
  }

  console.log(`[transcribe] giving up after ${Date.now() - totalStartedAt}ms`);

  if (anySucceeded) {
    return Response.json({ transcript: '', note: 'no speech detected' });
  }

  return Response.json(
    { error: `all Gemini models failed — ${errors.join(' | ')}` },
    { status: 502 }
  );
}
