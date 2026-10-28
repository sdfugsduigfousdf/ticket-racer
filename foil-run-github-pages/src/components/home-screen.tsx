import { useState } from "react";
import { defaultSettings, type Settings } from "@/game/settings";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings-form";

export function HomeScreen({
  name,
  onName,
  code,
  onCode,
  busy,
  error,
  onSolo,
  onCreate,
  onJoin,
  onFind,
}: {
  name: string;
  onName: (name: string) => void;
  code: string;
  onCode: (code: string) => void;
  busy: boolean;
  error: string | null;
  onSolo: (kind: "drive" | "scratch", settings: Settings) => void;
  onCreate: (isPublic: boolean, settings: Settings) => void;
  onJoin: () => void;
  onFind: () => void;
}) {
  const [settings, setSettings] = useState(() => defaultSettings("Solo heat"));
  const [tuneOpen, setTuneOpen] = useState(true);

  function withTitle(title: string): Settings {
    return { ...settings, title };
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-3 py-6 sm:gap-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-3 sm:gap-4">
        <p className="eyebrow text-gold">Two seats. One clock.</p>
        <h1 className="display text-6xl text-fg sm:text-8xl">FOIL RUN</h1>
        <p className="max-w-xl text-base text-muted sm:text-lg">
          The runner has no speed limit and no prayer of beating the clock alone. The scratcher pulls tickets.
          Hit, and the car gets the miracle. Bust, and the miracle comes back inverted. Faster car, hotter luck.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <section className="ticket flex flex-col gap-4 p-4 sm:p-5 lg:col-span-3">
          <p className="eyebrow">Your name on the ticket</p>
          <input
            value={name}
            maxLength={24}
            aria-label="Your name"
            onChange={(e) => onName(e.target.value)}
            className="h-12 rounded-lg border border-line bg-bg px-3 text-fg"
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" size="lg" disabled={busy} onClick={() => onSolo("drive", withTitle("Solo heat"))}>
              Start solo heat
            </Button>
            <Button
              type="button"
              variant="raised"
              disabled={busy}
              onClick={() => onSolo("scratch", withTitle("Solo heat"))}
            >
              Scratch a solo heat
            </Button>
          </div>

          <p className="text-sm text-muted">
            Solo drive: you run, a CPU scratches. Solo scratch: a CPU runs the line and you pull the foil. Bring a
            friend if you want both seats human.
          </p>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <p className="eyebrow text-gold">Solo clock settings</p>
            <button
              type="button"
              className="text-sm font-semibold text-gold underline-offset-2 hover:underline"
              onClick={() => setTuneOpen((v) => !v)}
            >
              {tuneOpen ? "Hide" : "Show"}
            </button>
          </div>
          {tuneOpen && (
            <div className="rounded-lg border border-line bg-bg/60 p-3 sm:p-4">
              <SettingsForm value={settings} onChange={setSettings} />
            </div>
          )}
          {!tuneOpen && (
            <p className="text-sm text-muted">
              Engine {settings.engine.toFixed(1)} · Launch {settings.launchSpeed} · Par {settings.parTime}s ·{" "}
              {settings.density} · seed {settings.seed}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4 lg:col-span-2">
          <div className="panel flex flex-col gap-3 p-4 sm:p-5">
            <p className="eyebrow">Public board</p>
            <h2 className="display text-3xl sm:text-4xl">Find a heat</h2>
            <p className="text-sm text-muted">Open tables other people listed. Walk up and take the empty seat.</p>
            <Button type="button" variant="raised" onClick={onFind}>
              Find game
            </Button>
          </div>
          <div className="panel flex flex-col gap-3 p-4 sm:p-5">
            <p className="eyebrow">Private pit</p>
            <h2 className="display text-3xl sm:text-4xl">Share a code</h2>
            <p className="text-sm text-muted">
              Stays off the board. Uses the same clock settings you tuned for solo.
            </p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => onCreate(false, withTitle(`${name || "Rookie"}'s heat`))}
            >
              Open a private room
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onCreate(true, withTitle(`${name || "Rookie"}'s heat`))}
            >
              List a public heat
            </Button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onJoin();
              }}
            >
              <input
                value={code}
                aria-label="Room code"
                placeholder="Code"
                maxLength={8}
                onChange={(e) => onCode(e.target.value.toUpperCase())}
                className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 tracking-widest text-fg uppercase"
              />
              <Button type="submit" variant="raised" disabled={busy || code.trim().length < 4}>
                Join
              </Button>
            </form>
          </div>
          {error && <p className="text-sm text-oxide">{error}</p>}
        </section>
      </div>
    </main>
  );
}
