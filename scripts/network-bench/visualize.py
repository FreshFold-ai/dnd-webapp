"""Generate visualizations for the network bench results."""
import json, os
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).parent
RESULTS = ROOT / "results"
DATA = json.loads((RESULTS / "bench-results.json").read_text())

plt.rcParams.update({
    "figure.dpi": 130,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "axes.spines.top": False,
    "axes.spines.right": False,
})

# 1) HTTP probe: TTFB vs total ms + sizes
http = [r for r in DATA["http"] if r.get("status") == 200]
labels = [r["url"].replace(DATA["target"], "") or "/" for r in http]
ttfb = [r["ttfbMs"] for r in http]
total = [r["totalMs"] for r in http]
size_kb = [r["bytes"] / 1024 for r in http]

fig, ax1 = plt.subplots(figsize=(9, 4.5))
x = range(len(labels))
w = 0.35
ax1.bar([i - w/2 for i in x], ttfb,  w, label="TTFB (ms)",  color="#5B8DEF")
ax1.bar([i + w/2 for i in x], total, w, label="Total (ms)", color="#3F51B5")
ax1.set_xticks(list(x)); ax1.set_xticklabels(labels, rotation=20, ha="right")
ax1.set_ylabel("Latency (ms)")
ax2 = ax1.twinx(); ax2.grid(False)
ax2.plot(list(x), size_kb, "o-", color="#E55353", label="Size (KB)")
ax2.set_ylabel("Payload size (KB)")
ax1.set_title(f"HTTP asset load — {DATA['target']}")
lines1, l1 = ax1.get_legend_handles_labels()
lines2, l2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, l1 + l2, loc="upper left")
plt.tight_layout(); plt.savefig(RESULTS / "01_http_assets.png"); plt.close()

# 2) Phase timings (signaling lifecycle)
phases = DATA["scenario"]["phaseTimings"]
labels = [p["label"] for p in phases]
vals   = [p["ms"] for p in phases]
colors = ["#3F51B5"] * 3 + ["#27AE60"] * 3
fig, ax = plt.subplots(figsize=(9, 4))
bars = ax.barh(labels, vals, color=colors)
for b, v in zip(bars, vals):
    ax.text(v + 5, b.get_y() + b.get_height()/2, f"{v:.1f} ms", va="center", fontsize=9)
ax.set_xlabel("ms"); ax.invert_yaxis()
ax.set_title("Signaling lifecycle phase timings (1 DM + 2 Players)")
plt.tight_layout(); plt.savefig(RESULTS / "02_phase_timings.png"); plt.close()

# 3) Per-pair WebRTC signaling RTT distribution
rtts = DATA["scenario"]["signalingRtts"]
pairs = sorted({r["pair"] for r in rtts})
data_by_pair = {p: [] for p in pairs}
for r in rtts:
    data_by_pair[r["pair"]] += [r["offer"], r["answer"], r["ice_a_to_b"], r["ice_b_to_a"]]

fig, ax = plt.subplots(figsize=(8, 4.5))
bp = ax.boxplot([data_by_pair[p] for p in pairs], labels=pairs, patch_artist=True, widths=0.55)
for patch, c in zip(bp["boxes"], ["#3F51B5", "#27AE60", "#E67E22"]):
    patch.set_facecolor(c); patch.set_alpha(0.55)
ax.set_ylabel("RTT (ms)")
ax.set_title("Server-relayed signaling RTT per peer pair (offer / answer / ICE × 5)")
plt.tight_layout(); plt.savefig(RESULTS / "03_signaling_rtt.png"); plt.close()

# 4) RTT timeseries by message kind
import collections
series = collections.defaultdict(list)
for r in rtts:
    series["offer"].append(r["offer"])
    series["answer"].append(r["answer"])
    series["ice_a_to_b"].append(r["ice_a_to_b"])
    series["ice_b_to_a"].append(r["ice_b_to_a"])
fig, ax = plt.subplots(figsize=(9, 4.2))
for k, vs in series.items():
    ax.plot(range(1, len(vs) + 1), vs, "o-", label=k, alpha=0.85)
ax.set_xlabel("Sample # (across pairs)"); ax.set_ylabel("RTT (ms)")
ax.set_title("Signaling RTT timeseries by message type")
ax.legend()
plt.tight_layout(); plt.savefig(RESULTS / "04_rtt_timeseries.png"); plt.close()

