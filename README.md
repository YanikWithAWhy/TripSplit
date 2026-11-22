# Tripsplit

Web-App (PWA) zum Erfassen und Aufteilen gemeinsamer Ausgaben, z. B. im Urlaub. Die Oberfläche ist auf Englisch.
„Tripsplit“ ist ein Arbeitstitel. Stack: React + TypeScript + Vite, Tailwind CSS v4, Vitest, Lucide-Icons, Schrift Inter. Später kommt Supabase als Backend dazu.

## Befehle

```powershell
npm install        # Abhängigkeiten installieren
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm test           # Tests einmal ausführen
npm run test:watch # Tests bei jeder Änderung neu ausführen
npm run typecheck  # TypeScript prüfen
npm run lint       # oxlint
npm run build      # Produktions-Build nach dist/
```

## Supabase einrichten

Ohne Supabase speichert die App alles nur im Browser („Saved in this browser“). Mit Supabase gibt es Konten:

- **Konto anlegen:** Unter „Create account“ nur die E-Mail eingeben. Supabase schickt einen Bestätigungslink. Über den
  Link kommt man zurück in die App und wählt dort **Username** und **Passwort** („Finish your account“).
- **Anmelden:** E-Mail und Passwort.
- **Passwort vergessen:** „Forgot your password?“ schickt einen Link, über den man ein neues Passwort wählt.

E-Mails gibt es also nur zum Bestätigen der Adresse und zum Zurücksetzen des Passworts, nie zum normalen Anmelden.

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen, Region in der EU (z. B. Frankfurt).
2. **Datenbank-Schema einspielen:** Im Dashboard den **SQL Editor** öffnen und nacheinander den Inhalt dieser
   Dateien einfügen und mit **Run** ausführen:
   1. `supabase/migrations/20261122120000_init.sql` (Reisen, Ausgaben, …)
   2. `supabase/migrations/20261122140000_profiles.sql` (Usernames)
   3. `supabase/migrations/20261122160000_member_accounts.sql` (Personen mit Konten verknüpfen)
   4. `supabase/migrations/20261122180000_permissions.sql` (wer was ändern darf)

   (Alternativ per CLI: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.)
3. **Authentication → URL Configuration:** Site URL `http://localhost:5173`, dieselbe Adresse auch unter
   Redirect URLs eintragen. Sonst führen die Links aus den E-Mails nicht zurück in die App.
   Später kommt dort die echte Adresse der App dazu.
4. **Authentication → Sign In / Providers → Email:** „Confirm email“ **einschalten**. Die App braucht das nicht
   zwingend (der Link bestätigt die Adresse sowieso), aber so kann auch niemand an der App vorbei ein Konto
   mit Passwort und unbestätigter Adresse anlegen.
5. **Empfohlen: E-Mail-Vorlagen anpassen** (Authentication → Emails → Templates). Mit den Standardvorlagen
   funktionieren die Links nur im selben Browser, in dem man sie angefordert hat. Mit diesen Links klappt es
   auf jedem Gerät, z. B. am Laptop registrieren und die Mail am Handy öffnen:

   | Vorlage | Link im `href` |
   |---|---|
   | Confirm signup | `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` |
   | Magic Link | `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` |
   | Reset Password | `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` |

   Beispiel für „Confirm signup“:

   ```html
   <h2>Confirm your email</h2>
   <p>Open this link to finish creating your Tripsplit account:</p>
   <p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm email</a></p>
   ```

   „Magic Link“ ist nötig, weil Supabase für die Bestätigung neuer Konten je nach Einstellung diese Vorlage nimmt.
