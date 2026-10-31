# Kruger Intelligenz

KI-Begleiter für die Mitglieder von **Rückgrat Donaueschingen**, aufgebaut auf dem Wissen der Gründer und dem Five-Konzept.
Erste Ausbaustufe: **Web-App (PWA)**, die auf Android und iOS wie eine App installiert werden kann. Mitglieder- und Teambereich stecken in derselben App.

| Bereich | Inhalt |
|---|---|
| Mitglieder | Heute, Assistent (Antworten nur aus freigegebenem Wissen, Diktat, Vorlesen, Rückfragen ans Team), Trainieren (Übungsbibliothek, Kamera-Coaching folgt), Fortschritt mit Trainingstagebuch, Profil mit Einwilligungen und Datenexport |
| Team | Übersicht mit Mitglieder-Ampel, Rückfragen beantworten (optional direkt als Wissen), Mitglieder freischalten, Rollen, Einladungscodes |
| Wissens-Studio | Schreiben, Diktieren, Datei-Import (TXT, Markdown, PDF, Word), Seiten fotografieren mit Texterkennung, Versionen, Freigabe durch einen Admin |

## Aufbau

```
web/                    React-App (Vite, TypeScript), PWA
supabase/migrations/    Datenbank: Tabellen, Zugriffsregeln (RLS), Trigger, Automatik
supabase/functions/     Edge Functions: chat, wissen-indexieren, dokument-lesen
supabase/tests/         Datenbank-Tests (Zugriffsregeln, Freigaben, Einladungen)
infra/                  Qdrant + Embeddings (BGE-M3) + HTTPS für den eigenen VPS
```

Ablauf einer Frage: App → Edge Function `chat` → Frage einbetten (BGE-M3) → passendes Wissen in Qdrant suchen → Antwort vom Sprachmodell nur auf Basis dieser Quellen, gestreamt. Findet sich nichts Passendes, erfindet der Assistent nichts, sondern legt eine Rückfrage für das Team an.

Freigegebenes Wissen wird automatisch eingelesen: `pg_cron` prüft jede Minute, ob etwas ansteht, und ruft dann `wissen-indexieren` auf (Geheimnis liegt in Supabase Vault, nichts von Hand einzurichten).

## Stand Supabase (Projekt `lqhkvxlxgatwuszxajrr`, Frankfurt)

- Alle Migrationen eingespielt, Edge Functions `chat`, `wissen-indexieren`, `dokument-lesen` ausgeliefert
- Studio „Rückgrat Donaueschingen“ angelegt, Admin-Einladungscode erstellt (3 Nutzungen, 60 Tage gültig)

## Betrieb (Stand 31.10.2026)

| Was | Wo |
|---|---|
| Web-App | `https://kruger-app.srv1864263.hstgr.cloud` (VPS, `/docker/kruger-app`) |
| Qdrant | `https://kruger-qdrant.srv1864263.hstgr.cloud` (VPS, `/docker/kruger-ki`) |
| Embeddings (BGE-M3) | `https://kruger-embed.srv1864263.hstgr.cloud/embeddings` (VPS, `/docker/kruger-ki`) |
| Schlüssel für Qdrant/Embeddings | nur auf dem VPS in `/docker/kruger-ki/.env` und als Supabase-Secrets |
| Mail-Absender (vorläufig) | `noreply@amstellogistics-epr.com` über `smtp.hostinger.com:465` |

Die `*.srv1864263.hstgr.cloud`-Adressen nutzen den Wildcard-Eintrag des Hostinger-VPS, DNS ist dafür nicht nötig. HTTPS kommt vom vorhandenen Traefik aus `/docker/n8n` (Netz `web`, Resolver `mytlschallenge`). Die Compose-Dateien liegen in `infra/vps-traefik/`. `infra/docker-compose.yml` mit Caddy ist die Variante für einen leeren Server ohne Traefik; auf dem VPS würde Caddy mit Traefik um Port 80/443 kollidieren.

