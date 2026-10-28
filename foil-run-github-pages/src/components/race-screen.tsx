import { useEffect, useRef, useState } from "react";
import { TRACK_LENGTH, type AbilityId, type Settings } from "@/game/settings";
import { Director, type RaceKind, type RoundState } from "@/game/director";
import { RaceAudio } from "@/game/audio";
import { RaceWorld } from "@/game/view";
import { isNetMsg } from "@/game/protocol";
import type { FoilNet } from "@/game/use-foil-net";
import { ScratchDeck } from "@/components/scratch-deck";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
    };
  }
}

interface Hud {
  time: number;
  speed: number;
  luck: number;
  s: number;
  banner: string;
  bannerGood: boolean;
  bannerId: number;
  rev: number;
  over: { survived: boolean; time: number } | null;
  round: RoundState | null;
}

export function RaceScreen({
  settings,
  kind,
  humanScratch,
  cpuScratch,
  net,
  onExit,
  onAgain,
  onPit,
}: {
  settings: Settings;
  kind: RaceKind;
  humanScratch: boolean;
  cpuScratch: boolean;
  net?: FoilNet;
  onExit: () => void;
  onAgain?: () => void;
  onPit?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directorRef = useRef<Director | null>(null);
  if (!directorRef.current) {
    directorRef.current = new Director(settings, kind, { humanScratch, cpuScratch });
  }
  const director = directorRef.current;
  const [hud, setHud] = useState<Hud>(() => sample(director));
  const [webgl, setWebgl] = useState(true);
  const humanDrive = kind === "solo-drive" || kind === "net-drive";

  const netRef = useRef(net);
  netRef.current = net;

  useEffect(() => {
    const director = directorRef.current;
    const onMessage = net?.onMessage;
    if (!director || !onMessage) return;
    return onMessage((_from, data, channel) => {
      if (!isNetMsg(data)) return;
      if (channel === "state" && data.k === "car") director.onNet(data);
      if (channel === "reliable" && data.k !== "car") director.onNet(data);
    });
  }, [net?.onMessage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const director = directorRef.current;
    if (!canvas || !director) return;
    const world = new RaceWorld(canvas, director.sim.track);
    setWebgl(world.ok);
    const audio = new RaceAudio();
    audio.unlock();
    let raf = 0;
    let last = performance.now();
    let accHud = 0;
    let accSend = 0;
    let lastBanner = director.sim.bannerId;
    let lastRev = director.rev;
    const hold = new Set<string>();

    const probeOn = import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");
    if (probeOn && humanDrive) {
      window.__controlsTest = {
        getYaw: () => director.sim.getYaw(),
        getSpeed: () => director.sim.getSpeed(),
        setKeys: (codes) => {
          hold.clear();
          for (const code of codes) hold.add(code);
          director.sim.setKeys([...hold]);
        },
      };
    }

    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
        hold.add(e.code);
        director.sim.setKeys([...hold]);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      hold.delete(e.code);
      director.sim.setKeys([...hold]);
    };
    const clear = () => {
      hold.clear();
      director.sim.setKeys([]);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      director.frame(dt);
      const pose = director.pose();
      world.update(dt, pose);
      audio.setSpeed(pose.speed);
      if (director.sim.bannerId !== lastBanner) {
        lastBanner = director.sim.bannerId;
        audio.sting(director.sim.bannerGood);
      }
      if (netRef.current && director.simulate) {
        accSend += dt;
        if (accSend >= 0.05) {
          accSend = 0;
          netRef.current.broadcast(director.carMessage());
        }
        if (director.pending.length) {
          const batch = director.pending.splice(0, director.pending.length);
          for (const msg of batch) netRef.current.send(msg);
        }
      } else if (director.pending.length) {
        director.pending.length = 0;
      }
      accHud += dt;
      if (accHud >= 0.1 || director.rev !== lastRev) {
        accHud = 0;
        lastRev = director.rev;
        setHud(sample(director));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", onResize);
      if (window.__controlsTest) delete window.__controlsTest;
      world.dispose();
      audio.stop();
    };
  }, [humanDrive]);

  const press = (code: string, down: boolean) => {
    const director = directorRef.current;
    if (!director) return;
    const next = new Set(director.sim.keys);
    if (down) next.add(code);
    else next.delete(code);
    director.sim.setKeys([...next]);
  };

  const pct = Math.max(0, Math.min(1, hud.s / TRACK_LENGTH));
  const heat = Math.round(hud.luck * 100);
  const remain = Math.max(0, settings.parTime - hud.time);

  return (
    <div className="race-root relative h-dvh w-full overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="h-full w-full touch-none" />
      </div>
      {hud.speed > 28 && (
        <div
          className="speed-lines pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-40"
          style={{ opacity: Math.min(0.55, hud.speed / 140) }}
        />
      )}
      {!webgl && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-fg">
          This heat needs WebGL. Try another browser.
        </p>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-5">
        <div className="flex flex-col">
          <p className="eyebrow">{hud.over ? (hud.over.survived ? "Cleared" : "Flatlined") : "Death clock"}</p>
          <p
            className={
              remain < 5 && !hud.over
                ? "display tabular-nums text-5xl text-oxide sm:text-7xl"
                : "display tabular-nums text-5xl text-fg sm:text-7xl"
            }
          >
            {formatClock(hud.over ? hud.over.time : hud.time)}
          </p>
          <p className="text-sm tabular-nums text-muted">par {settings.parTime.toFixed(1)}s</p>
          <p className="eyebrow mt-3">Speed</p>
          <p className="display tabular-nums text-4xl text-gold sm:text-5xl">{Math.round(hud.speed)}</p>
          <p className="text-sm text-muted">uncapped m/s</p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        {hud.banner && (
          <p className={hud.bannerGood ? "display text-6xl text-gold" : "display text-6xl text-oxide"} aria-live="polite">
            {hud.banner}
          </p>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-40 flex-1">
            <p className="eyebrow">Foil heat {heat}%</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-gold" style={{ width: `${heat}%` }} />
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-fg/70" style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
          {humanDrive && (
            <p className="hidden text-sm text-muted md:block">W throttle · A left · D right · S brake</p>
          )}
        </div>

        {humanScratch ? (
          <div className="pointer-events-auto max-h-[46vh] overflow-y-auto">
            <ScratchDeck
              round={hud.round}
              raceTime={hud.time}
              human
              onPick={(id: AbilityId) => directorRef.current?.pick(id)}
              onReveal={() => directorRef.current?.revealNow()}
            />
          </div>
        ) : (
          <p className="pointer-events-none text-sm text-fg">
            {hud.round?.result
              ? hud.round.result.win
                ? "Foil hit."
                : "Foil bust — the curse is on the car."
              : hud.round
                ? "Ticket is live. Stay fast."
                : "Foil warms up once the car is moving."}
          </p>
        )}

        {humanDrive && (
          <div className="pointer-events-auto flex items-end justify-between gap-3 md:hidden pb-[env(safe-area-inset-bottom)]">
            <div className="flex gap-2">
              <Hold label="◀" sub="Left" onDown={() => press("ArrowLeft", true)} onUp={() => press("ArrowLeft", false)} />
              <Hold label="▶" sub="Right" onDown={() => press("ArrowRight", true)} onUp={() => press("ArrowRight", false)} />
            </div>
            <div className="flex flex-1 max-w-[11rem] gap-2">
              <Hold label="Brake" wide onDown={() => press("KeyS", true)} onUp={() => press("KeyS", false)} />
              <Hold label="Gas" sub="Hold" wide accent onDown={() => press("KeyW", true)} onUp={() => press("KeyW", false)} />
            </div>
          </div>
        )}
      </div>

      {hud.over && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/70 p-4">
          <div className="panel w-full max-w-md p-6">
            <p className="eyebrow">{hud.over.survived ? "Under the clock" : "The clock won"}</p>
            <h2 className={hud.over.survived ? "display text-6xl text-gold" : "display text-6xl text-oxide"}>
              {hud.over.survived ? "CLEARED" : "FLATLINED"}
            </h2>
            <p className="mt-2 tabular-nums text-fg">
              {hud.over.time.toFixed(2)}s against a {settings.parTime.toFixed(1)}s death clock
            </p>
            <ul className="mt-4 flex flex-col gap-1 text-sm text-muted">
              {(directorRef.current?.sim.log ?? []).map((row) => (
                <li key={row.id}>
                  {row.win ? "Hit" : "Bust"} · {row.ability} · {Math.round(row.luck * 100)}% luck
                </li>
              ))}
              {(directorRef.current?.sim.log.length ?? 0) === 0 && <li>No ticket landed.</li>}
            </ul>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {onAgain && (
                <Button type="button" onClick={onAgain}>
                  Run it again
                </Button>
              )}
              {onPit && (
                <Button type="button" variant="raised" onClick={onPit}>
                  Back to the pit
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onExit}>
                Leave
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function sample(director: Director): Hud {
  const pose = director.pose();
  return {
    time: pose.time,
    speed: pose.speed,
    luck: pose.luck,
    s: pose.s,
    banner: director.simulate && director.sim.time - director.sim.bannerAt < 2.2 ? director.sim.banner : "",
    bannerGood: director.sim.bannerGood,
    bannerId: director.sim.bannerId,
    rev: director.rev,
    over: director.over,
    round: director.round,
  };
}

function formatClock(t: number) {
  const safe = Math.max(0, t);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function Hold({
  label,
  sub,
  wide,
  accent,
  onDown,
  onUp,
}: {
  label: string;
  sub?: string;
  wide?: boolean;
  accent?: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <button
      type="button"
      className={
        (wide ? "h-16 min-w-[4.5rem] flex-1 " : "h-16 min-w-[3.6rem] ") +
        "select-none rounded-xl border px-3 text-sm font-semibold touch-manipulation " +
        (accent
          ? "border-gold/60 bg-gold/20 text-gold active:bg-gold/35"
          : "border-line bg-surface/95 text-fg active:bg-raised")
      }
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="block leading-tight">{label}</span>
      {sub && <span className="block text-[10px] font-normal opacity-70">{sub}</span>}
    </button>
  );
}
