import { useEffect, useRef } from "react";

interface StabilizerCorrections {
  roll?: number;
  pitch?: number;
  yaw?: number;
  throttle?: number;
  forward?: number;
  lateral?: number;
}

interface StabilizerProposal {
  source?: string;
  corrections?: StabilizerCorrections;
}

interface ProposalRecord {
  source: string;
  corrections: StabilizerCorrections;
  capturedAt: number;
}

const SEND_INTERVAL_MS = 220;
const PROPOSAL_STALE_MS = 1400;

function getConnectionString(): string {
  try {
    const raw = localStorage.getItem("mouse_selected_drone");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.connectionString || "").trim();
  } catch {
    return "";
  }
}

export function StabilizationActuatorBridge() {
  const proposalsRef = useRef<Map<string, ProposalRecord>>(new Map());
  const inFlightRef = useRef(false);

  useEffect(() => {
    const onProposal = (event: Event) => {
      const custom = event as CustomEvent<StabilizerProposal>;
      const detail = custom.detail || {};
      const source = String(detail.source || "unknown").trim().toLowerCase();
      if (!source) return;
      const corrections = detail.corrections && typeof detail.corrections === "object" ? detail.corrections : {};
      proposalsRef.current.set(source, {
        source,
        corrections,
        capturedAt: Date.now(),
      });
    };

    window.addEventListener("stabilizer-proposal", onProposal as any);
    return () => {
      window.removeEventListener("stabilizer-proposal", onProposal as any);
    };
  }, []);

  useEffect(() => {
    const pickProposal = (): ProposalRecord | null => {
      const now = Date.now();
      const candidates = Array.from(proposalsRef.current.values()).filter((proposal) => now - proposal.capturedAt <= PROPOSAL_STALE_MS);
      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => {
        if (a.source === b.source) return b.capturedAt - a.capturedAt;
        if (a.source === "ml_stabilizer") return -1;
        if (b.source === "ml_stabilizer") return 1;
        return b.capturedAt - a.capturedAt;
      });
      return candidates[0] || null;
    };

    const timer = window.setInterval(() => {
      if (inFlightRef.current) return;
      const proposal = pickProposal();
      if (!proposal) return;

      const connectionString = getConnectionString();
      if (!connectionString) return;

      inFlightRef.current = true;
      void fetch("/api/stabilization/actuate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: proposal.source,
          corrections: proposal.corrections,
          connectionString,
          durationMs: SEND_INTERVAL_MS,
        }),
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload?.success) {
            throw new Error(payload?.error || `stabilization dispatch failed (${response.status})`);
          }
          window.dispatchEvent(
            new CustomEvent("stabilizer-actuation-result", {
              detail: {
                success: true,
                source: proposal.source,
                sentAt: payload?.command?.sentAt || new Date().toISOString(),
                manualControl: payload?.command?.manualControl || null,
              },
            }),
          );
        })
        .catch((error: any) => {
          window.dispatchEvent(
            new CustomEvent("stabilizer-actuation-result", {
              detail: {
                success: false,
                source: proposal.source,
                error: String(error?.message || "stabilization command failed"),
                sentAt: new Date().toISOString(),
              },
            }),
          );
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }, SEND_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return null;
}
