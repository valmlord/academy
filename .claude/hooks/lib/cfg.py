#!/usr/bin/env python3
"""Query helper for .claude/pipeline.json so bash hooks never hardcode tiers/phases/judges.

Usage: cfg.py <command> [args]
  tiers                         space-separated tier names
  phases <TIER>                 space-separated phases
  judges <TIER>                 space-separated judge keys
  judge_phases <TIER>           judge phases (phase names starting with judge_)
  all_judges                    "key=file" pairs for every judge
  gate <agent_file>             "<first> <last>" phase window for an agent file, or empty
  tier_flag <TIER> <flag>       prints 1 if flag is true for tier, else 0
  get <key>                     top-level scalar or list (lists space-separated)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.normpath(os.path.join(HERE, "..", "..", "pipeline.json"))


def load():
    with open(CFG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def main(argv):
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    cfg = load()
    cmd, args = argv[1], argv[2:]
    tiers = cfg["tiers"]
    if cmd == "tiers":
        print(" ".join(tiers.keys()))
    elif cmd == "phases":
        print(" ".join(tiers.get(args[0], {}).get("phases", [])))
    elif cmd == "judges":
        print(" ".join(tiers.get(args[0], {}).get("judges", [])))
    elif cmd == "judge_phases":
        print(" ".join(p for p in tiers.get(args[0], {}).get("phases", []) if p.startswith("judge_")))
    elif cmd == "all_judges":
        print(" ".join("%s=%s" % (k, v) for k, v in cfg["judge_agents"].items()))
    elif cmd == "gate":
        w = cfg["agent_gates"].get(args[0], "")
        print(" ".join(w) if isinstance(w, list) else w)
    elif cmd == "gated_agents":
        print(" ".join(k for k in cfg["agent_gates"] if not k.startswith("_")))
    elif cmd == "tier_flag":
        print("1" if tiers.get(args[0], {}).get(args[1]) else "0")
    elif cmd == "get":
        val = cfg.get(args[0], "")
        print(" ".join(map(str, val)) if isinstance(val, list) else val)
    else:
        print("unknown command: %s" % cmd, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
