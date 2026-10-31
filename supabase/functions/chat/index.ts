// Chat-Pipeline des Assistenten.
//
// POST { frage, verlauf_id?, kontext?: 'chat' | 'trainer_modus', uebung? }
//   → text/event-stream mit Ereignissen
//      { typ: 'start', verlauf_id }
//      { typ: 'text', t }                                  sichtbarer Text, Stück für Stück
//      { typ: 'ende', nachricht_id, verlauf_id, quellen, unsicher, warnsignal, rueckfrage }
//      { typ: 'fehler', nachricht }
//
// POST { aktion: 'rueckfrage', nachricht_id }
//   → leitet eine KI-Antwort samt Frage an das Team weiter (JSON)
//
// Weitere Umgebungsvariablen (zusätzlich zu sprachmodell.ts, embeddings.ts, qdrant.ts):
//   SUCHE_MINDESTSCORE   Standard 0.5 – darunter gilt Wissen als nicht passend
//   SUCHE_ANZAHL         Standard 6
//   RATE_LIMIT_PRO_TAG   Standard 150 Fragen pro Person und Tag
//   ABO_PFLICHT          'true', sobald der Assistent nur mit Abo nutzbar sein soll
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, angemeldetePerson, CORS, envOptional, fehler, json, KonfigFehler } from '../_shared/umgebung.ts'
import { pruefeWarnsignale, WARNHINWEIS } from '../_shared/warnsignale.ts'
import { baueSmalltalkAnweisung, baueSystemanweisung, ordneVerlauf, type Quelle } from '../_shared/systemanweisung.ts'
import { META_ANFANG, MetaSplitter, liesMeta } from '../_shared/meta.ts'
import { sseZeile } from '../_shared/sse.ts'
import { einbetten } from '../_shared/embeddings.ts'
import { suchen } from '../_shared/qdrant.ts'
import { antworte, modell, pruefeSprachmodell, streameAntwort } from '../_shared/sprachmodell.ts'

const MAX_FRAGE = 2000
const KEIN_WISSEN =
  'Da will ich sichergehen und dir nichts Falsches sagen. Ich habe deine Frage an das Team weitergegeben; ' +
  'die Antwort bekommst du hier in der App.'

interface Profil {
  id: string
  studio_id: string
  rolle: 'mitglied' | 'trainer' | 'gruender'
  anzeigename: string
  freigeschaltet: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fehler('Nur POST ist erlaubt.', 405)

  const admin = adminClient()
  const person = await angemeldetePerson(req, admin)
  if (!person) return fehler('Bitte melde dich an.', 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fehler('Die Anfrage ist ungültig.', 400)
  }

  const { data: profil } = await admin
    .from('profiles')
    .select('id, studio_id, rolle, anzeigename, freigeschaltet')
    .eq('id', person.id)
    .maybeSingle<Profil>()
  if (!profil) return fehler('Dein Konto ist noch keinem Studio zugeordnet.', 403)
  if (!profil.freigeschaltet) {
    return fehler('Dein Zugang wird gerade vom Team freigeschaltet. Danach kannst du direkt loslegen.', 403)
  }

  try {
    if (body.aktion === 'rueckfrage') return await rueckfrageAnlegen(admin, profil, String(body.nachricht_id ?? ''))
    return await beantworte(admin, profil, body)
  } catch (e) {
    if (e instanceof KonfigFehler) {
      console.error(e.message)
      return fehler('Der Assistent wird gerade eingerichtet. Bitte versuch es später noch einmal.', 503)
    }
    console.error(e)
    return fehler('Da ist etwas schiefgelaufen. Bitte versuch es gleich noch einmal.', 500)
  }
})

