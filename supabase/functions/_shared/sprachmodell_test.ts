// Deno-Test: deno test --allow-env supabase/functions/_shared/sprachmodell_test.ts
// Prüft das Auslesen der Streams beider Anbieter mit nachgebauten Antworten.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { antworte, streameAntwort } from './sprachmodell.ts'

function sseAntwort(zeilen: string[], status = 200): Response {
  const text = zeilen.join('\n') + '\n'
  return new Response(
    new ReadableStream({
      start(c) {
        // in kleinen Stücken liefern, um Stückgrenzen zu testen
        const bytes = new TextEncoder().encode(text)
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7))
        c.close()
      },
    }),
    { status, headers: { 'content-type': 'text/event-stream' } },
  )
}

function mitFetch(antwort: () => Response, pruefe?: (url: string, init: RequestInit) => void) {
  const original = globalThis.fetch
  globalThis.fetch = ((url: string, init: RequestInit) => {
    pruefe?.(String(url), init)
    return Promise.resolve(antwort())
  }) as typeof fetch
  return () => { globalThis.fetch = original }
}

Deno.test('Anthropic: liefert nur sichtbaren Text, ignoriert Denk-Blöcke', async () => {
  Deno.env.set('LLM_ANBIETER', 'anthropic')
  Deno.env.set('ANTHROPIC_API_KEY', 'test')
  Deno.env.delete('LLM_MODELL')
  Deno.env.set('LLM_AUFWAND', 'low')
  let body: Record<string, unknown> = {}
  const zurueck = mitFetch(
    () =>
      sseAntwort([
        'event: message_start', 'data: {"type":"message_start","message":{"id":"m1"}}', '',
        'event: content_block_start', 'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}', '',
        'event: content_block_delta', 'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"geheim"}}', '',
        'event: content_block_start', 'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}', '',
        'event: content_block_delta', 'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Becken "}}', '',
        'event: ping', 'data: {"type":"ping"}', '',
        'event: content_block_delta', 'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"ruhig halten."}}', '',
        'event: message_stop', 'data: {"type":"message_stop"}', '',
      ]),
    (url, init) => {
      assertEquals(url, 'https://api.anthropic.com/v1/messages')
      body = JSON.parse(String(init.body))
      assertEquals((init.headers as Record<string, string>)['anthropic-version'], '2023-06-01')
    },
  )
  try {
    const stuecke: string[] = []
    for await (const s of streameAntwort({ system: 'S', nachrichten: [{ role: 'user', content: 'F' }] })) stuecke.push(s)
    assertEquals(stuecke.join(''), 'Becken ruhig halten.')
    assertEquals(body.model, 'claude-sonnet-5-5')
    assertEquals(body.stream, true)
    assertEquals(body.output_config, { effort: 'low' })
    assertEquals('temperature' in body, false)
  } finally {
    zurueck()
    Deno.env.delete('LLM_AUFWAND')
  }
})

Deno.test('Anthropic: Fehler werden sichtbar gemeldet', async () => {
  Deno.env.set('LLM_ANBIETER', 'anthropic')
  Deno.env.set('ANTHROPIC_API_KEY', 'test')
  const zurueck = mitFetch(() => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 }))
  try {
    await assertRejects(() => antworte({ system: 'S', nachrichten: [{ role: 'user', content: 'F' }] }), Error, '401')
  } finally {
    zurueck()
  }
})

Deno.test('OpenAI-kompatibel: eigenes Modell über Basis-URL', async () => {
  Deno.env.set('LLM_ANBIETER', 'openai')
  Deno.env.set('LLM_BASIS_URL', 'http://gpu-server:8000/v1/')
  Deno.env.set('LLM_MODELL', 'mein-modell')
  let url = ''
  let body: Record<string, unknown> = {}
  const zurueck = mitFetch(
    () =>
      sseAntwort([
        'data: {"choices":[{"delta":{"role":"assistant"}}]}', '',
        'data: {"choices":[{"delta":{"content":"Hallo "}}]}', '',
        'data: {"choices":[{"delta":{"content":"Welt"}}]}', '',
        'data: [DONE]', '',
      ]),
    (u, init) => { url = u; body = JSON.parse(String(init.body)) },
  )
  try {
    assertEquals(await antworte({ system: 'Sys', nachrichten: [{ role: 'user', content: 'F' }] }), 'Hallo Welt')
    assertEquals(url, 'http://gpu-server:8000/v1/chat/completions')
    assertEquals(body.model, 'mein-modell')
    assertEquals((body.messages as { role: string }[])[0].role, 'system')
  } finally {
    zurueck()
    Deno.env.delete('LLM_ANBIETER')
    Deno.env.delete('LLM_BASIS_URL')
    Deno.env.delete('LLM_MODELL')
  }
})
