# E-Mail-Vorlagen (Deutsch)

In Supabase unter *Authentication → Emails → Templates* einfügen (geht erst, wenn ein eigener SMTP-Absender eingerichtet ist).

| Datei | Vorlage in Supabase | Betreff |
|---|---|---|
| `bestaetigen.html` | Confirm sign up | Bitte bestätige deine E-Mail-Adresse – Rückgrat-App |
| `passwort.html` | Reset password | Neues Passwort für die Rückgrat-App |
| `email-aendern.html` | Change email address | Bitte bestätige deine neue E-Mail-Adresse – Rückgrat-App |
| `magic-link.html` | Magic link or OTP | Dein Anmeldelink für die Rückgrat-App |
| `einladung.html` | Invite user | Du bist zur Rückgrat-App eingeladen |
| `reauth.html` | Reauthentication | Dein Bestätigungscode – Rückgrat-App |

Platzhalter wie `{{ .ConfirmationURL }}` und `{{ .Token }}` füllt Supabase selbst aus.
