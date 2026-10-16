import { createFileRoute } from "@tanstack/react-router";
import { Fish, Flag, Gauge, RotateCcw, Timer, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createAudio, type AudioHandle } from "@/game/audio";
import { mountRide, type TouchState } from "@/game/scene";
import type { Hud } from "@/game/sim";
import { TOTAL_LAPS } from "@/game/track";

export const Route = createFileRoute("/")({
  component: Home,
});

type Phase = "title" | "play" | "done";
type HoldKey = keyof TouchState;

const BEST_KEY = "pelican-fatfish-best-ms";

function formatMs(ms: number) {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const tenths = Math.floor((total - Math.floor(total)) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
}

function emptyHud(): Hud {
  return {
    speed: 0,
    lapsDone: 0,
    fish: 0,
    ms: 0,
    charge: 0,
    boosting: false,
    finished: false,
    offtrack: false,
    wrongWay: false,
    theta: 0.22,
    yaw: Math.PI,
    bestMs: null,
    isNewBest: false,
    drifting: false,
  };
}

function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(false);
  const touchRef = useRef<TouchState>({
    left: false,
    right: false,
    gas: false,
    brake: false,
    drift: false,
  });
  const audioRef = useRef<AudioHandle | null>(null);
  const apiRef = useRef<{ reset: () => void; dispose: () => void } | null>(null);
  const hudSink = useRef<(h: Hud) => void>(() => {});
  const [phase, setPhase] = useState<Phase>("title");
  const [hud, setHud] = useState<Hud>(emptyHud);
  const [touch, setTouch] = useState<TouchState>(touchRef.current);
  const [muted, setMuted] = useState(false);
  const [bestPreview, setBestPreview] = useState<number | null>(null);

  hudSink.current = (h) => {
    if (!runningRef.current && !h.finished) return;
    setHud(h);
    setPhase((p) => {
      if (!runningRef.current) return p;
      if (h.finished) return "done";
      if (p === "done") return "play";
      return p;
    });
  };

  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(BEST_KEY));
      if (Number.isFinite(n) && n > 0) setBestPreview(n);
    } catch {
      /* ignore */
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const api = mountRide(canvas, {
      getRunning: () => runningRef.current,
      getTouch: () => touchRef.current,
      getAudio: () => audioRef.current,
      onHud: (h) => hudSink.current(h),
    });
    apiRef.current = api;
    const onVis = () => {
      if (document.visibilityState === "visible") audioRef.current?.unlock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      api.dispose();
      apiRef.current = null;
    };
  }, []);

  function start() {
    if (!audioRef.current) audioRef.current = createAudio();
    audioRef.current.unlock();
    audioRef.current.playStart();
    runningRef.current = true;
    setPhase("play");
  }

  function restart() {
    apiRef.current?.reset();
    runningRef.current = true;
    setPhase("play");
    setHud(emptyHud());
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (!audioRef.current) audioRef.current = createAudio();
    audioRef.current.setMuted(next);
  }

  function hold(key: HoldKey, down: boolean) {
    touchRef.current = { ...touchRef.current, [key]: down };
    setTouch(touchRef.current);
  }

  const lapShown = hud.finished ? TOTAL_LAPS : Math.min(TOTAL_LAPS, hud.lapsDone + 1);
  const speedKmh = Math.round(Math.abs(hud.speed) * 3.6);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink text-foam select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="鹈鹕大肥鱼骑车"
      />

      {phase === "title" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 md:p-8">
          <section className="pointer-events-auto max-w-md rounded-2xl bg-ink/85 p-4 md:p-6">
            <p className="font-display text-sand">海边木栈道</p>
            <h1 className="mt-1 font-display text-4xl leading-tight text-foam md:text-6xl">
              鹈鹕大肥鱼骑车
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-foam/80">
              胖得像一条鱼的鹈鹕，踩着沙滩自行车绕泻湖跑三圈。捡小鱼，压弯再喷，别冲进海里。
            </p>
            <div className="mt-4 hidden flex-wrap gap-2 md:flex">
              <KeyHint keys="W" label="加速" />
              <KeyHint keys="S" label="刹车" />
              <KeyHint keys="A D" label="转向" />
              <KeyHint keys="空格" label="漂移" />
            </div>
            {bestPreview !== null ? (
              <p className="mt-4 text-sm text-sand">最好成绩 {formatMs(bestPreview)}</p>
            ) : null}
          </section>
          <div className="pointer-events-auto flex flex-col items-start gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                start();
              }}
              className="h-14 rounded-full bg-beak px-8 font-display text-xl text-ink"
            >
              Start 出发
            </button>
            <p className="text-sm text-foam/80 md:hidden">按住加速，左右转向，漂移压弯。</p>
          </div>
        </div>
      ) : null}

      {phase !== "title" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 md:p-5">
          <div className="flex items-start justify-between gap-2">
            <section className="pointer-events-auto rounded-2xl bg-ink/80 p-3">
              <p className="flex items-center gap-2 font-display text-lg text-foam">
                <Flag className="size-4 text-sand" aria-hidden />第 {lapShown} / {TOTAL_LAPS} 圈
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-foam/80">
                <Timer className="size-4 text-sand" aria-hidden />
                <span className="tabular-nums">{formatMs(hud.ms)}</span>
              </p>
              <Minimap theta={hud.theta} yaw={hud.yaw} />
            </section>
            <section className="pointer-events-auto rounded-2xl bg-ink/80 p-3 text-right">
              <p className="flex items-center justify-end gap-2 font-display text-lg">
                <Fish className="size-4 text-beak" aria-hidden />
                {hud.fish} 条
              </p>
              <p className="mt-1 flex items-center justify-end gap-2 text-sm text-sand">
                <Gauge className="size-4" aria-hidden />
                <span className="tabular-nums">{speedKmh} km/h</span>
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <IconButton label={muted ? "打开声音" : "静音"} onClick={toggleMute}>
                  {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                </IconButton>
                <IconButton label="重开" onClick={restart}>
                  <RotateCcw className="size-5" />
                </IconButton>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2">
              {hud.wrongWay ? (
                <p className="rounded-full bg-beak px-4 py-2 font-display text-ink">反了，掉头</p>
              ) : null}
              {hud.offtrack ? (
                <p className="rounded-full bg-sand px-4 py-2 font-display text-ink">沙滩减速</p>
              ) : null}
              {hud.boosting ? (
                <p className="rounded-full bg-foam px-4 py-2 font-display text-ink">喷一下</p>
              ) : null}
              {hud.charge > 0.02 || hud.drifting ? (
                <div className="h-2 w-40 overflow-hidden rounded-full bg-foam/20">
                  <div
                    className="h-full origin-left bg-beak"
                    style={{ transform: `scaleX(${Math.max(0.04, hud.charge)})` }}
                  />
                </div>
              ) : null}
            </div>
            {phase === "play" ? (
              <div className="touch-controls pointer-events-auto items-end justify-between gap-3">
                <div className="flex gap-2">
                  <HoldButton label="左转" pressed={touch.left} onHold={(d) => hold("left", d)} />
                  <HoldButton label="右转" pressed={touch.right} onHold={(d) => hold("right", d)} />
                </div>
                <div className="flex gap-2">
                  <HoldButton label="刹车" pressed={touch.brake} onHold={(d) => hold("brake", d)} />
                  <HoldButton label="漂移" pressed={touch.drift} onHold={(d) => hold("drift", d)} />
                  <HoldButton label="加速" pressed={touch.gas} onHold={(d) => hold("gas", d)} wide />
                </div>
              </div>
            ) : (
              <div />
            )}
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <section className="w-full max-w-sm rounded-2xl bg-ink/90 p-6 text-center">
            <p className="font-display text-sand">{hud.isNewBest ? "新纪录" : "三圈到站"}</p>
            <h2 className="mt-1 font-display text-4xl text-foam">鹈鹕靠岸了</h2>
            <p className="mt-4 font-display text-3xl tabular-nums text-beak">{formatMs(hud.ms)}</p>
            <p className="mt-2 text-sm text-foam/80">吃掉 {hud.fish} 条小鱼</p>
            {hud.bestMs !== null ? (
              <p className="mt-1 text-sm text-sand">最好 {formatMs(hud.bestMs)}</p>
            ) : null}
            <button
              type="button"
              onClick={restart}
              className="mt-6 h-14 w-full rounded-full bg-beak font-display text-xl text-ink"
            >
              再骑一次
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-foam/10 px-3 py-1 text-sm">
      <span className="font-display text-sand">{keys}</span>
      <span>{label}</span>
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full bg-foam/10 text-foam"
    >
      {children}
    </button>
  );
}

function HoldButton({
  label,
  pressed,
  onHold,
  wide,
}: {
  label: string;
  pressed: boolean;
  onHold: (down: boolean) => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`h-14 rounded-full px-4 font-display text-base ${wide ? "min-w-20" : "min-w-14"} ${
        pressed ? "bg-beak text-ink" : "bg-ink/85 text-foam"
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {label}
    </button>
  );
}

function Minimap({ theta, yaw }: { theta: number; yaw: number }) {
  const cx = 46;
  const cy = 46;
  const rx = 32;
  const ry = 20;
  const px = cx + Math.cos(theta) * rx;
  const py = cy - Math.sin(theta) * ry;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return (
    <svg viewBox="0 0 92 92" className="mt-2 h-20 w-20" aria-hidden>
      <ellipse cx={cx} cy={cy} rx={38} ry={26} className="fill-sea/40" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="fill-none stroke-sand" strokeWidth={5} />
      <line
        x1={px}
        y1={py}
        x2={px + fx * 8}
        y2={py - fz * 8}
        className="stroke-foam"
        strokeWidth={2}
      />
      <circle cx={px} cy={py} r={3.5} className="fill-beak" />
    </svg>
  );
}
