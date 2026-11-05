const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.5-transcribe',
];
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const TRIAGE_PROMPT = `Listen to this audio and return ONLY a valid JSON object — no markdown, no code fences, no explanation.

The JSON must have exactly these keys:
{
  "transcript": "<verbatim spoken words, or empty string if no intelligible speech>",
  "severity": "<one of: critical | moderate | stable>",
  "reason": "<one sentence explaining your severity assessment based on what was heard>"
}

Severity guide:
- critical: life-threatening — unconscious, not breathing, severe bleeding, chest pain, stroke signs
- moderate: urgent but stable — conscious, in pain, minor bleeding, possible fracture
- stable: alert, responsive, minor injury or unclear situation`;

/** Extract and parse JSON from a raw Gemini text response (strips markdown fences if present). */
function parseTriageJson(raw) {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Model may have produced plain text instead of JSON — treat it as transcript only
    return { transcript: raw.trim(), severity: null, reason: null };
  }
}

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
            { text: TRIAGE_PROMPT },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 512, responseMimeType: 'application/json' },
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
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  const parsed = parseTriageJson(raw);
  console.log(
    `[transcribe] ✓ ${model} in ${Date.now() - startedAt}ms — severity: ${parsed.severity ?? 'n/a'} — "${(parsed.transcript ?? '').slice(0, 80)}"`
  );
  return parsed;
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
      const result = await callGemini(key, model, audio, mimeType);
      if (result.transcript || result.severity) {
        console.log(`[transcribe] done in ${Date.now() - totalStartedAt}ms via ${model}`);
        return Response.json({ ...result, model });
      }
      anySucceeded = true;
      errors.push(`${model} returned empty`);
    } catch (err) {
      errors.push(err.message);
    }
  }

  console.log(`[transcribe] giving up after ${Date.now() - totalStartedAt}ms`);

  if (anySucceeded) {
    return Response.json({ transcript: '', severity: null, reason: null, note: 'no speech detected' });
  }

  return Response.json(
    { error: `all Gemini models failed — ${errors.join(' | ')}` },
    { status: 502 }
  );
}