async function beantworte(admin: SupabaseClient, profil: Profil, body: Record<string, unknown>): Promise<Response> {
  const frage = String(body.frage ?? '').trim()
  if (!frage) return fehler('Bitte stell eine Frage.', 400)
  if (frage.length > MAX_FRAGE) return fehler(`Bitte fasse dich kürzer (höchstens ${MAX_FRAGE} Zeichen).`, 400)
  const kontext = body.kontext === 'trainer_modus' ? 'trainer_modus' : 'chat'
  const uebung = typeof body.uebung === 'string' ? body.uebung.slice(0, 120) : null

  // Begrenzung der Anfragen pro Tag
  const grenze = Number(envOptional('RATE_LIMIT_PRO_TAG') ?? '150')
  const seit = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await admin
    .from('chat_nachrichten')
    .select('id, chat_verlaeufe!inner(mitglied_id)', { count: 'exact', head: true })
    .eq('chat_verlaeufe.mitglied_id', profil.id)
    .eq('rolle', 'mitglied')
    .gte('created_at', seit)
  if ((count ?? 0) >= grenze) {
    return fehler('Für heute hast du sehr viele Fragen gestellt. Morgen geht es weiter.', 429)
  }

  // Abo
  const { data: abo } = await admin.from('abos').select('stufe, status, laeuft_bis').eq('user_id', profil.id).maybeSingle()
  const aboAktiv =
    !!abo && ['aktiv', 'gekuendigt'].includes(abo.status) && (!abo.laeuft_bis || new Date(abo.laeuft_bis) > new Date())
  const istTeam = profil.rolle !== 'mitglied'
  if (envOptional('ABO_PFLICHT') === 'true' && !aboAktiv && !istTeam) {
    return fehler('Für den Assistenten brauchst du ein aktives Abo.', 402)
  }
  const sichtbarkeiten = ['alle']
  if ((aboAktiv && abo?.stufe === 'coach') || istTeam) sichtbarkeiten.push('premium')
  if (istTeam) sichtbarkeiten.push('trainer')

  // Erst einrichten prüfen und Wissen suchen, dann speichern – so bleiben bei
  // fehlender Einrichtung keine unbeantworteten Fragen im Verlauf zurück.
  pruefeSprachmodell()
  const [vektor] = await einbetten([frage])
  const treffer = await suchen(
    vektor,
    { studioId: profil.studio_id, sichtbarkeiten },
    Number(envOptional('SUCHE_ANZAHL') ?? '6'),
    Number(envOptional('SUCHE_MINDESTSCORE') ?? '0.5'),
  )

  // Verlauf
  let verlaufId = typeof body.verlauf_id === 'string' ? body.verlauf_id : ''
  if (verlaufId) {
    const { data } = await admin.from('chat_verlaeufe').select('id').eq('id', verlaufId).eq('mitglied_id', profil.id).maybeSingle()
    if (!data) verlaufId = ''
  }
  if (!verlaufId) {
    const { data, error } = await admin
      .from('chat_verlaeufe')
      .insert({ studio_id: profil.studio_id, mitglied_id: profil.id, kontext })
      .select('id')
      .single()
    if (error) throw error
    verlaufId = data.id
  }

  const { data: bisher } = await admin
    .from('chat_nachrichten')
    .select('rolle, inhalt')
    .eq('verlauf_id', verlaufId)
    .order('created_at', { ascending: false })
    .limit(12)
  const verlauf = (bisher ?? []).reverse()

  const { data: frageNachricht, error: frageFehler } = await admin
    .from('chat_nachrichten')
    .insert({ verlauf_id: verlaufId, rolle: 'mitglied', inhalt: frage })
    .select('id')
    .single()
  if (frageFehler) throw frageFehler

  // Persönlicher Kontext nur mit Einwilligung
  const { data: einwilligung } = await admin
    .from('einwilligungen')
    .select('erteilt')
    .eq('user_id', profil.id)
    .eq('art', 'gesundheitsdaten')
    .maybeSingle()
  let gesundheit = null
  let letzteEinheiten: { datum: string; befinden: number | null }[] = []
  if (einwilligung?.erteilt) {
    const [{ data: g }, { data: e }] = await Promise.all([
      admin.from('gesundheitsprofil').select('ziele, beschwerden, trainings_pro_woche').eq('user_id', profil.id).maybeSingle(),
      admin.from('einheiten').select('gestartet_am, befinden').eq('mitglied_id', profil.id).order('gestartet_am', { ascending: false }).limit(5),
    ])
    gesundheit = g
    letzteEinheiten = (e ?? []).map((x) => ({
      datum: new Date(x.gestartet_am).toLocaleDateString('de-DE'),
      befinden: x.befinden,
    }))
  }

  const { data: studio } = await admin.from('studios').select('name').eq('id', profil.studio_id).single()
  const warn = pruefeWarnsignale(frage)

  const sse = (fn: (schreibe: (o: unknown) => void) => Promise<void>) =>
    new Response(
      new ReadableStream({
        async start(controller) {
          const schreibe = (o: unknown) => controller.enqueue(sseZeile(o))
          try {
            schreibe({ typ: 'start', verlauf_id: verlaufId })
            await fn(schreibe)
          } catch (e) {
            console.error(e)
            schreibe({ typ: 'fehler', nachricht: 'Die Antwort konnte nicht fertig erstellt werden. Bitte versuch es noch einmal.' })
          } finally {
            controller.close()
          }
        },
      }),
      { headers: { ...CORS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } },
    )

  // Kein passendes Wissen: Smalltalk und App-Fragen beantwortet der Assistent
  // selbst, alles Fachliche (und jedes Warnsignal) geht ans Team – nichts erfinden.
  if (!treffer.length) {
    const nachrichten = ordneVerlauf(verlauf as { rolle: 'mitglied' | 'assistent' | 'trainer'; inhalt: string }[], frage)
    return sse(async (schreibe) => {
      const weitergeben = async () => {
        await admin.from('rueckfragen').insert({
          studio_id: profil.studio_id,
          mitglied_id: profil.id,
          nachricht_id: frageNachricht.id,
          frage,
        })
        const text = warn.treffer ? `${KEIN_WISSEN}\n\n${WARNHINWEIS}` : KEIN_WISSEN
        schreibe({ typ: 'text', t: text })
        const { data: antwort } = await admin
          .from('chat_nachrichten')
          .insert({ verlauf_id: verlaufId, rolle: 'assistent', inhalt: text, unsicher: true, warnsignal: warn.treffer, modell: null })
          .select('id')
          .single()
        schreibe({ typ: 'ende', nachricht_id: antwort?.id, verlauf_id: verlaufId, quellen: [], unsicher: true, warnsignal: warn.treffer, rueckfrage: true })
      }
      if (warn.treffer) return await weitergeben()

      let roh = ''
      try {
        roh = await antworte({
          system: baueSmalltalkAnweisung({ vorname: profil.anzeigename.split(' ')[0], studioName: studio?.name ?? 'deinem Studio', kontext }),
          nachrichten,
          maxTokens: 300,
        })
      } catch (e) {
        console.error('Smalltalk-Antwort fehlgeschlagen', e)
        return await weitergeben()
      }
      const meta = liesMeta(roh)
      const pos = roh.indexOf(META_ANFANG)
      const text = (pos === -1 ? roh : roh.slice(0, pos)).trim()
      // Nur eindeutig als Smalltalk markierte Antworten durchlassen
      if (!meta || meta.fachfrage || !text) return await weitergeben()

      schreibe({ typ: 'text', t: text })
      const { data: antwort, error } = await admin
        .from('chat_nachrichten')
        .insert({ verlauf_id: verlaufId, rolle: 'assistent', inhalt: text, quellen: [], unsicher: false, warnsignal: false, modell: modell() })
        .select('id')
        .single()
      if (error) throw error
      schreibe({ typ: 'ende', nachricht_id: antwort.id, verlauf_id: verlaufId, quellen: [], unsicher: false, warnsignal: false, rueckfrage: false })
    })
  }

  const quellen: (Quelle & { eintrag_id: string })[] = treffer.map((t, i) => ({
    nr: i + 1,
    titel: t.payload.titel,
    text: t.payload.text,
    eintrag_id: t.payload.eintrag_id,
  }))
  const system = baueSystemanweisung({
    vorname: profil.anzeigename.split(' ')[0],
    studioName: studio?.name ?? 'deinem Studio',
    kontext,
    uebung,
    gesundheit,
    letzteEinheiten,
    warnsignal: warn.treffer,
    quellen,
  })
  const nachrichten = ordneVerlauf(verlauf as { rolle: 'mitglied' | 'assistent' | 'trainer'; inhalt: string }[], frage)

  return sse(async (schreibe) => {
    const splitter = new MetaSplitter()
    for await (const stueck of streameAntwort({ system, nachrichten, maxTokens: kontext === 'trainer_modus' ? 600 : 1500 })) {
      const sichtbar = splitter.push(stueck)
      if (sichtbar) schreibe({ typ: 'text', t: sichtbar })
    }
    const { rest, text, meta } = splitter.ende()
    if (rest) schreibe({ typ: 'text', t: rest })

    let inhalt = text
    if (warn.treffer) {
      schreibe({ typ: 'text', t: `\n\n${WARNHINWEIS}` })
      inhalt = `${text}\n\n${WARNHINWEIS}`
    }
    const unsicher = meta?.unsicher === true || !text
    const genutzt = new Map<string, { eintrag_id: string; titel: string }>()
    for (const nr of meta?.quellen ?? []) {
      const q = quellen.find((x) => x.nr === nr)
      if (q && !genutzt.has(q.eintrag_id)) genutzt.set(q.eintrag_id, { eintrag_id: q.eintrag_id, titel: q.titel })
    }
    const quellenListe = [...genutzt.values()]

    const { data: antwort, error } = await admin
      .from('chat_nachrichten')
      .insert({
        verlauf_id: verlaufId,
        rolle: 'assistent',
        inhalt: inhalt || KEIN_WISSEN,
        quellen: quellenListe,
        unsicher,
        warnsignal: warn.treffer,
        modell: modell(),
      })
      .select('id')
      .single()
    if (error) throw error
    schreibe({ typ: 'ende', nachricht_id: antwort.id, verlauf_id: verlaufId, quellen: quellenListe, unsicher, warnsignal: warn.treffer, rueckfrage: false })
  })
}