**App aktualisieren:** auf dem VPS `/docker/kruger-app/aktualisieren.sh` (holt `main` aus GitHub und baut neu).

**Eigene Domain später:** neue Adresse in `infra/vps-traefik/app/docker-compose.yml` (Traefik-Regel) eintragen, A-Record auf die VPS-IP, dann in Supabase Site URL, Redirect URLs und `ERLAUBTE_HERKUNFT` anpassen.

## Rollen

Mitglied, Trainer und **Admin**. Admin heißt intern (Datenbank, Code) weiterhin `gruender`; nur die Anzeige und die Fehlermeldungen sagen „Admin“.

## Konfiguration

### Geheimnisse der Edge Functions

Im Supabase-Dashboard unter *Edge Functions → Secrets* (nie im Code oder Chat):

| Name | Pflicht | Wert |
|---|---|---|
| `ANTHROPIC_API_KEY` | ja | Schlüssel aus der Claude Console |
| `QDRANT_URL` | ja | `https://kruger-qdrant.srv1864263.hstgr.cloud` |
| `QDRANT_API_KEY` | ja | aus `/docker/kruger-ki/.env` |
| `EMBEDDING_URL` | ja | `https://kruger-embed.srv1864263.hstgr.cloud/embeddings` |
| `EMBEDDING_API_KEY` | ja | aus `/docker/kruger-ki/.env` |
| `ERLAUBTE_HERKUNFT` | empfohlen | `https://kruger-app.srv1864263.hstgr.cloud` |
| `LLM_MODELL` | nein | Standard `claude-sonnet-5-5` |
| `LLM_AUFWAND` | nein | `low`, `medium` oder `high` |
| `SUCHE_MINDESTSCORE` | nein | Standard `0.5`; höher = vorsichtiger. Messung mit BGE-M3: direkte Frage ≈ 0,65, umschriebene Frage ≈ 0,40, fachfremde Frage ≈ 0,29. Nach 20–30 echten Einträgen neu einstellen. |
| `RATE_LIMIT_PRO_TAG` | nein | Standard 150 Fragen pro Person |
| `ABO_PFLICHT` | nein | `true`, sobald der Assistent nur mit Abo nutzbar sein soll |

**Später auf ein eigenes Modell umstellen:** `LLM_ANBIETER=openai`, `LLM_BASIS_URL=http://<gpu-server>:8000/v1`, `LLM_MODELL=<name>`, optional `LLM_API_KEY`. Jede OpenAI-kompatible Schnittstelle (vLLM, Ollama, LM Studio) funktioniert; die Texterkennung beim Fotografieren braucht dann ein Modell mit Bildverständnis.

### Authentifizierung

- *Authentication → URL Configuration:* Site URL = Adresse der App, Redirect URLs = `https://<app-domain>/**`
- *Authentication → Emails → SMTP:* eigener Absender (ohne ihn schickt Supabase nur an das eigene Team)
- *Authentication → Emails → Templates:* deutsche Vorlagen aus `supabase/email-vorlagen/`

### Web-App auf einem anderen Server

```bash
# im Hauptverzeichnis des Repos (die App nutzt Code aus supabase/functions/_shared)
docker build -f web/Dockerfile -t kruger-web \
  --build-arg VITE_SUPABASE_URL=https://lqhkvxlxgatwuszxajrr.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… .
docker run -d --restart unless-stopped -p 8080:80 kruger-web
```

Alternativ jede Hosting-Plattform für statische Seiten (Netlify, Vercel, Cloudflare Pages): Build `npm run build` im Ordner `web`, Ausgabe `dist`, alle Pfade auf `index.html` umleiten.

### Erste Anmeldung

