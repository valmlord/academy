"""Quiz authoring rules (00 2.1, 41 2.1) and scorer checks for a quiz file and its reserve.
usage: /usr/bin/python3 quiz_audit.py <quiz.yaml> ...   (PyYAML only for reading the file in the demo)
"""
import collections, itertools, random, sys
import yaml

for path in sys.argv[1:]:
    qs = yaml.safe_load(open(path))["questions"]
    problems = []
    singles = [q for q in qs if q["type"] == "single"]
    multiples = [q for q in qs if q["type"] == "multiple"]
    if len(qs) != 6 or len(singles) != 4 or len(multiples) != 2:
        problems.append(f"shape {len(singles)} single + {len(multiples)} multiple of {len(qs)}")
    positions = collections.Counter()
    longest = 0
    for q in qs:
        ids = [o["id"] for o in q["options"]]
        if len(ids) != 4 or len(set(ids)) != 4 or not set(q["correct"]) <= set(ids):
            problems.append(f"{q['id']}: options or key")
        if q["type"] == "single" and len(q["correct"]) != 1 or q["type"] == "multiple" and len(q["correct"]) not in (2, 3):
            problems.append(f"{q['id']}: key size")
        if not q.get("explanation"):
            problems.append(f"{q['id']}: no explanation")
        if q["type"] == "single":
            positions[q["correct"][0]] += 1
        lengths = {o["id"]: len(o["text"]) for o in q["options"]}
        top = max(lengths.values())
        if [i for i, n in lengths.items() if n == top] == q["correct"]:
            longest += 1
    key = {q["id"]: set(q["correct"]) for q in qs}
    def score(answers):
        return sum(answers.get(q["id"], set()) == key[q["id"]] for q in qs) / len(qs)
    subsets = [set(c) for r in (2, 3) for c in itertools.combinations("abcd", r)]
    rng = random.Random(1)
    trials = 200_000
    hits = sum(score({q["id"]: ({rng.choice("abcd")} if q["type"] == "single" else rng.choice(subsets)) for q in qs}) >= 0.8 for _ in range(trials))
    always = {letter: score({q["id"]: {letter} for q in qs}) for letter in "abcd"}
    longest_answer = score({q["id"]: {max(q["options"], key=lambda o: len(o["text"]))["id"]} for q in qs})
    print(f"{path.split('course/')[-1]}: {'OK' if not problems else problems}; key 1.0 -> {score({q['id']: key[q['id']] for q in qs})}; "
          f"empty -> {score({})}; always-letter {always}; longest -> {longest_answer:.3f}; single key positions {dict(positions)}; "
          f"uniquely-longest correct {longest}/6; random pass {hits}/{trials} = {hits / trials:.5f} (analytic 0.0012109)")