async function rueckfrageAnlegen(admin: SupabaseClient, profil: Profil, nachrichtId: string): Promise<Response> {
  if (!nachrichtId) return fehler('Es fehlt die Nachricht.', 400)
  const { data: nachricht } = await admin
    .from('chat_nachrichten')
    .select('id, verlauf_id, inhalt, rolle, created_at, chat_verlaeufe!inner(mitglied_id, studio_id)')
    .eq('id', nachrichtId)
    .maybeSingle()
  const verlauf = nachricht?.chat_verlaeufe as unknown as { mitglied_id: string; studio_id: string } | undefined
  if (!nachricht || nachricht.rolle !== 'assistent' || verlauf?.mitglied_id !== profil.id) {
    return fehler('Diese Nachricht gibt es nicht.', 404)
  }

  const { data: vorhanden } = await admin.from('rueckfragen').select('id').eq('nachricht_id', nachricht.id).maybeSingle()
  if (vorhanden) return json({ ok: true, rueckfrage_id: vorhanden.id })

  const { data: frage } = await admin
    .from('chat_nachrichten')
    .select('inhalt')
    .eq('verlauf_id', nachricht.verlauf_id)
    .eq('rolle', 'mitglied')
    .lt('created_at', nachricht.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: neu, error } = await admin
    .from('rueckfragen')
    .insert({
      studio_id: profil.studio_id,
      mitglied_id: profil.id,
      nachricht_id: nachricht.id,
      frage: frage?.inhalt ?? '(Frage nicht gefunden)',
      ki_entwurf: nachricht.inhalt,
    })
    .select('id')
    .single()
  if (error) throw error
  return json({ ok: true, rueckfrage_id: neu.id })
}
