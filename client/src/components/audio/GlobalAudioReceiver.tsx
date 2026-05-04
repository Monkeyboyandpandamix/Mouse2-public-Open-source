import { useEffect, useRef } from "react";

// GlobalAudioReceiver
// -------------------
// Mounted once at the app root so EVERY connected browser tab can act as the
// onboard speaker. It listens for two window CustomEvents that TopBar
// translates from the WebSocket feed:
//
//   • `audio-chunk-incoming`  – a base64 Opus/WebM/PCM/WAV chunk from the
//                               operator's microphone (POSTed to /api/audio/stream
//                               and broadcast as `audio_chunk`). We feed the
//                               binary into a MediaSource so it plays through
//                               the system speaker continuously, the way a real
//                               drone speaker would.
//
//   • `audio-tts-broadcast`   – server fan-out of /api/audio/tts. We re-speak
//                               the text via the browser's Web Speech API so
//                               the onboard tab actually utters the message.
//                               (Server-side espeak / pico2wave is best-effort
//                               and only works on a Linux drone with audio
//                               hardware. Browsers always work.)
//
// To avoid the operator's tab playing back its OWN microphone (echo loop),
// SpeakerPanel writes a unique owner token into
// `sessionStorage.mouse_audio_sender` while it's streaming (the random token
// lets multiple SpeakerPanel instances within the same tab each clear only
// their own claim). We treat any non-empty value as "this tab is currently
// the active sender" and skip both audio_chunk playback and TTS playback in
// that tab.

const SENDER_FLAG_KEY = "mouse_audio_sender";
// Cap the SourceBuffer at ~30 s of audio so a long live stream doesn't grow
// unbounded and trigger QuotaExceededError.
const SOURCE_BUFFER_MAX_SECONDS = 30;
const SOURCE_BUFFER_KEEP_SECONDS = 5;

const isSenderTab = (): boolean => {
  try {
    const v = sessionStorage.getItem(SENDER_FLAG_KEY);
    return Boolean(v && v.length > 0);
  } catch {
    return false;
  }
};

const base64ToUint8 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const pickVoice = (voiceType: string): SpeechSynthesisVoice | null => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lower = voiceType.toLowerCase();
  if (lower === "male") {
    return (
      voices.find((v) =>
        ["male", "david", "james", "daniel", "fred", "alex"].some((n) => v.name.toLowerCase().includes(n)),
      ) || voices[0]
    );
  }
  if (lower === "female") {
    return (
      voices.find((v) =>
        ["female", "samantha", "karen", "victoria", "zira", "susan"].some((n) => v.name.toLowerCase().includes(n)),
      ) || voices[0]
    );
  }
  if (lower === "robotic") {
    return voices.find((v) => v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("microsoft")) || voices[0];
  }
  return voices.find((v) => v.default) || voices[0];
};