1. App öffnen → *Los geht's* → Admin-Einladungscode eingeben, registrieren, E-Mail bestätigen.
2. Wer den Admin-Code einlöst, ist sofort freigeschaltet und hat den Team-Bereich (Profil → *Team-Bereich öffnen*).
3. Im Team-Bereich unter *Mitglieder* Codes für Trainer (nur Admins) und Mitglieder erstellen; der Link führt direkt zur Registrierung mit eingetragenem Code.

## Trainer-Modus (Kamera-Coaching)

- **Erkennung:** MediaPipe Pose (`@mediapipe/tasks-vision`, Modell `pose_landmarker_full`) läuft komplett im Browser. Das Kamerabild verlässt das Gerät nie; gespeichert werden nur Wiederholungen, Haltedauer, Bewertung und erkannte Korrekturen mit Winkel (`saetze`).
- **Selbst ausgeliefert:** WASM-Dateien kommen aus `node_modules` nach `/mediapipe/<version>/wasm/`, das Modell lädt `web/scripts/modell-laden.mjs` beim Build (mit SHA-256-Prüfung) nach `public/mediapipe/`. Im Betrieb gibt es keine Abrufe bei Google. Nach dem ersten Start liegt alles im Cache des Geräts.
- **Regeln je Übung** (`uebungen.regeln`, Logik in `web/src/lib/pose/regeln.ts`): zählendes Gelenk mit Ausgangs- und Umkehrwinkel bzw. Haltezeit, dazu Prüfungen (Gelenk, min/max, Phase, Meldung). Meldungen kommen nur bei falscher Haltung, erst wenn sie 0,35 s anhält, dieselbe höchstens alle 3,5 s.
- **Pflege:** Team-Bereich → *Übungen*. Der *Kamera-Test* zeigt alle Winkel live und übernimmt den aktuellen Winkel per Knopf als Ausgangs- oder Umkehrwert. Trainer reichen ein, Admins geben frei.
- **Beispielübungen:** „Beispiel: Kniebeuge“, „Beispiel: Unterarmstütz“, „Beispiel: Schulterdrücken stehend“ sind allgemeine Testregeln, **nicht** das Five-Konzept. Archivieren, sobald echte Five-Übungen angelegt sind.
- **Gelenke:** Knie, Hüfte, Ellbogen, Schulter, Sprunggelenk, Körperlinie (Schulter–Hüfte–Knöchel), Rumpfneigung (gegen die Senkrechte), Kopfhaltung. Gemessen wird die der Kamera zugewandte Seite.
- **Zugang:** derzeit alle freigeschalteten Mitglieder. Für das Coach-Abo später in `KameraTraining.tsx` zusätzlich `hat_coach_abo()` prüfen.

## Entwicklung

```bash
cd web
cp .env.example .env.local
npm install
npm run dev          # http://localhost:5173
npx vitest run       # Logik-Tests (Zerlegen, Meta-Zeile, Warnsignale, SSE, Datum)
npm run build
```

Edge Functions:

```bash
deno check supabase/functions/*/index.ts
deno test --allow-env supabase/functions/_shared/sprachmodell_test.ts
```

Datenbank-Tests gegen ein lokales PostgreSQL 16 (ohne Supabase): `supabase/tests/supabase_stubs.sql`, danach alle Migrationen außer `*_index_automatik.sql` (braucht pg_cron und Vault), dann `supabase/tests/rls_tests.sql`. Erwartete letzte Zeile: `ALLE TESTS BESTANDEN`.

## Datenschutz in Kürze

- Daten in der EU (Supabase Frankfurt, VPS)
- Alle Einwilligungen standardmäßig aus, jederzeit im Profil widerrufbar, jede Änderung protokolliert
- Gesundheitsangaben fließen nur mit Einwilligung in Antworten ein; beim Widerruf werden sie gelöscht
- Trainer sehen Fortschritt nur mit Freigabe des Mitglieds, Chats nie
- Schriften werden mit der App ausgeliefert (keine Abrufe bei Google)
- Datenexport aller eigenen Daten als JSON im Profil
