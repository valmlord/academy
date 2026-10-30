"""Mutant rules of design 2.6: a witness inside D per mutant, no two mutants alike, and the reference over a
differential sampler raises only the requirement-fixed exceptions.

usage: mutant_audit.py l1 <late_fee data dir> | mutant_audit.py reminders <reminders data dir> <project src>
"""

import itertools
import random
import secrets
import sys
import types
from datetime import date, timedelta
from pathlib import Path


def load(path: Path, name: str) -> types.ModuleType:
    module = types.ModuleType(name)
    exec(compile(path.read_text(), str(path), "exec"), module.__dict__)
    return module


def outcome(function, *args):  # noqa: ANN001, ANN002, ANN201
    try:
        return ("ok", function(*args))
    except Exception as error:  # noqa: BLE001  # the audit records every outcome, including bugs
        return (type(error).__name__, str(error))


def audit(variants: dict, inputs: list, extra_witness: dict | None = None) -> None:
    ref = variants["reference"]
    base = [outcome(ref, *a) for a in inputs]
    signature = {}
    for name, fn in variants.items():
        if name == "reference":
            continue
        diff = [a for a, expected in zip(inputs, base) if outcome(fn, *a) != expected]
        witness = diff[0] if diff else None
        print(f"  {name:32} witness {'none' if witness is None else repr(witness)[:110]}")
        signature[name] = tuple(outcome(fn, *a) for a in inputs)
    same = [(a, b) for a, b in itertools.combinations(signature, 2) if signature[a] == signature[b]]
    print(f"  behaviourally identical mutant pairs on the sample: {same or 'none'}")


def l1(data: Path) -> None:
    variants = {"reference": load(data / "reference.py", "ref").late_fee}
    variants.update({p.stem: load(p, p.stem).late_fee for p in sorted((data / "mutants").glob("*.py"))})
    rng = random.SystemRandom()
    limit = 10**9
    special = [-limit, -1, 0, 1, 4, 5, 6, 7, 104, 105, 1_000, 1_100, 1_500, 10_000, 10_005, limit]
    inputs = [(a, d) for a in special for d in special]
    inputs += [(rng.randint(-limit, limit), rng.randint(-limit, limit)) for _ in range(100_000)]
    inputs += [(rng.randint(1, 20_000), rng.randint(-10, 400)) for _ in range(20_000)]
    ref = variants["reference"]
    kinds = {}
    for a in inputs:
        kind = outcome(ref, *a)
        key = kind[0] if kind[0] == "ok" else kind
        kinds[key] = kinds.get(key, 0) + 1
    print(f"L1 reference over {len(inputs)} calls (uniform over D, extremes, boundaries): outcomes {kinds}")
    audit(variants, inputs[:2000] + inputs[-5000:])


def reminders(data: Path, src: Path) -> None:
    sys.path.insert(0, str(src))
    from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus, ReminderLevel, SentReminder

    variants = {"reference": load(data / "reference.py", "ref").plan_reminders}
    variants.update({p.stem: load(p, p.stem).plan_reminders for p in sorted((data / "mutants").glob("*.py"))})
    rng = random.Random(secrets.randbits(32))
    today = date(2040, 6, 1)

    def case() -> tuple:
        invoices, sent = [], []
        for n in range(rng.randint(0, 6)):
            invoice_id = rng.choice([rng.randint(0, 10**9), rng.randint(0, 5)])
            due = today - timedelta(days=rng.choice([rng.randint(-30, 80), 7, 6, 21, 35]))
            lines = [InvoiceLine("x", rng.choice([0, 200, 300, 499, 500, 501, 10_000, 10**9])) for _ in range(rng.randint(0, 3))]
            invoices.append(Invoice(invoice_id, rng.choice(["Acme", "Beta", "Zeta"]), "EUR", rng.choice(list(InvoiceStatus)),
                                    rng.choice(list(DisputeState)), due - timedelta(days=10), due, lines,
                                    rng.choice([0, 0, 100, 300, 1_000, 10**9])))
            for _ in range(rng.randint(0, 3)):
                sent.append(SentReminder(invoice_id, rng.choice(list(ReminderLevel)), today - timedelta(days=rng.choice([rng.randint(-3, 40), 13, 14, 7]))))
        return invoices, sent, today

    inputs = [case() for _ in range(20_000)]
    kinds = {}
    for a in inputs:
        key = outcome(variants["reference"], *a)[0]
        kinds[key] = kinds.get(key, 0) + 1
    print(f"reminders reference over {len(inputs)} structured calls: outcomes {kinds}")
    audit(variants, inputs)


if __name__ == "__main__":
    if sys.argv[1] == "l1":
        l1(Path(sys.argv[2]))
    else:
        reminders(Path(sys.argv[2]), Path(sys.argv[3]))
