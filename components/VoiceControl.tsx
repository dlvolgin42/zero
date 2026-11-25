"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Trash2 } from "lucide-react";

// Voice button: tap to start dictating, tap again to stop. The caller records the expense from the recognised text.
const BARS = 28;
const flat = () => Array<number>(BARS).fill(0.08);
const vibrate = (ms: number) => { try { navigator.vibrate?.(ms); } catch {} };
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function VoiceControl({ onText, onMessage, onActive }: {
  onText: (text: string) => void | Promise<void>;
  onMessage: (message: string) => void;
  onActive: (active: boolean) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bars, setBars] = useState<number[]>(flat);

  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const startedAt = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recog = useRef<any>(null);
  const transcript = useRef("");
  const hasRecognition = useRef(false);
  const callbacks = useRef({ onText, onMessage, onActive });
  callbacks.current = { onText, onMessage, onActive };

  const setActive = (on: boolean) => { activeRef.current = on; setRecording(on); callbacks.current.onActive(on); };

  const stopAudio = () => {
    cancelAnimationFrame(raf.current);
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    if (ringRef.current) ringRef.current.style.transform = "scale(1.35)";
    setBars(flat());
  };
  const stopRecognition = () => { try { recog.current?.abort?.(); } catch {} recog.current = null; };
  useEffect(() => () => { stopAudio(); stopRecognition(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const abort = (message: string) => { stopAudio(); stopRecognition(); setActive(false); callbacks.current.onMessage(message); };
  const cancel = () => { if (busyRef.current) return; stopAudio(); stopRecognition(); setActive(false); vibrate(8); };

  const finish = async () => {
    if (!activeRef.current || busyRef.current) return;
    // Show "processing" at once and stop capturing; the recogniser may need a moment for the last words.
    busyRef.current = true; setBusy(true); vibrate(10);
    stopAudio();
    const rec = recog.current;
    if (rec) await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 900);
      rec.onend = () => { clearTimeout(t); resolve(); };
      try { rec.stop(); } catch { clearTimeout(t); resolve(); }
    });
    const text = transcript.current.trim();
    stopRecognition();
    // "Processing" stays on while the phrase is being turned into an expense (the server asks Claude, a second or two).
    if (text) { try { await callbacks.current.onText(text); } catch {} }
    busyRef.current = false; setBusy(false); setActive(false);
    if (!text) callbacks.current.onMessage(hasRecognition.current ? "Не расслышал. Попробуй ещё раз" : "Этот браузер не распознаёт речь. Открой Zero в Safari или Chrome");
  };

  const begin = async () => {
    if (activeRef.current || busyRef.current) return;
    setActive(true); vibrate(12);
    startedAt.current = performance.now();
    setSeconds(0);
    transcript.current = "";
    timer.current = setInterval(() => setSeconds(Math.floor((performance.now() - startedAt.current) / 1000)), 250);

    // Created inside the tap itself: iOS only lets audio start from a user gesture.
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try { ctx = AC ? new AC() : null; ctx?.resume(); } catch {}
    if (!navigator.mediaDevices?.getUserMedia) { ctx?.close().catch(() => {}); return abort("Микрофон недоступен: нужен защищённый адрес (https)"); }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) { s.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {}); return; }
      stream.current = s;
      if (ctx) {
        audioCtx.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let last = 0, smooth = 0;
        const tick = (now: number) => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
          const l = Math.min(1, Math.sqrt(sum / data.length) * 5);
          smooth = smooth * 0.55 + l * 0.45;
          if (ringRef.current) ringRef.current.style.transform = `scale(${1.35 + smooth * 1.3})`;
          if (now - last > 70) { last = now; setBars((b) => [...b.slice(1), Math.max(0.08, l)]); }
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      }
    } catch {
      ctx?.close().catch(() => {});
      return abort("Нет доступа к микрофону. Разреши его в настройках браузера");
    }

    // Speech to text where the browser has it (Chrome on Android, Safari in a tab).
    // Installed iOS home-screen apps do not support it; the server will transcribe there.
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    hasRecognition.current = !!SR;
    if (SR) {
      try {
        const r = new SR();
        r.lang = "ru-RU"; r.continuous = true; r.interimResults = true;
        r.onresult = (e: any) => {
          let t = "";
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
          transcript.current = t.trim();
        };
        r.onerror = () => {};
        r.start();
        recog.current = r;
      } catch {}
    }
  };

  return (
    <>
      {/* Above the recording bar (z-40 over its z-30): the button sits at the bar's right end and must stay tappable to finish. */}
      <div className="fixed right-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40">
        <div className="relative">
          {recording && !busy && <span ref={ringRef} className="absolute inset-0 rounded-full bg-[#a5b4fc]/50" style={{ transform: "scale(1.35)", transition: "transform 90ms linear" }} />}
          <button aria-label={busy ? "Обрабатываю" : recording ? "Закончить запись" : "Записать голосом"} aria-pressed={recording} disabled={busy}
            onClick={() => void (recording ? finish() : begin())}
            style={{ touchAction: "manipulation" }}
            className={`relative grid size-14 select-none place-items-center rounded-full transition active:scale-95 ${recording ? "bg-[#a5b4fc] text-[#111827] shadow-[0_6px_20px_rgba(99,102,241,0.45)]" : "glass"}`}>
            {busy ? <Loader2 className="size-6 animate-spin" /> : <Mic className="size-6" />}
          </button>
        </div>
      </div>

      {recording && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="rise glass pointer-events-auto flex h-[4.5rem] w-full max-w-sm items-center gap-3 rounded-full px-3 text-[#111827]">
            {busy ? (
              <span className="flex flex-1 items-center justify-center gap-2 text-base"><Loader2 className="size-5 animate-spin opacity-60" />Обрабатываю…</span>
            ) : (
              <>
                <button aria-label="Отменить запись" className="grid size-12 shrink-0 place-items-center rounded-full active:bg-black/10" onClick={cancel}><Trash2 className="size-6 text-[#E0245E]" /></button>
                <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-[#E0245E]" />
                <span className="w-10 shrink-0 text-base font-medium tabular-nums">{fmtTime(seconds)}</span>
                <span className="flex h-9 flex-1 items-center justify-end gap-[3px] overflow-hidden pr-16" aria-hidden>
                  {bars.map((v, i) => <span key={i} className="w-[3px] shrink-0 rounded-full bg-[#111827]/70" style={{ height: 4 + v * 30 }} />)}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