6. `.env.example` nach `.env.local` kopieren und ausfüllen (Project Settings → API Keys):
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY` (Publishable Key `sb_publishable_…` oder der alte „anon“-Key).
   **Nie** den Secret- bzw. `service_role`-Key eintragen. `.env.local` wird nicht ins Git übernommen.
7. `npm run dev` neu starten.

Hinweise:

- Usernames: 3–20 Zeichen, Buchstaben, Zahlen, `_` und `.`, gespeichert in Kleinbuchstaben, jeder nur einmal.
  Angemeldet wird trotzdem mit der E-Mail. Der Username wird oben in der App angezeigt und später zum Einladen genutzt.
- Passwörter brauchen in der App mindestens 8 Zeichen. Supabase selbst erlaubt ab 6; wer es auch dort strenger
  will, stellt die Mindestlänge unter Authentication → Sign In / Providers → Email ein.
- Supabase verschickt mit dem eingebauten Mailserver nur wenige E-Mails pro Stunde. Zum Ausprobieren reicht das,
  für echte Nutzer einen eigenen SMTP-Server eintragen (Authentication → SMTP Settings).
- Abgelaufene, schon benutzte oder im falschen Browser geöffnete Links meldet die Anmeldeseite.
- Wer bei „Create account“ eine Adresse eingibt, die schon ein Konto hat, bekommt ebenfalls einen Link und ist
  danach angemeldet. Das ist nicht unsicherer als „Forgot your password?“, beides setzt Zugriff aufs Postfach voraus.
- Reisen, die vorher nur im Browser gespeichert waren, werden nicht automatisch ins Konto übernommen.

### Datenbank

| Tabelle | Inhalt |
|---|---|
| `trips` | Reisen (Name, Währung) |
| `trip_access` | Welche Konten eine Reise öffnen dürfen; wer sie anlegt, wird `owner` |
| `members` | Personen einer Reise, auch ohne Konto; entfernte Personen werden nur markiert |
| `expenses` | Ausgaben in Cent, mit Zahler und Aufteilungsart |
| `expense_splits` | Wer an einer Ausgabe beteiligt ist (Anteil oder fester Betrag) |
| `settlements` | Erfasste Rückzahlungen |
| `profiles` | Username pro Konto, eindeutig; jeder sieht nur das eigene Profil |

Row Level Security sorgt dafür, dass jedes Konto nur die eigenen Reisen sieht. Innerhalb einer Reise gilt:
Ausgaben ändern oder löschen darf nur, wer sie angelegt hat, oder der Besitzer der Reise. Rückzahlungen
erfassen oder rückgängig machen darf nur, wer daran beteiligt ist (Zahler oder Empfänger, mit dem eigenen
Konto verknüpft). Die App zeigt nur an, was erlaubt ist (`src/permissions.ts`). Gespeichert wird über die
Funktionen `save_trip` und `save_expense`, jeweils in einer Transaktion. `src/data/schema.test.ts` testet
Schema, Funktionen und Zugriffsregeln in einer In-Memory-Datenbank (PGlite).

## Veröffentlichen mit GitHub Pages

Der Workflow `.github/workflows/deploy.yml` prüft, testet und baut die App bei jedem Push auf `main` und
veröffentlicht sie unter `https://<github-name>.github.io/<repo-name>/`. Die App nutzt relative Pfade
(`base: './'` in `vite.config.ts`) und `#/`-Adressen, deshalb braucht GitHub Pages keine weitere Konfiguration.

Einmalig einrichten:

1. Auf GitHub ein **öffentliches** Repository anlegen (für GitHub Pages im kostenlosen Plan nötig), ohne README,
   `.gitignore` oder Lizenz, weil das Projekt diese schon hat.
2. Lokal committen und pushen:

   ```powershell
   git add -A
   git commit -m "Tripsplit: first version"
   git remote add origin https://github.com/<github-name>/<repo-name>.git
   git push -u origin main
   ```

3. Im Repository **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
4. **Settings → Secrets and variables → Actions → Reiter „Variables“ → New repository variable**, zweimal:
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY`, mit denselben Werten wie in `.env.local`.
   Als *Variables*, nicht als *Secrets*: Beide Werte stehen ohnehin in der fertigen App, der Publishable Key ist
   dafür gedacht. Den Secret- bzw. `service_role`-Key **nie** eintragen.
5. **Actions → „Deploy to GitHub Pages“ → Run workflow** (oder einfach erneut pushen). Fehlen die Variablen,
   bricht der Workflow mit einer klaren Meldung ab, statt eine App ohne Konto-Funktion zu veröffentlichen.
6. In **Supabase → Authentication → URL Configuration**:
   - **Site URL** auf `https://<github-name>.github.io/<repo-name>/` ändern.
   - Unter **Redirect URLs** `https://<github-name>.github.io/<repo-name>/**` hinzufügen und
     `http://localhost:5173` behalten, damit die Entwicklung weiter funktioniert.

Danach landet jeder Push auf `main` nach ein bis zwei Minuten online. Den Stand zeigt der Reiter **Actions**.