export function GlobalAudioReceiver() {
  // MediaSource state – created lazily and reused across chunks so playback
  // is continuous. Whenever the source codec changes (e.g. broadcast restarts
  // with a different mimeType) we tear down and recreate it.
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const sourceOpenHandlerRef = useRef<(() => void) | null>(null);
  const updateEndHandlerRef = useRef<(() => void) | null>(null);
  const autoplayResumeRef = useRef<(() => void) | null>(null);
  const mimeTypeRef = useRef<string | null>(null);
  const queueRef = useRef<Uint8Array[]>([]);
  // Generation counter increments on every MediaSource (re)create. Async
  // callbacks (play().catch, sourceopen) bail out if the generation moved
  // forward while they were pending — prevents stale resume listeners from
  // being registered against torn-down audio elements.
  const generationRef = useRef<number>(0);
  // Fallback path for codecs MediaSource can't handle (raw PCM, WAV, MP3 chunks).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioCtxResumeListenerRef = useRef<(() => void) | null>(null);
  const pendingDecodeQueueRef = useRef<Array<{ bytes: Uint8Array; mimeType: string }>>([]);
  const playbackTimeRef = useRef<number>(0);

  useEffect(() => {
    const teardownMediaSource = () => {
      // Bump generation so any in-flight async callback (play().catch,
      // sourceopen, updateend) sees a stale generation and bails.
      generationRef.current++;
      if (audioElRef.current) {
        try { audioElRef.current.pause(); } catch {}
        try { audioElRef.current.removeAttribute("src"); audioElRef.current.load(); } catch {}
      }
      if (objectUrlRef.current) {
        try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
        objectUrlRef.current = null;
      }
      const sb = sourceBufferRef.current;
      if (sb && updateEndHandlerRef.current) {
        try { sb.removeEventListener("updateend", updateEndHandlerRef.current); } catch {}
      }
      const ms = mediaSourceRef.current;
      if (ms && sourceOpenHandlerRef.current) {
        try { ms.removeEventListener("sourceopen", sourceOpenHandlerRef.current); } catch {}
      }
      if (autoplayResumeRef.current) {
        window.removeEventListener("click", autoplayResumeRef.current);
        window.removeEventListener("keydown", autoplayResumeRef.current);
        window.removeEventListener("touchstart", autoplayResumeRef.current);
        autoplayResumeRef.current = null;
      }
      audioElRef.current = null;
      sourceBufferRef.current = null;
      mediaSourceRef.current = null;
      sourceOpenHandlerRef.current = null;
      updateEndHandlerRef.current = null;
      mimeTypeRef.current = null;
      queueRef.current = [];
    };

    // Trim old data out of the SourceBuffer to avoid QuotaExceededError on
    // long live streams. Only safe to call when sb.updating === false.
    const pruneSourceBuffer = () => {
      const sb = sourceBufferRef.current;
      const audioEl = audioElRef.current;
      if (!sb || !audioEl || sb.updating) return;
      try {
        const buffered = sb.buffered;
        if (!buffered.length) return;
        const start = buffered.start(0);
        const end = buffered.end(buffered.length - 1);
        const total = end - start;
        if (total > SOURCE_BUFFER_MAX_SECONDS) {
          const removeUntil = end - SOURCE_BUFFER_KEEP_SECONDS;
          if (removeUntil > start) {
            sb.remove(start, removeUntil);
          }
        }
      } catch {
        // remove() can throw if the buffer is in a bad state; ignore.
      }
    };

    const flushQueue = () => {
      const sb = sourceBufferRef.current;
      const ms = mediaSourceRef.current;
      if (!sb || sb.updating) return;
      // If the MediaSource has been closed/ended (e.g. demux failed on bad
      // data, or it was torn down between event hops), the SourceBuffer is
      // detached and appendBuffer would throw InvalidStateError. Bail
      // silently; teardown will reset state on the next valid chunk.
      if (!ms || ms.readyState !== "open") return;
      const next = queueRef.current[0];
      if (!next) return;
      try {
        sb.appendBuffer(next);
        queueRef.current.shift(); // only consume after a successful append call
      } catch (err: any) {
        // QuotaExceededError → prune and try again next tick.
        if (err?.name === "QuotaExceededError") {
          pruneSourceBuffer();
          return;
        }
        // InvalidStateError: SourceBuffer was detached from the parent
        // MediaSource between our readyState check and the append. Expected
        // race during teardown / bad data — log at debug, drop the chunk.
        if (err?.name === "InvalidStateError") {
          console.debug("[GlobalAudioReceiver] appendBuffer race (detached SourceBuffer); dropping chunk");
          queueRef.current.shift();
          return;
        }
        // Anything else → drop this chunk so we don't infinite-loop.
        console.warn("[GlobalAudioReceiver] appendBuffer failed:", err);
        queueRef.current.shift();
      }
    };

    const ensureMediaSource = (mimeType: string): boolean => {
      // MediaSource only handles webm/mp4 containers cleanly. For raw / wav we
      // fall back to decodeAudioData below.
      if (typeof MediaSource === "undefined") return false;
      if (!MediaSource.isTypeSupported(mimeType)) return false;
      const ms = mediaSourceRef.current;
      const sb = sourceBufferRef.current;
      // Same mime AND we already have a SourceBuffer attached to a still-open
      // MediaSource → reuse. If the MediaSource has gone to "closed" or
      // "ended" (e.g. demux error on bad data), DON'T reuse — otherwise
      // flushQueue would bail forever and the receiver would silently wedge.
      // Falling through to teardown+recreate gives the next chunk a fresh
      // pipeline.
      if (mimeTypeRef.current === mimeType && sb && ms && ms.readyState === "open") return true;
      // Same mime AND we're in the middle of initializing (MediaSource open
      // pending, no SourceBuffer yet) → also reuse; the queue will drain
      // when sourceopen fires. Only valid if MediaSource is still in the
      // initial "closed" state (which is what MSE uses for "not yet open").
      // If readyState is already "ended", we need a fresh one.
      if (mimeTypeRef.current === mimeType && ms && !sb && ms.readyState !== "ended") return true;
      teardownMediaSource();

      const myGeneration = generationRef.current; // teardown already bumped
      const newMs = new MediaSource();
      const audioEl = new Audio();
      audioEl.autoplay = true;
      const url = URL.createObjectURL(newMs);
      audioEl.src = url;
      objectUrlRef.current = url;
      audioElRef.current = audioEl;
      mediaSourceRef.current = newMs;
      mimeTypeRef.current = mimeType;

      const onSourceOpen = () => {
        // Bail if we've been torn down / superseded since this MediaSource
        // was created.
        if (generationRef.current !== myGeneration) return;
        try {
          const sb = newMs.addSourceBuffer(mimeType);
          sb.mode = "sequence";
          const onUpdateEnd = () => {
            if (generationRef.current !== myGeneration) return;
            pruneSourceBuffer();
            flushQueue();
          };
          updateEndHandlerRef.current = onUpdateEnd;
          sb.addEventListener("updateend", onUpdateEnd);
          sourceBufferRef.current = sb;
          flushQueue();
        } catch (err) {
          console.warn("[GlobalAudioReceiver] addSourceBuffer failed:", err);
          // Without a SourceBuffer this MediaSource will never play. Tear it
          // down so the next chunk re-creates a fresh one instead of being
          // wedged on a permanently-empty open MediaSource.
          teardownMediaSource();
        }
      };
      sourceOpenHandlerRef.current = onSourceOpen;
      newMs.addEventListener("sourceopen", onSourceOpen);

      // Browsers block autoplay until a user gesture. If that happens, we'll
      // resume on the next click/keydown/touchstart anywhere in the document.
      // The generation guard prevents a stale rejected play() from this
      // generation registering listeners against an audio element we've
      // already torn down and replaced.
      audioEl.play().catch(() => {
        if (generationRef.current !== myGeneration) return; // superseded
        // If a previous resume listener is still pending (e.g. user hasn't
        // clicked yet), remove it before installing a new one — otherwise
        // we'd leak listeners.
        if (autoplayResumeRef.current) {
          window.removeEventListener("click", autoplayResumeRef.current);
          window.removeEventListener("keydown", autoplayResumeRef.current);
          window.removeEventListener("touchstart", autoplayResumeRef.current);
          autoplayResumeRef.current = null;
        }
        const resume = () => {
          // Only resume the audio element that's still current.
          if (generationRef.current === myGeneration) {
            audioEl.play().catch(() => {});
          }
          if (autoplayResumeRef.current === resume) {
            window.removeEventListener("click", autoplayResumeRef.current);
            window.removeEventListener("keydown", autoplayResumeRef.current);
            window.removeEventListener("touchstart", autoplayResumeRef.current);
            autoplayResumeRef.current = null;
          }
        };
        autoplayResumeRef.current = resume;
        window.addEventListener("click", resume, { once: true });
        window.addEventListener("keydown", resume, { once: true });
        window.addEventListener("touchstart", resume, { once: true });
      });
      return true;
    };

    const drainPendingDecodes = async () => {
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state !== "running") return;
      while (pendingDecodeQueueRef.current.length) {
        const item = pendingDecodeQueueRef.current.shift()!;
        await playViaAudioContext(item.bytes, item.mimeType);
      }
    };

    const ensureAudioContextResumeListener = () => {
      if (audioCtxResumeListenerRef.current) return;
      const resume = () => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        ctx.resume()
          .then(() => drainPendingDecodes())
          .catch(() => {});
        if (audioCtxResumeListenerRef.current) {
          window.removeEventListener("click", audioCtxResumeListenerRef.current);
          window.removeEventListener("keydown", audioCtxResumeListenerRef.current);
          window.removeEventListener("touchstart", audioCtxResumeListenerRef.current);
          audioCtxResumeListenerRef.current = null;
        }
      };
      audioCtxResumeListenerRef.current = resume;
      window.addEventListener("click", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
      window.addEventListener("touchstart", resume, { once: true });
    };

    const playViaAudioContext = async (bytes: Uint8Array, mimeType: string) => {
      try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current!;
        if (ctx.state === "suspended") {
          // Queue the chunk and wait for a user gesture to resume.
          pendingDecodeQueueRef.current.push({ bytes, mimeType });
          if (pendingDecodeQueueRef.current.length > 200) {
            // Cap so we don't OOM on a sustained silent stream.
            pendingDecodeQueueRef.current.splice(0, pendingDecodeQueueRef.current.length - 100);
          }
          ensureAudioContextResumeListener();
          ctx.resume().catch(() => {});
          return;
        }
        // Make a copy so decodeAudioData doesn't detach the underlying buffer.
        const arrayBuf = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(arrayBuf).set(bytes);
        const decoded = await ctx.decodeAudioData(arrayBuf);
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime, playbackTimeRef.current);
        src.start(startAt);
        playbackTimeRef.current = startAt + decoded.duration;
      } catch (err) {
        // decodeAudioData rejects on partial chunks; that's expected for
        // mid-stream Opus fragments. Safe to ignore.
        if ((err as DOMException)?.name !== "EncodingError") {
          console.debug("[GlobalAudioReceiver] decode failed:", err, "mime=", mimeType);
        }
      }
    };

    const onChunk = (event: Event) => {
      if (isSenderTab()) return; // operator's own tab — don't echo
      const detail = (event as CustomEvent<{ chunk?: string; mimeType?: string }>).detail;
      if (!detail?.chunk) return;
      const mimeType = (detail.mimeType || "audio/webm;codecs=opus").trim();
      const bytes = base64ToUint8(detail.chunk);
      if (bytes.byteLength === 0) return;

      if (ensureMediaSource(mimeType)) {
        queueRef.current.push(bytes);
        // Cap the pending queue so a stalled SourceBuffer can't grow forever.
        if (queueRef.current.length > 500) {
          queueRef.current.splice(0, queueRef.current.length - 250);
        }
        flushQueue();
      } else {
        void playViaAudioContext(bytes, mimeType);
      }
    };

    const onTts = (event: Event) => {
      if (isSenderTab()) return; // operator's own tab already spoke locally
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const detail = (event as CustomEvent<{ text?: string; voiceType?: string; rate?: number }>).detail;
      const text = String(detail?.text || "").trim();
      if (!text) return;
      try {
        // Some browsers leave SpeechSynthesis paused after long idle.
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch {}
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = Number(detail?.rate ?? 1) || 1;
      utter.pitch = String(detail?.voiceType || "").toLowerCase() === "robotic" ? 0.5 : 1;
      const voice = pickVoice(String(detail?.voiceType || "default"));
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang || "en-US";
      }
      try {
        window.speechSynthesis.speak(utter);
      } catch (err) {
        console.warn("[GlobalAudioReceiver] tts speak failed:", err);
      }
    };

    window.addEventListener("audio-chunk-incoming", onChunk as any);
    window.addEventListener("audio-tts-broadcast", onTts as any);

    // Voices load asynchronously in some browsers; trigger a load so our
    // first TTS request has voices available.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.getVoices();
      } catch {}
    }

    return () => {
      window.removeEventListener("audio-chunk-incoming", onChunk as any);
      window.removeEventListener("audio-tts-broadcast", onTts as any);
      teardownMediaSource();
      if (audioCtxResumeListenerRef.current) {
        window.removeEventListener("click", audioCtxResumeListenerRef.current);
        window.removeEventListener("keydown", audioCtxResumeListenerRef.current);
        window.removeEventListener("touchstart", audioCtxResumeListenerRef.current);
        audioCtxResumeListenerRef.current = null;
      }
      pendingDecodeQueueRef.current = [];
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = null;
    };
  }, []);

  return null;
}
