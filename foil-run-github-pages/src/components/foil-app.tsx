import { useEffect, useState } from "react";
import { defaultSettings, makeCode, settingsSchema, type Settings } from "@/game/settings";
import { HomeScreen } from "@/components/home-screen";
import { FindScreen } from "@/components/find-screen";
import { RoomScreen } from "@/components/room-screen";
import { RaceScreen } from "@/components/race-screen";

type Route =
  | { name: "home" }
  | { name: "find" }
  | { name: "solo"; kind: "drive" | "scratch"; settings: Settings; run: number }
  | { name: "room"; code: string; hosting: boolean; isPublic: boolean; settings: Settings };

async function publish(code: string, hostPeer: string, hostName: string, isPublic: boolean, settings: Settings) {
  const res = await fetch("/api/lobbies", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      op: "upsert",
      code,
      hostPeer,
      hostName,
      title: settings.title,
      isPublic,
      settings,
      players: 1,
      status: "open",
      names: [hostName],
    }),
  });
  return res;
}

export function FoilApp() {
  const [name, setName] = useState("Rookie");
  const [code, setCode] = useState("");
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostPeer] = useState(() => `h-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    const saved = window.localStorage.getItem("foil-name");
    if (saved) setName(saved.slice(0, 24));
  }, []);

  function remember(next: string) {
    const clean = next.slice(0, 24);
    setName(clean);
    window.localStorage.setItem("foil-name", clean);
  }

  async function create(isPublic: boolean, settings: Settings) {
    setBusy(true);
    setError(null);
    const hostName = name.trim() || "Rookie";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const next = makeCode();
      const res = await publish(next, hostPeer, hostName, isPublic, settings);
      if (res.status === 409) continue;
      if (!res.ok) {
        setError("Couldn't open a pit. Multiplayer needs a server (not available on static hosts).");
        setBusy(false);
        return;
      }
      setRoute({ name: "room", code: next, hosting: true, isPublic, settings });
      setBusy(false);
      return;
    }
    setError("Codes kept colliding. Try again.");
    setBusy(false);
  }

  async function join(raw: string) {
    const next = raw.trim().toUpperCase();
    if (next.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lobbies?code=${encodeURIComponent(next)}`);
      if (res.status === 404) {
        setError("No heat under that code.");
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error("bad");
      const body = (await res.json()) as {
        lobby: { players: number; settings: Settings | null; status: string };
      };
      if (body.lobby.players >= 2 || body.lobby.status === "racing") {
        setError("That heat is full or already running.");
        setBusy(false);
        return;
      }
      const settings = body.lobby.settings ?? defaultSettings();
      const parsed = settingsSchema.safeParse(settings);
      setRoute({
        name: "room",
        code: next,
        hosting: false,
        isPublic: false,
        settings: parsed.success ? parsed.data : defaultSettings(),
      });
    } catch {
      setError("Couldn't reach that pit.");
    } finally {
      setBusy(false);
    }
  }

  if (route.name === "solo") {
    return (
      <RaceScreen
        key={route.run}
        settings={route.settings}
        kind={route.kind === "drive" ? "solo-drive" : "solo-scratch"}
        humanScratch={route.kind === "scratch"}
        cpuScratch={route.kind === "drive"}
        onExit={() => setRoute({ name: "home" })}
        onAgain={() => setRoute({ ...route, run: route.run + 1 })}
      />
    );
  }

  if (route.name === "room") {
    return (
      <RoomScreen
        code={route.code}
        name={name.trim() || "Rookie"}
        hosting={route.hosting}
        isPublic={route.isPublic}
        initial={route.settings}
        hostPeer={hostPeer}
        onLeave={() => setRoute({ name: "home" })}
      />
    );
  }

  if (route.name === "find") {
    return (
      <FindScreen
        onBack={() => setRoute({ name: "home" })}
        onJoin={(next) => {
          setRoute({ name: "home" });
          void join(next);
        }}
      />
    );
  }

  return (
    <HomeScreen
      name={name}
      onName={remember}
      code={code}
      onCode={setCode}
      busy={busy}
      error={error}
      onSolo={(kind, settings) => setRoute({ name: "solo", kind, settings, run: 1 })}
      onCreate={(isPublic, settings) => void create(isPublic, settings)}
      onJoin={() => void join(code)}
      onFind={() => setRoute({ name: "find" })}
    />
  );
}