## Aufbau

```
src/
  lib/                Rechenlogik ohne UI und Datenbank
    types.ts          Datentypen (Expense, SplitSpec, Settlement, Member, …)
    split.ts          Aufteilen: gleich, nach Anteilen, feste Beträge
    balances.ts       Saldo pro Person
    settle.ts         Ausgleichsvorschlag mit wenigen Überweisungen
    money.ts          Eingabe parsen ("12.50" oder "12,50" → 1250) und formatieren
    example-trip.ts   Beispieldaten für die Demo
    *.test.ts         Tests
  pages/              TripListPage (alle Reisen), TripPage (eine Reise)
  components/         UI-Bausteine, u. a. Dialog, ExpenseForm, TripForm, SettleUpDetails, SlideToConfirm
  data/               Speichern: Aktionen, Browser- und Supabase-Backend, Login, Schema-Tests
  trips.ts            Reisen und Mitglieder: anlegen, ändern, prüfen (mit Tests)
  expense-draft.ts    Formular-Logik für Ausgaben (mit Tests)
  router.ts           Mini-Router über die URL: #/ = Liste, #/trips/<id> = Reise
  categories.ts       Kategorien mit Namen und Icons
  styles.ts           Gemeinsame Klassen für Buttons und Eingabefelder
  format.ts           Datums- und Textformatierung für die UI (en-GB)
  index.css           Design-Tokens und Grundstile
  App.tsx             Wählt Browser- oder Supabase-Modus, Login, Router
supabase/
  migrations/         Datenbank-Schema (SQL)
  config.toml         Einstellungen für die Supabase-CLI
```

## Design

Monochrom: schwarzer Hintergrund, weiße Schrift, Weiß als einzige Akzentfarbe. Die Farben sind als
Tokens in `src/index.css` definiert. In Komponenten immer die Token-Klassen verwenden, keine festen Farbwerte:

| Token | Klasse | Verwendung |
|---|---|---|
| `canvas` | `bg-canvas` | Seitenhintergrund (#000) |
| `surface` | `bg-surface` | Karten |
| `raised` | `bg-raised` | Elemente in Karten (Icon-Kacheln, Balken) |
| `line` / `line-strong` | `border-line` | Rahmen, Trennlinien, Outline-Buttons |
| `ink` | `text-ink`, `bg-ink` | Text, Akzente (weiße Buttons, Summenkarte) |
| `ink-muted` / `ink-subtle` | `text-ink-muted` | Nebentext, mindestens 4,5:1 Kontrast |

Weitere Regeln: Klickflächen mindestens 44 px hoch, sichtbarer Fokusrahmen, Icons nur von Lucide (keine Emojis),
und Animationen werden bei „reduzierte Bewegung“ abgeschaltet.

## Grundregeln für die Logik

- **Geld immer als ganze Zahl in Cent** (`€12.50` = `1250`). Keine Kommazahlen.
- **Aufteilungen ergeben immer exakt den Gesamtbetrag.** Restcents werden nach der Methode des größten Rests verteilt.
- **Die Salden einer Gruppe ergeben immer 0.** `settleUp` bricht ab, wenn nicht.
- **Anteile (`weight`) sind ganze Zahlen.** „1,5 Anteile“ wird in der UI als 3:2 usw. umgerechnet.
- **Fehlermeldungen sind auf Englisch**, weil sie in der App angezeigt werden.

## Fahrplan

- [x] Phase 0: Projekt-Setup (Vite, React, TypeScript, Tailwind, Vitest)
- [x] Phase 1: Rechenlogik + Tests
- [x] Design-Grundlage: schwarz-weißes Layout, englische Oberfläche
- [x] Ausgaben erfassen, bearbeiten und löschen (vorerst im Browser gespeichert)
- [x] Ausgleichen mit Detailansicht und „Slide to settle up“
- [x] Mehrere Reisen, Mitglieder hinzufügen, umbenennen und entfernen
- [x] Phase 2: Supabase (Tabellen, Login, Row Level Security), muss noch mit einem echten Projekt getestet werden
- [ ] Phase 4: Einladungslink und Echtzeit-Sync
- [ ] Phase 5: PWA, mehrere Währungen, Kategorien, Belege, Export
- [ ] Phase 6: Testen auf einer echten Reise, Veröffentlichen
