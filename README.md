# Kruger Intelligenz

KI-Begleiter für die Mitglieder von **Rückgrat Donaueschingen**, aufgebaut auf dem Wissen der Gründer und dem Five-Konzept.
Erste Ausbaustufe: **Web-App (PWA)**, die auf Android und iOS wie eine App installiert werden kann. Mitglieder- und Teambereich stecken in derselben App.

| Bereich | Inhalt |
|---|---|
| Mitglieder | Heute, Assistent (Antworten nur aus freigegebenem Wissen, Diktat, Vorlesen, Rückfragen ans Team), Trainieren (Übungsbibliothek, Kamera-Coaching folgt), Fortschritt mit Trainingstagebuch, Profil mit Einwilligungen und Datenexport |
| Team | Übersicht mit Mitglieder-Ampel, Rückfragen beantworten (optional direkt als Wissen), Mitglieder freischalten, Rollen, Einladungscodes |
| Wissens-Studio | Schreiben, Diktieren, Datei-Import (TXT, Markdown, PDF, Word), Seiten fotografieren mit Texterkennung, Versionen, Freigabe durch die Gründer |

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
- Studio „Rückgrat Donaueschingen“ angelegt, Gründer-Einladungscode erstellt (3 Nutzungen, 60 Tage gültig)

## Noch einzurichten

### 1. Geheimnisse der Edge Functions

Im Supabase-Dashboard unter *Edge Functions → Secrets* (nie im Code oder Chat):

| Name | Pflicht | Wert |
|---|---|---|
| `ANTHROPIC_API_KEY` | ja | Schlüssel aus der Claude Console |
| `QDRANT_URL` | ja | z. B. `https://qdrant.deine-domain.de` |
| `QDRANT_API_KEY` | empfohlen | wie in `infra/.env` |
| `EMBEDDING_URL` | ja | z. B. `https://embeddings.deine-domain.de/embeddings` |
| `EMBEDDING_API_KEY` | empfohlen | wie in `infra/.env` |
| `ERLAUBTE_HERKUNFT` | empfohlen | Adresse der Web-App, z. B. `https://app.rueckgrat-donau.de` |
| `LLM_MODELL` | nein | Standard `claude-sonnet-5-5` |
| `LLM_AUFWAND` | nein | `low`, `medium` oder `high` |
| `SUCHE_MINDESTSCORE` | nein | Standard `0.5`; höher = vorsichtiger |
| `RATE_LIMIT_PRO_TAG` | nein | Standard 150 Fragen pro Person |
| `ABO_PFLICHT` | nein | `true`, sobald der Assistent nur mit Abo nutzbar sein soll |

**Später auf ein eigenes Modell umstellen:** `LLM_ANBIETER=openai`, `LLM_BASIS_URL=http://<gpu-server>:8000/v1`, `LLM_MODELL=<name>`, optional `LLM_API_KEY`. Jede OpenAI-kompatible Schnittstelle (vLLM, Ollama, LM Studio) funktioniert; die Texterkennung beim Fotografieren braucht dann ein Modell mit Bildverständnis.

### 2. KI-Dienste auf dem VPS

```bash
cd infra && cp .env.example .env   # Schlüssel und Domains eintragen
docker compose up -d
```

DNS: zwei A-Records (Qdrant, Embeddings) auf die IP des VPS. Läuft dort schon ein Qdrant, kann dieser genutzt werden; die App legt ihre Collection `wissen` selbst an. BGE-M3 braucht etwa 2,5 GB RAM.

### 3. E-Mail-Versand (wichtig vor dem Start mit Mitgliedern)

Der eingebaute Mailversand von Supabase schickt nur an Mitglieder des Supabase-Teams und nur wenige Mails pro Stunde. Für Registrierung und Passwort-Reset unter *Authentication → Emails → SMTP* einen eigenen Absender eintragen (z. B. Brevo, Resend oder das Postfach von Hostinger). Die Vorlagen dort auf Deutsch umstellen.

### 4. Web-App ausliefern

Unter *Authentication → URL Configuration* die Adresse der App als **Site URL** eintragen und unter **Redirect URLs** zusätzlich `https://<app-domain>/**`.

Variante VPS (Docker):

```bash
# im Hauptverzeichnis des Repos (die App nutzt Code aus supabase/functions/_shared)
docker build -f web/Dockerfile -t kruger-web \
  --build-arg VITE_SUPABASE_URL=https://lqhkvxlxgatwuszxajrr.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… .
docker run -d --restart unless-stopped -p 8080:80 kruger-web
```

Alternativ jede Hosting-Plattform für statische Seiten (Netlify, Vercel, Cloudflare Pages): Build `npm run build` im Ordner `web`, Ausgabe `dist`, alle Pfade auf `index.html` umleiten.

### 5. Erste Anmeldung

1. App öffnen → *Los geht's* → Gründer-Einladungscode eingeben, registrieren, E-Mail bestätigen.
2. Wer den Gründer-Code einlöst, ist sofort freigeschaltet und hat den Team-Bereich (Profil → *Team-Bereich öffnen*).
3. Im Team-Bereich unter *Mitglieder* Codes für Trainer (nur Gründer) und Mitglieder erstellen; der Link führt direkt zur Registrierung mit eingetragenem Code.

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
