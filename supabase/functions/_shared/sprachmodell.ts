// Schnittstelle zum Sprachmodell. Start: Claude API. Später: eigenes Modell
// über eine OpenAI-kompatible Schnittstelle (vLLM, Ollama, …) – Umstellung
// nur über Umgebungsvariablen:
//   LLM_ANBIETER   anthropic | openai        (Standard: anthropic)
//   LLM_MODELL     z. B. claude-sonnet-5-5 oder der Name des eigenen Modells
//   LLM_AUFWAND    optional: low | medium | high (nur Anthropic, steuert Denkaufwand)
//   ANTHROPIC_API_KEY                         (bei anthropic)
//   LLM_BASIS_URL, LLM_API_KEY                (bei openai, z. B. http://gpu-server:8000/v1)
import { env, envOptional } from './umgebung.ts'
import { liesSse } from './sse.ts'

/** Teil einer Nachricht: Text oder Bild (z. B. ein gescanntes Dokument). */
export type Teil = { typ: 'text'; text: string } | { typ: 'bild'; mime: string; base64: string }

export interface Nachricht {
  role: 'user' | 'assistant'
  content: string | Teil[]
}

function alsAnthropic(n: Nachricht) {
  if (typeof n.content === 'string') return n
  return {
    role: n.role,
    content: n.content.map((t) =>
      t.typ === 'text' ? { type: 'text', text: t.text } : { type: 'image', source: { type: 'base64', media_type: t.mime, data: t.base64 } }),
  }
}

function alsOpenAi(n: Nachricht) {
  if (typeof n.content === 'string') return n
  return {
    role: n.role,
    content: n.content.map((t) =>
      t.typ === 'text' ? { type: 'text', text: t.text } : { type: 'image_url', image_url: { url: `data:${t.mime};base64,${t.base64}` } }),
  }
}

export interface Anfrage {
  system: string
  nachrichten: Nachricht[]
  maxTokens?: number
}

export function anbieter(): 'anthropic' | 'openai' {
  return envOptional('LLM_ANBIETER') === 'openai' ? 'openai' : 'anthropic'
}

export function modell(): string {
  return env('LLM_MODELL', anbieter() === 'anthropic' ? 'claude-sonnet-5-5' : undefined)
}

/** Streamt die Antwort Stück für Stück als Text. */
export async function* streameAntwort(anfrage: Anfrage): AsyncGenerator<string> {
  if (anbieter() === 'openai') yield* streameOpenAi(anfrage)
  else yield* streameAnthropic(anfrage)
}

/** Komplette Antwort ohne Streaming, z. B. für Hintergrundaufgaben. */
export async function antworte(anfrage: Anfrage): Promise<string> {
  let text = ''
  for await (const stueck of streameAntwort(anfrage)) text += stueck
  return text
}

async function* streameAnthropic(a: Anfrage): AsyncGenerator<string> {
  const aufwand = envOptional('LLM_AUFWAND')
  const body: Record<string, unknown> = {
    model: modell(),
    max_tokens: a.maxTokens ?? 1500,
    system: a.system,
    messages: a.nachrichten.map(alsAnthropic),
    stream: true,
  }
  if (aufwand) body.output_config = { effort: aufwand }

  const antwort = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!antwort.ok || !antwort.body) {
    throw new Error(`Claude API ${antwort.status}: ${(await antwort.text()).slice(0, 300)}`)
  }

  for await (const e of liesSse(antwort.body)) {
    if (!e.data) continue
    const d = JSON.parse(e.data)
    // Nur sichtbaren Text weitergeben; Denk-Blöcke werden ignoriert.
    if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') yield d.delta.text as string
    else if (d.type === 'error') throw new Error(`Claude API: ${d.error?.message ?? 'unbekannter Fehler'}`)
  }
}

async function* streameOpenAi(a: Anfrage): AsyncGenerator<string> {
  const basis = env('LLM_BASIS_URL').replace(/\/$/, '')
  const schluessel = envOptional('LLM_API_KEY')
  const antwort = await fetch(`${basis}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(schluessel ? { authorization: `Bearer ${schluessel}` } : {}),
    },
    body: JSON.stringify({
      model: modell(),
      max_tokens: a.maxTokens ?? 1500,
      stream: true,
      messages: [{ role: 'system', content: a.system }, ...a.nachrichten.map(alsOpenAi)],
    }),
  })
  if (!antwort.ok || !antwort.body) {
    throw new Error(`Sprachmodell ${antwort.status}: ${(await antwort.text()).slice(0, 300)}`)
  }
  for await (const e of liesSse(antwort.body)) {
    if (!e.data || e.data === '[DONE]') continue
    const stueck = JSON.parse(e.data).choices?.[0]?.delta?.content
    if (typeof stueck === 'string' && stueck) yield stueck
  }
}
