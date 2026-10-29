# Entwicklung

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifest mit der Option `ttl` |
| `.claude-plugin/marketplace.json` | macht das Repo zum Marketplace, `source: "./"` |
| `hooks/hooks.json` | nennt das Hook-Modul |
| `hooks/register.tsx` | Hooks und die Leiste (`AbovePrompt`) |
| `hooks/format.ts` | reine Hilfsfunktionen: Wetter, Farben, mm:ss, Token-Format |
| `types/index.d.ts` | Zustandsvertrag `PluginState['cache-meter']` |
| `tests/cache-meter.test.ts` | Tests mit dem Test-Kit von Claude Code |

Die Hooks:

- `turn.step` liest die Token-Zahlen jeder Anfrage des Hauptgesprächs
  (Schritte mit `agentId` sind Subagenten und zählen nicht).
- `session.measure` liefert den Füllstand des Kontextfensters und die
  Nutzungsfenster, aus denen `auto` die Cache-Lebensdauer schätzt.
- `session.start` startet einen Sekundentakt, der nur schreibt, solange der
  Cache warm ist, und einmal beim Ablauf.
- `session.compact` zeigt die Komprimierung an, egal ob sie vom Knopf, von
  `/compact` oder automatisch kommt. Schlägt der Hook fehl, läuft die
  Komprimierung trotzdem (`.catch` gibt sie weiter).
- `turn.start` räumt die Meldung „gespart“ ab, `session.end` mit
  `reason: 'clear'` setzt alles zurück.

Der Zustand liegt in `$.state` und übersteht damit ein Neuladen des Moduls.

## Prüfen

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

Typprüfung: Lädt Claude Code den Mod aus einem beobachteten Ordner (etwa mit
`claude --plugin-dir .`), legt es die Typen unter `.claude-plugin/types/` ab,
dann reicht `tsc -p .` mit einer `tsconfig.json`, die
`.claude-plugin/types/tsconfig.json` erweitert. Sonst steht eine passende
`tsconfig.json` im Kopf der Typdatei, die das Skill `plugin-authoring`
mitbringt.

Zum Ausprobieren ohne Installation:

```bash
claude --plugin-dir .
```

### Bekannte Lücke

Das Test-Kit gibt einer Komprimierung, die der Mod selbst auslöst
(`$.session.compact()` hinter dem Knopf), ein leeres Gespräch mit und bricht
sie ab. Der Test prüft die Anzeige deshalb über den Weg, den auch `/compact`
nimmt. Den Klick auf den Knopf nach einer Änderung von Hand prüfen.

## Festgelegte Werte

Die Schwellen sind gewählt, nicht gemessen:

- Wetter: 40 / 60 / 80 % des Kontextfensters, Compact-Knopf ab ⛅
- Countdown: gelb unter einem Viertel der Lebensdauer, rot unter 60 s
- Trefferquote: grün ab 80 %, gelb ab 40 %

## Neue Version

1. `version` in `.claude-plugin/plugin.json` erhöhen, sonst erkennt
   `claude plugin update` die Änderung nicht.
2. Prüfen (siehe oben), committen, pushen.
3. Optional ein Git-Tag: `claude plugin tag .`
