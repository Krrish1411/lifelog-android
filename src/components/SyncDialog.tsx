import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  Wifi,
  WifiOff,
  Check,
  Copy,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Radio,
  Zap,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../store";
import { syncEngine } from "../sync/syncEngine";
import type { SyncStatus, SyncPeerInfo } from "../sync/syncTypes";
import { Modal, Btn, TextInput, Seg } from "./ui";
import { triggerHaptic } from "../utils/native";

interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
}

export const SyncDialog: React.FC<SyncDialogProps> = ({ open, onClose }) => {
  const { state, toast } = useApp();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [peer, setPeer] = useState<SyncPeerInfo | null>(syncEngine.getConnectedPeer());
  const [activeTab, setActiveTab] = useState<"host" | "join">("host");
  const [deviceName, setDeviceName] = useState(
    state.settings.profileName
      ? `${state.settings.profileName}'s Device`
      : typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)
      ? "Android Phone"
      : "Desktop Workstation"
  );

  // Host state
  const [offerTicket, setOfferTicket] = useState<string>("");
  const [offerQrUrl, setOfferQrUrl] = useState<string>("");
  const [answerInput, setAnswerInput] = useState<string>("");
  const [isGeneratingOffer, setIsGeneratingOffer] = useState(false);

  // Join state
  const [joinTicketInput, setJoinTicketInput] = useState<string>("");
  const [answerTicket, setAnswerTicket] = useState<string>("");
  const [answerQrUrl, setAnswerQrUrl] = useState<string>("");
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);

  // UI state
  const [copied, setCopied] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Listen to live sync status changes
  useEffect(() => {
    const unsub = syncEngine.onStatusChange((nextStatus, nextPeer) => {
      setStatus(nextStatus);
      if (nextPeer) setPeer(nextPeer);
      if (nextStatus === "connected") {
        setErrorMsg(null);
        triggerHaptic("success");
      }
    });
    return unsub;
  }, []);

  // Generate QR code utility
  const generateQr = async (text: string): Promise<string> => {
    try {
      return await QRCode.toDataURL(text, {
        width: 256,
        margin: 1.5,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
    } catch (err) {
      console.error("Failed to generate QR code:", err);
      return "";
    }
  };

  // Host: Generate Offer Ticket
  const handleCreateOffer = async () => {
    try {
      setErrorMsg(null);
      setIsGeneratingOffer(true);
      const ticket = await syncEngine.createSession(deviceName.trim() || "LifeLog Device");
      setOfferTicket(ticket);
      const qr = await generateQr(ticket);
      setOfferQrUrl(qr);
      triggerHaptic("medium");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to generate session ticket.");
      triggerHaptic("warning");
    } finally {
      setIsGeneratingOffer(false);
    }
  };

  // Host: Accept peer's answer ticket
  const handleAcceptAnswer = async () => {
    if (!answerInput.trim()) return;
    try {
      setErrorMsg(null);
      await syncEngine.acceptAnswer(answerInput.trim());
      triggerHaptic("success");
      toast("Connecting to peer...", "ok");
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to accept answer ticket. Please check the code.");
      triggerHaptic("warning");
    }
  };

  // Join: Join session and generate answer ticket
  const handleJoinSession = async () => {
    if (!joinTicketInput.trim()) return;
    try {
      setErrorMsg(null);
      setIsGeneratingAnswer(true);
      const answer = await syncEngine.joinSession(
        joinTicketInput.trim(),
        deviceName.trim() || "LifeLog Device"
      );
      setAnswerTicket(answer);
      const qr = await generateQr(answer);
      setAnswerQrUrl(qr);
      triggerHaptic("success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Invalid pairing code. Please make sure you copied the full ticket.");
      triggerHaptic("warning");
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  // Manual Full State Broadcast
  const handleSyncFullState = async () => {
    try {
      triggerHaptic("medium");
      await syncEngine.broadcastFullState(state);
      toast("All data synchronized with peer!", "ok");
    } catch (err) {
      toast("Failed to synchronize state.", "err");
    }
  };

  // Disconnect
  const handleDisconnect = () => {
    syncEngine.disconnect();
    setOfferTicket("");
    setOfferQrUrl("");
    setAnswerTicket("");
    setAnswerQrUrl("");
    setAnswerInput("");
    setJoinTicketInput("");
    setErrorMsg(null);
    triggerHaptic("light");
    toast("Disconnected from sync peer.", "ok");
  };

  // Clipboard helper
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      triggerHaptic("light");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast("Could not copy to clipboard.", "err");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-emerald-500 animate-pulse" />
          <span>Device-to-Device Sync (P2P)</span>
        </div>
      }
      width={560}
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--mut)]">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>AES-256-GCM · Zero Cloud</span>
          </div>
          <Btn variant="soft" onClick={onClose}>
            Close
          </Btn>
        </div>
      }
    >
      <div className="space-y-4 text-[13px]">
        {/* Error notification */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Connected State View */}
        {status === "connected" && (
          <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Wifi size={20} />
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                </div>
                <div>
                  <div className="font-bold text-[14px] text-[var(--text)] flex items-center gap-2">
                    <span>{peer?.deviceName || "Connected Device"}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                      LIVE P2P
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[var(--mut)]">
                    Always Sync Active · Low Latency (&lt;50ms)
                  </div>
                </div>
              </div>

              <Btn variant="danger" size="sm" onClick={handleDisconnect}>
                <WifiOff size={13} /> Disconnect
              </Btn>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-[var(--line)]">
              <div className="p-2 rounded-xl bg-[var(--panel2)]">
                <span className="text-[var(--mut)] block text-[10.5px]">Transport</span>
                <span className="font-semibold text-[var(--text)]">WebRTC DataChannel</span>
              </div>
              <div className="p-2 rounded-xl bg-[var(--panel2)]">
                <span className="text-[var(--mut)] block text-[10.5px]">End-to-End Encryption</span>
                <span className="font-semibold text-emerald-400">AES-GCM-256</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Btn
                variant="primary"
                className="w-full justify-center"
                onClick={handleSyncFullState}
              >
                <RefreshCw size={14} /> Force Full Sync Now
              </Btn>
            </div>
          </div>
        )}

        {/* 2. Pairing Configuration View (when not connected) */}
        {status !== "connected" && (
          <div className="space-y-4">
            {/* Explainer card */}
            <div className="p-3 rounded-xl border border-[var(--line)] bg-[var(--panel2)] text-xs text-[var(--mut)] flex items-start gap-2.5">
              <Zap size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                Sync your LifeLog data directly between devices without sending any unencrypted
                data over the cloud. Pair via QR code or ticket code once, and devices will
                synchronize dynamically in real-time.
              </span>
            </div>

            {/* Device Name input */}
            <div>
              <label className="text-xs font-semibold text-[var(--mut)] block mb-1">
                Your Device Name
              </label>
              <TextInput
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. My Android Phone"
              />
            </div>

            {/* Role Seg Tabs */}
            <div className="flex justify-center">
              <Seg<"host" | "join">
                value={activeTab}
                onChange={(v) => {
                  setActiveTab(v);
                  setErrorMsg(null);
                }}
                options={[
                  { value: "host", label: "Host / Share (Device 1)" },
                  { value: "join", label: "Join / Connect (Device 2)" },
                ]}
              />
            </div>

            {/* TAB 1: Host / Share */}
            {activeTab === "host" && (
              <div className="space-y-4 pt-1">
                {!offerTicket ? (
                  <div className="text-center py-4 space-y-3">
                    <p className="text-xs text-[var(--mut)]">
                      Start a session on this device. LifeLog will generate a secure QR code for
                      Device 2 to scan.
                    </p>
                    <Btn
                      variant="primary"
                      onClick={handleCreateOffer}
                      disabled={isGeneratingOffer}
                      className="mx-auto"
                    >
                      {isGeneratingOffer ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" /> Generating Code...
                        </>
                      ) : (
                        <>
                          <Radio size={14} /> Generate Pairing Code
                        </>
                      )}
                    </Btn>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Step 1: Offer QR Code & Copy */}
                    <div className="p-3.5 rounded-2xl border border-[var(--line)] bg-[var(--panel2)] flex flex-col items-center text-center space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                        Step 1 · Scan or Copy Pairing Code
                      </span>
                      {offerQrUrl && (
                        <div className="p-2.5 rounded-xl bg-white shadow-md inline-block">
                          <img
                            src={offerQrUrl}
                            alt="Pairing QR Code"
                            className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                          />
                        </div>
                      )}
                      <p className="text-[11.5px] text-[var(--mut)] max-w-xs">
                        Scan with Device 2, or copy the pairing code below if on separate networks:
                      </p>
                      <Btn
                        variant="soft"
                        size="sm"
                        onClick={() => copyToClipboard(offerTicket, "offer")}
                      >
                        {copied === "offer" ? (
                          <>
                            <Check size={13} className="text-emerald-400" /> Copied Code!
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy Pairing Code
                          </>
                        )}
                      </Btn>
                    </div>

                    {/* Step 2: Answer Input */}
                    <div className="p-3.5 rounded-2xl border border-[var(--line)] bg-[var(--panel2)] space-y-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] block">
                        Step 2 · Paste Device 2's Answer Code
                      </span>
                      <p className="text-[11.5px] text-[var(--mut)]">
                        After Device 2 scans or enters the code, paste its response here to complete
                        the connection:
                      </p>
                      <div className="flex gap-2">
                        <TextInput
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          placeholder="Paste response code from Device 2..."
                          className="text-xs"
                        />
                        <Btn
                          variant="primary"
                          onClick={handleAcceptAnswer}
                          disabled={!answerInput.trim()}
                        >
                          Connect
                        </Btn>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Join / Connect */}
            {activeTab === "join" && (
              <div className="space-y-4 pt-1">
                {!answerTicket ? (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--mut)]">
                      Paste the pairing code provided by Device 1 (Host) to link this device:
                    </p>
                    <textarea
                      value={joinTicketInput}
                      onChange={(e) => setJoinTicketInput(e.target.value)}
                      placeholder="Paste Device 1 pairing code here..."
                      rows={3}
                      className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-2.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-none"
                    />
                    <Btn
                      variant="primary"
                      onClick={handleJoinSession}
                      disabled={!joinTicketInput.trim() || isGeneratingAnswer}
                      className="w-full justify-center"
                    >
                      {isGeneratingAnswer ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" /> Verifying Code...
                        </>
                      ) : (
                        <>
                          <ArrowRight size={14} /> Join &amp; Generate Answer
                        </>
                      )}
                    </Btn>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl border border-[var(--line)] bg-[var(--panel2)] flex flex-col items-center text-center space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Answer Generated!
                      </span>
                      {answerQrUrl && (
                        <div className="p-2.5 rounded-xl bg-white shadow-md inline-block">
                          <img
                            src={answerQrUrl}
                            alt="Answer QR Code"
                            className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                          />
                        </div>
                      )}
                      <p className="text-[11.5px] text-[var(--mut)] max-w-xs">
                        Copy this answer code and paste it back into Device 1 to finalize pairing:
                      </p>
                      <Btn
                        variant="soft"
                        size="sm"
                        onClick={() => copyToClipboard(answerTicket, "answer")}
                      >
                        {copied === "answer" ? (
                          <>
                            <Check size={13} className="text-emerald-400" /> Copied Answer Code!
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy Answer Code
                          </>
                        )}
                      </Btn>
                      <div className="flex items-center gap-2 pt-2 text-xs text-emerald-400 animate-pulse">
                        <Radio size={14} />
                        <span>Waiting for Device 1 to accept...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
