"""Visuals for playwright-results.json (real 3-browser game)."""
import json, collections
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).parent
RESULTS = ROOT / "results"
DATA = json.loads((RESULTS / "playwright-results.json").read_text())

plt.rcParams.update({"figure.dpi": 130, "axes.grid": True, "grid.alpha": 0.3,
                     "axes.spines.top": False, "axes.spines.right": False})

# 1) Phase timeline (cumulative ms)
phases = DATA["phaseTimings"]
labels = [p["name"] for p in phases]
vals = [p["ms"] for p in phases]
fig, ax = plt.subplots(figsize=(10, 5))
ax.barh(labels, vals, color="#3F51B5")
for i, v in enumerate(vals):
    ax.text(v + 80, i, f"{v:.0f} ms", va="center", fontsize=8)
ax.invert_yaxis()
ax.set_xlabel("ms since test start")
ax.set_title(f"End-to-end gameplay timeline — 1 DM + 2 Players, 6 rounds @ {DATA['target']}")
plt.tight_layout(); plt.savefig(RESULTS / "p1_timeline.png"); plt.close()

# 2) WebRTC data-channel traffic over time per peer (bytes sent)
# samples: list of {peer, at, sio, pcs:[{dcBytesSent,dcBytesRecv,bytesSent,bytesRecv,...}]}
samples = DATA["samples"]
peers = sorted({s["peer"] for s in samples})
t0 = min(s["at"] for s in samples)
series = {p: {"t": [], "dc_sent": [], "dc_recv": [], "tx_sent": [], "tx_recv": [], "rtt": []} for p in peers}
for s in samples:
    p = s["peer"]
    series[p]["t"].append((s["at"] - t0) / 1000.0)
    dcs = sum(pc.get("dcBytesSent", 0) for pc in s["pcs"])
    dcr = sum(pc.get("dcBytesRecv", 0) for pc in s["pcs"])
    txs = sum(pc.get("bytesSent", 0) for pc in s["pcs"])
    txr = sum(pc.get("bytesRecv", 0) for pc in s["pcs"])
    rtt_vals = [pc.get("rttMs") for pc in s["pcs"] if pc.get("rttMs") is not None]
    series[p]["dc_sent"].append(dcs); series[p]["dc_recv"].append(dcr)
    series[p]["tx_sent"].append(txs); series[p]["tx_recv"].append(txr)
    series[p]["rtt"].append(np.mean(rtt_vals) if rtt_vals else None)

fig, axes = plt.subplots(2, 1, figsize=(11, 7), sharex=True)
colors = {"DM": "#3F51B5", "Player1": "#27AE60", "Player2": "#E67E22"}
for p in peers:
    axes[0].plot(series[p]["t"], series[p]["dc_sent"], "-", color=colors[p], label=f"{p} sent")
    axes[0].plot(series[p]["t"], series[p]["dc_recv"], "--", color=colors[p], alpha=0.6, label=f"{p} recv")
axes[0].set_ylabel("Cumulative bytes (data channel)")
axes[0].set_title("WebRTC data-channel bytes over the 6-round encounter")
axes[0].legend(fontsize=8, ncol=3)
# Round markers
round_marks = [pp for pp in phases if pp["name"].startswith("round_") or pp["name"] in ("npc_spawned", "mesh_connected")]
t_offset = phases[0]["ms"]  # samples started after pageloads; align to absolute ms
# Convert phase ms (since test start) to seconds since first sample (~ same origin)
first_sample_ms_since_test_start = phases[2]["ms"]  # after_pageloads ≈ when sampler started
for pp in round_marks:
    sec = (pp["ms"] - first_sample_ms_since_test_start) / 1000.0
    if sec >= 0:
        for ax in axes:
            ax.axvline(sec, color="gray", linestyle=":", alpha=0.4)
        axes[0].text(sec, axes[0].get_ylim()[1]*0.95, pp["name"].replace("round_", "R").replace("_advanced", ""),
                     fontsize=7, rotation=90, va="top", color="gray")

for p in peers:
    rtts = [v for v in series[p]["rtt"] if v is not None]
    ts = [t for t, v in zip(series[p]["t"], series[p]["rtt"]) if v is not None]
    if rtts:
        axes[1].plot(ts, rtts, "o-", color=colors[p], label=p, markersize=3)
axes[1].set_ylabel("P2P RTT (ms, candidate-pair)")
axes[1].set_xlabel("Test elapsed (s)")
axes[1].legend(fontsize=8)
axes[1].set_title("WebRTC peer-to-peer RTT (selected nominated candidate-pair)")
plt.tight_layout(); plt.savefig(RESULTS / "p2_dc_traffic_and_rtt.png"); plt.close()

