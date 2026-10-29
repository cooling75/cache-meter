# Cache-Meter

*A Claude Code mod that shows above the prompt how long the prompt cache stays
warm, how much of the last request it served, and how full the context window
is, with a Compact button. Its interface and this guide are in German.*

Eine Leiste über dem Eingabefeld von Claude Code. Sie zeigt auf einen Blick,
ob dein Prompt-Cache noch warm ist, wie viel deiner letzten Anfrage aus dem
Cache kam und wie voll das Kontextfenster ist. Wird es eng, kannst du die
Sitzung mit einem Klick komprimieren.

```
⏱ Cache 57:12 · Treffer 98 % · ☀️ Kontext 23 % (46k / 200k)
⏱ Cache 08:41 · Treffer 97 % · 🌧️ Kontext 64 % (128k / 200k) · Zeit für Compact oder /clear   [ Compact ]
❄️ Cache abgelaufen · nächste Nachricht lädt 128k neu · Treffer 97 % · ⛈️ Kontext 83 % (166k / 200k)   [ Compact ]
✓ Sitzung komprimiert · 77.000 Token gespart · ☀️ Kontext 22 % (43k / 200k)
```

## Wozu

Mit jeder Nachricht schickt Claude Code das ganze bisherige Gespräch mit:
deine Nachrichten, gelesene Dateien, Ausgaben von Werkzeugen. Der Prompt-Cache
hält diesen Anfang zwischengespeichert. Was aus dem Cache kommt, kostet nur
etwa ein Zehntel und belastet dein Kontingent kaum. Je nach Konto hält der
Cache 5 Minuten oder eine Stunde, und jede Anfrage, die ihn nutzt, setzt die
Zeit neu.

Läuft er ab, muss die nächste Nachricht alles neu verarbeiten. Bei einem
großen Gespräch geht das deutlich aufs Limit. Und je voller das
Kontextfenster ist, desto ungenauer arbeitet Claude. Der Cache-Meter macht
beides sichtbar, damit du rechtzeitig weiterschreibst, komprimierst oder neu
anfängst.

## Was die Leiste zeigt

| Anzeige | Bedeutung |
| --- | --- |
| ⏱ Cache 57:12 | So lange bleibt der Cache noch warm. Gelb, wenn weniger als ein Viertel der Zeit übrig ist, rot in der letzten Minute. |
| ❄️ Cache abgelaufen | Die nächste Nachricht lädt das Gespräch neu, die Leiste nennt, wie viele Token das sind. |
| Treffer 98 % | Anteil der letzten Anfrage, der aus dem Cache kam. Grün ab 80 %, gelb ab 40 %, darunter rot. |
| ☀️ Kontext 23 % (46k / 200k) | Füllstand des Kontextfensters: belegt / Größe des Fensters. |

Das Wetter steht für den Füllstand des Kontextfensters:

| Wetter | Füllstand | Empfehlung |
| --- | --- | --- |
| ☀️ | unter 40 % | einfach weiterschreiben |
| ⛅ | 40 bis 59 % | der Compact-Knopf erscheint |
| 🌧️ | 60 bis 79 % | Zeit für Compact oder /clear |
| ⛈️ | ab 80 % | jetzt komprimieren oder neu anfangen |

Die Leiste erscheint nach der ersten Antwort einer Sitzung. Nachrichten von
Subagenten zählen nicht mit, nur das Hauptgespräch.

## Voraussetzungen

- Claude Code ab Version 2.1.287 im Terminal, oder der Code-Tab der Claude
  Desktop-App ab 2.1.286. Die Version zeigt `claude --version` bzw. `/status`.
- Die Leiste erscheint im Terminal und im Code-Tab der Desktop-App.
- Nicht in WSL-Sitzungen der Desktop-App: Dort lädt Claude Code keine
  Plugins. Unter WSL funktioniert `claude` im Terminal.
- Nicht in der VS-Code-Erweiterung und nicht bei `claude -p`: Dort wird die
  Leiste über dem Prompt nicht gezeichnet.

## Installieren

In einer Claude-Code-Sitzung **im Terminal** eingeben:

```
/plugin install cache-meter --marketplace cooling75/cache-meter
```

Die Frage nach dem Marketplace mit `y` bestätigen, dann den Bereich wählen
(„user“ für alle Sitzungen). Der Mod läuft danach sofort, auch in neuen
Sitzungen der Desktop-App. Im Code-Tab der Desktop-App selbst steht der
`/plugin`-Befehl nicht zur Verfügung.

Alternativ aus der Shell:

```bash
claude plugin marketplace add cooling75/cache-meter
```

```bash
claude plugin install cache-meter@cache-meter
```

Läuft gerade eine Sitzung, lädt `/reload-plugins` den Mod dort.

