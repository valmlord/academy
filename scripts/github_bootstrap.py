#!/usr/bin/env python3
"""Create labels, milestones and backlog issues on GitHub from .github/labels.yml and backlog/*.md.

Stdlib only. Uses the `gh` CLI (must be logged in and run inside the cloned repo).
Idempotent: existing labels/milestones/issues (matched by title) are left alone.

  python3 scripts/github_bootstrap.py --dry-run   # show what would happen
  python3 scripts/github_bootstrap.py             # do it
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def parse_value(raw):
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        return [x.strip().strip('"') for x in raw[1:-1].split(",") if x.strip()]
    if raw.startswith('"'):
        return json.loads(raw)
    return raw


def parse_issue(path):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        raise ValueError("%s: missing front matter" % path)
    meta = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = parse_value(v)
    for key in ("title", "labels", "milestone"):
        if key not in meta:
            raise ValueError("%s: missing %s" % (path, key))
    meta["body"] = m.group(2).strip() + "\n\n_Imported from `%s`._\n" % os.path.relpath(path, ROOT)
    return meta


def parse_labels(path):
    out = []
    for line in open(path, encoding="utf-8"):
        m = re.match(r'^- \{ name: "([^"]+)", color: "([0-9a-f]{6})", description: "([^"]*)" \}', line.strip())
        if m:
            out.append({"name": m.group(1), "color": m.group(2), "description": m.group(3)})
    return out


def gh(args, dry, capture=True):
    if dry and _mutating(args):
        print("  [dry-run] gh " + " ".join(args))
        return ""
    res = subprocess.run(["gh"] + args, capture_output=capture, text=True)
    if res.returncode != 0:
        raise RuntimeError("gh %s failed: %s" % (" ".join(args), res.stderr.strip()))
    return res.stdout


def _mutating(args):
    if args[0] == "api":
        return "-X" in args or "--method" in args or "-f" in args
    return args[:2] in (["issue", "create"], ["label", "create"], ["repo", "edit"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    dry = a.dry_run

    issues = [parse_issue(p) for p in sorted(glob.glob(os.path.join(ROOT, "backlog", "*.md")))]
    labels = parse_labels(os.path.join(ROOT, ".github", "labels.yml"))
    milestones = []
    for i in issues:
        if i["milestone"] not in milestones:
            milestones.append(i["milestone"])
    known = {l["name"] for l in labels}
    for i in issues:
        for l in i["labels"]:
            if l not in known:
                raise ValueError("issue '%s' uses unknown label %s" % (i["title"], l))
    print("Parsed %d labels, %d milestones, %d issues" % (len(labels), len(milestones), len(issues)))

    if dry and subprocess.run(["gh", "auth", "status"], capture_output=True).returncode != 0:
        print("gh is not logged in: showing the plan only.")
        for m in milestones:
            print("milestone:", m)
            for i in issues:
                if i["milestone"] == m:
                    print("   issue:", i["title"], i["labels"])
        return 0

    repo = json.loads(gh(["repo", "view", "--json", "nameWithOwner,owner"], False))
    login = json.loads(gh(["api", "user"], False))["login"]
    print("Repo:", repo["nameWithOwner"], "| you:", login)

    existing_labels = {l["name"] for l in json.loads(gh(["label", "list", "--limit", "200", "--json", "name"], False))}
    for l in labels:
        if l["name"] not in existing_labels:
            gh(["label", "create", l["name"], "--color", l["color"], "--description", l["description"]], dry)
            print("label +", l["name"])

    ms = json.loads(gh(["api", "repos/{owner}/{repo}/milestones?state=all&per_page=100"], False))
    existing_ms = {m["title"] for m in ms}
    for m in milestones:
        if m not in existing_ms:
            gh(["api", "-X", "POST", "repos/{owner}/{repo}/milestones", "-f", "title=" + m], dry)
            print("milestone +", m)

    existing_issues = {i["title"] for i in json.loads(gh(["issue", "list", "--state", "all", "--limit", "500", "--json", "title"], False))}
    for i in issues:
        if i["title"] in existing_issues:
            print("issue = (exists)", i["title"])
            continue
        args = ["issue", "create", "--title", i["title"], "--body", i["body"], "--milestone", i["milestone"]]
        for l in i["labels"]:
            args += ["--label", l]
        out = gh(args, dry)
        print("issue +", i["title"], out.strip())

    co = os.path.join(ROOT, ".github", "CODEOWNERS")
    text = open(co, encoding="utf-8").read()
    if "@OWNER" in text:
        if dry:
            print("  [dry-run] CODEOWNERS: @OWNER -> @" + login)
        else:
            open(co, "w", encoding="utf-8").write(text.replace("@OWNER", "@" + login))
            print("CODEOWNERS updated: commit it on a branch and open a PR.")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