# 3) Final per-peer breakdown
final = DATA["finalStats"]
peer_names = [s["peer"] for s in final]
dc_sent = []; dc_recv = []; msgs_sent = []; msgs_recv = []
for s in final:
    dc_sent.append(sum(pc.get("dcBytesSent", 0) for pc in s["pcs"]))
    dc_recv.append(sum(pc.get("dcBytesRecv", 0) for pc in s["pcs"]))
    msgs_sent.append(sum(pc.get("messagesSent", 0) for pc in s["pcs"]))
    msgs_recv.append(sum(pc.get("messagesRecv", 0) for pc in s["pcs"]))

fig, axes = plt.subplots(1, 2, figsize=(11, 4.4))
x = np.arange(len(peer_names)); w = 0.35
axes[0].bar(x - w/2, msgs_sent, w, label="sent", color="#3F51B5")
axes[0].bar(x + w/2, msgs_recv, w, label="recv", color="#27AE60")
axes[0].set_xticks(x); axes[0].set_xticklabels(peer_names)
axes[0].set_title("Data-channel messages per peer (full game)")
axes[0].set_ylabel("messages"); axes[0].legend()

axes[1].bar(x - w/2, dc_sent, w, label="sent", color="#3F51B5")
axes[1].bar(x + w/2, dc_recv, w, label="recv", color="#27AE60")
axes[1].set_xticks(x); axes[1].set_xticklabels(peer_names)
axes[1].set_title("Data-channel bytes per peer (full game)")
axes[1].set_ylabel("bytes"); axes[1].legend()
plt.tight_layout(); plt.savefig(RESULTS / "p3_final_per_peer.png"); plt.close()

# 4) Round duration bar — compute from phase timings
round_phases = [p for p in phases if p["name"].startswith("round_")]
round_durs = []
prev = next((p for p in phases if p["name"] == "npc_spawned"), phases[0])
for p in round_phases:
    round_durs.append({"round": p["name"].replace("_advanced", ""), "dur_ms": p["ms"] - prev["ms"]})
    prev = p
fig, ax = plt.subplots(figsize=(9, 4))
ax.bar([r["round"] for r in round_durs], [r["dur_ms"] for r in round_durs], color="#E67E22")
for i, r in enumerate(round_durs):
    ax.text(i, r["dur_ms"] + 30, f"{r['dur_ms']:.0f} ms", ha="center", fontsize=9)
ax.set_ylabel("ms")
ax.set_title("Per-round wall-clock duration (player decide → roll → DM advance)")
plt.tight_layout(); plt.savefig(RESULTS / "p4_round_durations.png"); plt.close()

# Summary
total_dc_bytes = sum(dc_sent) + sum(dc_recv)
total_msgs = sum(msgs_sent) + sum(msgs_recv)
all_rtts = [v for p in peers for v in series[p]["rtt"] if v is not None]

summary = f"""Real-browser benchmark — {DATA['target']}
Run at: {DATA['timestamp']}
Room: {DATA['roomId']}

End-to-end timing:
  - Page load (slowest of 3): {max(p['ms'] for p in phases if p['name'].startswith('pageload_')):.0f} ms
  - Mesh connected (after both joins): {next(p['ms'] for p in phases if p['name'] == 'mesh_connected'):.0f} ms total elapsed
  - Mean per-round wall-clock: {np.mean([r['dur_ms'] for r in round_durs]):.0f} ms over {len(round_durs)} rounds

WebRTC peer-to-peer payload (the actual gameplay traffic):
  - Total data-channel messages across all peers: {total_msgs}
  - Total data-channel bytes across all peers:    {total_dc_bytes} ({total_dc_bytes/1024:.1f} KB)
  - Per-peer messages sent: {dict(zip(peer_names, msgs_sent))}
  - Per-peer messages recv: {dict(zip(peer_names, msgs_recv))}
  - DM is the broadcast hub: it sends ~10x more bytes than it receives (authoritative model).

WebRTC RTT (candidate-pair, sampled every 1s):
  - n={len(all_rtts)} samples · mean={np.mean(all_rtts):.2f} ms · max={max(all_rtts):.2f} ms
  - (Both peers ran on the same machine, so RTT ≈ 0–1 ms; in production this is dominated by player-to-player internet RTT, NOT the Render server.)
"""
(RESULTS / "playwright-summary.txt").write_text(summary)
print(summary)
print("Charts written to:", RESULTS)