### Was der Mod darf

Ein Mod läuft mit deinen Rechten. Was er tut, zeigt Claude Code vor der
Installation, wenn du das Repository klonst und prüfst:

```bash
claude plugin validate ./cache-meter
```

Der Cache-Meter liest nur die Token-Zahlen der Anfragen und den Füllstand des
Kontextfensters, zeichnet die Leiste und startet auf Knopfdruck die
Komprimierung. Er liest und schreibt keine Dateien, startet keine Programme,
geht nicht ins Netz und ruft kein Modell auf.

## Bedienen

- **Compact** komprimiert die Sitzung, wie `/compact`. Die Leiste zeigt
  „Sitzung wird komprimiert …“ und danach, wie viele Token gespart wurden. Die
  Meldung bleibt bis zu deiner nächsten Nachricht stehen. Auch `/compact` und
  das automatische Komprimieren zeigen sie.
- **Neue Aufgabe?** Dann lieber einen neuen Chat oder `/clear`. Danach ist die
  Leiste leer, bis die erste Antwort kommt.
- **Ausblenden:** `[-]` rechts neben der Leiste oder `Strg+X` `Strg+A`.

## Einstellen

Der Cache-Meter hat eine Einstellung, die Cache-Lebensdauer `ttl`:

| Wert | Bedeutung |
| --- | --- |
| `auto` (Standard) | 1 Stunde im Abo, sonst 5 Minuten (siehe unten) |
| `5m` | immer 5 Minuten |
| `1h` | immer 1 Stunde |

Meldet die Installation „1 userConfig option not yet set“, ist das in
Ordnung: Ohne Wert gilt `auto`.

In einer Sitzung im Terminal ändert `/plugin configure cache-meter@cache-meter`
den Wert. Setzen beim Installieren:

```bash
claude plugin install cache-meter@cache-meter --config ttl=1h
```

Anzeigen und später ändern:

```bash
claude plugin configure cache-meter@cache-meter
```

```bash
echo '{"ttl": "5m"}' | claude plugin configure cache-meter@cache-meter --values-stdin
```

### Wie `auto` die Lebensdauer schätzt

Claude Code verrät nicht, wann der Cache tatsächlich abläuft. Der Cache-Meter
schätzt es deshalb:

- Meldet dein Konto Nutzungsfenster eines Abos (5 Stunden, 7 Tage), nimmt er
  1 Stunde an, sonst 5 Minuten. Ist ein Fenster ausgeschöpft und du nutzt
  zusätzliches Guthaben, nimmt er 5 Minuten an.
- Kommt ein Cache-Treffer mehr als 5 Minuten nach der vorigen Anfrage, ist
  die Stunde belegt.
- Die Zeit zählt ab dem Start der letzten Anfrage. Der Countdown ist damit
  eher etwas zu vorsichtig als zu großzügig.

Stimmt die Schätzung für dein Konto nicht, stell `ttl` fest ein.

## Aktualisieren und entfernen

```bash
claude plugin marketplace update cache-meter
```

```bash
claude plugin update cache-meter@cache-meter
```

Die neue Version läuft nach einem Neustart von Claude Code. Entfernen:

```bash
claude plugin uninstall cache-meter@cache-meter
```

## Wenn die Leiste nicht erscheint

- Hat die Sitzung schon eine Antwort bekommen? Vorher bleibt die Leiste leer.
- `/plugin` im Terminal zeigt unter den Reitern eine Zeile wie
  `1 mod active · cache-meter`. Fehlt der Name dort, ist der Mod nicht
  geladen: Version prüfen, `/reload-plugins` ausführen.
- In einer WSL-Sitzung der Desktop-App laufen keine Mods (siehe
  Voraussetzungen).
- Mods abgeschaltet? `"disableAllHooks": true` in `~/.claude/settings.json`
  oder `--safe-mode` schalten sie ab.
- `claude --debug` schreibt ins Debug-Log, warum ein Mod nicht lädt.

## Herkunft

Idee und Name stammen von Julian Ivanov, der seinen Cache-Meter im Video
[„Diese 10 Claude Code Mods solltest du unbedingt kennen“](https://youtu.be/ji4ANdb_M6Y?t=489)
vorstellt. Dies ist ein unabhängiger Nachbau nach dem Video.

Anthropics Beispiel-Mod
[token-weather](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/token-weather)
zeigt ebenfalls eine Kontext-Wetterlage über dem Prompt. Der Cache-Meter legt
den Schwerpunkt auf den Prompt-Cache: Countdown, Trefferquote und
Compact-Knopf.

Hinweise zur Entwicklung stehen in [docs/entwicklung.md](docs/entwicklung.md).

## Lizenz

MIT, siehe [LICENSE](LICENSE).