# 5) Per-peer packet & byte counts
peers = DATA["scenario"]["perPeer"]
names = list(peers.keys())
sent  = [peers[n]["packetsSent"] for n in names]
recv  = [peers[n]["packetsRecv"] for n in names]
bs    = [peers[n]["bytesSent"]   for n in names]
br    = [peers[n]["bytesRecv"]   for n in names]

fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
x = range(len(names)); w = 0.35
axes[0].bar([i - w/2 for i in x], sent, w, label="sent", color="#3F51B5")
axes[0].bar([i + w/2 for i in x], recv, w, label="recv", color="#27AE60")
axes[0].set_xticks(list(x)); axes[0].set_xticklabels(names)
axes[0].set_title("Socket.IO packets per peer"); axes[0].set_ylabel("packets")
axes[0].legend()

axes[1].bar([i - w/2 for i in x], bs, w, label="sent", color="#3F51B5")
axes[1].bar([i + w/2 for i in x], br, w, label="recv", color="#27AE60")
axes[1].set_xticks(list(x)); axes[1].set_xticklabels(names)
axes[1].set_title("Socket.IO bytes per peer"); axes[1].set_ylabel("bytes")
axes[1].legend()
plt.tight_layout(); plt.savefig(RESULTS / "05_per_peer_traffic.png"); plt.close()

# 6) Event-mix stacked bar (DM vs P1 vs P2, sent + recv)
all_events = set()
for p in peers.values():
    all_events.update(p["eventsSent"].keys())
    all_events.update(p["eventsRecv"].keys())
all_events = sorted(all_events)
fig, ax = plt.subplots(figsize=(11, 5))
import numpy as np
xs = np.arange(len(names) * 2)
labels_x = []
bottom = np.zeros(len(xs))
cmap = plt.colormaps.get_cmap("tab20")
for i, name in enumerate(names):
    labels_x.append(f"{name}\nsent")
    labels_x.append(f"{name}\nrecv")
for ei, ev in enumerate(all_events):
    vals = []
    for name in names:
        vals.append(peers[name]["eventsSent"].get(ev, 0))
        vals.append(peers[name]["eventsRecv"].get(ev, 0))
    ax.bar(xs, vals, bottom=bottom, label=ev, color=cmap(ei % 20))
    bottom += np.array(vals)
ax.set_xticks(xs); ax.set_xticklabels(labels_x)
ax.set_ylabel("packet count"); ax.set_title("Socket.IO event mix per peer")
ax.legend(bbox_to_anchor=(1.02, 1), loc="upper left", fontsize=8)
plt.tight_layout(); plt.savefig(RESULTS / "06_event_mix.png"); plt.close()

# Summary text
rtt = DATA["rttSummary"]
total_packets = sum(p["packetsSent"] + p["packetsRecv"] for p in peers.values())
total_bytes   = sum(p["bytesSent"]   + p["bytesRecv"]   for p in peers.values())
summary = f"""Network Benchmark — {DATA['target']}
Run at: {DATA['timestamp']}

HTTP cold-load (initial page + critical assets):
  - Total payload: {sum(size_kb):.1f} KB across {len(http)} requests
  - Slowest TTFB: {max(ttfb):.0f} ms

Signaling lifecycle (1 DM + 2 Players):
  - WebSocket connect (mean): {sum(p['ms'] for p in phases[:3])/3:.1f} ms
  - room:start  -> room:joined: {phases[3]['ms']:.1f} ms
  - room:join   -> room:joined: {(phases[4]['ms']+phases[5]['ms'])/2:.1f} ms (mean of 2 players)

WebRTC signaling RTT (server relay, 60 samples across 3 pairs):
  - min/mean/p50/p95/max: {rtt['min']:.1f} / {rtt['mean']:.1f} / {rtt['p50']:.1f} / {rtt['p95']:.1f} / {rtt['max']:.1f} ms

Aggregate Socket.IO traffic across all 3 peers:
  - Total packets: {total_packets}
  - Total bytes:   {total_bytes} ({total_bytes/1024:.1f} KB)
"""
(RESULTS / "summary.txt").write_text(summary)
print(summary)
print("Charts written to:", RESULTS)
