"""Rebuild the mutants of payment reminders from the reference (L5) or a reference with the dispute rule (L7).

usage: python3 make_mutants.py <reminders data dir> [--dispute]
Every mutant is the reference with exactly one edit; mutants.json maps it to its requirement.
"""

import json
import sys
from pathlib import Path

EDITS = {
    "m01_first_after_ten_days": ("REQ-01", "первое напоминание через 10 дней вместо 7",
        "FIRST_AFTER_DUE_DAYS = 7 ", "FIRST_AFTER_DUE_DAYS = 10 "),
    "m01_first_boundary": ("REQ-01", "граница: на 7-й день после срока первое напоминание ещё не планируется",
        "        if (today - invoice.due_on).days >= FIRST_AFTER_DUE_DAYS:\n",
        "        if (today - invoice.due_on).days > FIRST_AFTER_DUE_DAYS:\n"),
    "m02_second_from_due_date": ("REQ-02", "второе напоминание отсчитывается от срока оплаты, а не от первого напоминания",
        "    last_sent_on = max(sent.sent_on for sent in history if sent.level is highest)\n",
        "    last_sent_on = invoice.due_on if highest is ReminderLevel.FIRST else max(sent.sent_on for sent in history if sent.level is highest)\n"),
    "m02_second_boundary": ("REQ-02", "граница: ровно через 14 дней после первого второе ещё не планируется",
        "    if (today - last_sent_on).days >= ESCALATION_AFTER_DAYS:\n",
        "    if (today - last_sent_on).days >= ESCALATION_AFTER_DAYS + (highest is ReminderLevel.FIRST):\n"),
    "m03_final_after_seven_days": ("REQ-03", "последнее напоминание через 7 дней после второго вместо 14",
        "    if (today - last_sent_on).days >= ESCALATION_AFTER_DAYS:\n",
        "    if (today - last_sent_on).days >= (7 if highest is ReminderLevel.SECOND else ESCALATION_AFTER_DAYS):\n"),
    "m03_final_boundary": ("REQ-03", "граница: ровно через 14 дней после второго последнее ещё не планируется",
        "    if (today - last_sent_on).days >= ESCALATION_AFTER_DAYS:\n",
        "    if (today - last_sent_on).days >= ESCALATION_AFTER_DAYS + (highest is ReminderLevel.SECOND):\n"),
    "m04_final_repeated": ("REQ-04", "после последнего напоминания оно повторяется",
        "    if highest not in NEXT_LEVEL:\n        return None  # REQ-04: nothing after FINAL\n",
        "    if highest not in NEXT_LEVEL:\n        return ReminderLevel.FINAL\n"),
    "m05_any_positive_balance": ("REQ-05", "напоминание при любом положительном остатке, порог 500 не применяется",
        "        if balance < MIN_OUTSTANDING_CENTS:\n", "        if balance <= 0:\n"),
    "m05_threshold_boundary": ("REQ-05", "граница: остаток ровно 500 центов не напоминается",
        "        if balance < MIN_OUTSTANDING_CENTS:\n", "        if balance <= MIN_OUTSTANDING_CENTS:\n"),
    "m06_cancelled_reminded": ("REQ-06", "отменённый счёт тоже получает напоминание",
        "        if invoice.status is not InvoiceStatus.ISSUED:\n",
        "        if invoice.status in (InvoiceStatus.DRAFT, InvoiceStatus.PAID):\n"),
    "m07_balance_ignores_payments": ("REQ-07", "остаток в напоминании не учитывает частичную оплату",
        "            planned.append(Reminder(invoice.id, invoice.customer, level, balance, invoice.currency))\n",
        "            planned.append(Reminder(invoice.id, invoice.customer, level, balance + invoice.paid_cents, invoice.currency))\n"),
    "m08_order_by_invoice_only": ("REQ-08", "порядок только по номеру счёта, без группировки по покупателю",
        "    return sorted(planned, key=lambda reminder: (reminder.customer, reminder.invoice_id))\n",
        "    return sorted(planned, key=lambda reminder: reminder.invoice_id)\n"),
}
DISPUTE = {
    "m09_dispute_ignored": ("NEW", "открытый спор не останавливает напоминания",
        "        if invoice.dispute is DisputeState.OPEN:\n            continue\n", ""),
    "m09_resolved_dispute_blocks": ("NEW", "решённый спор тоже останавливает напоминания",
        "        if invoice.dispute is DisputeState.OPEN:\n", "        if invoice.dispute is not DisputeState.NONE:\n"),
}


def main() -> int:
    data = Path(sys.argv[1])
    reference = (data / "reference.py").read_text(encoding="utf-8")
    edits = {**EDITS, **(DISPUTE if "--dispute" in sys.argv else {})}
    meta = {}
    (data / "mutants").mkdir(exist_ok=True)
    for path in (data / "mutants").glob("*.py"):
        path.unlink()
    for mutant_id, (requirement, description, old, new) in edits.items():
        if reference.count(old) != 1:
            raise SystemExit(f"{mutant_id}: the edited text must occur once in the reference")
        source = reference.replace(old, new).replace('"""Payment reminders,', f'"""Mutant {mutant_id} of payment reminders,', 1)
        (data / "mutants" / f"{mutant_id}.py").write_text(source, encoding="utf-8")
        meta[mutant_id] = {"requirement": requirement, "description": description}
    (data / "mutants.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(meta)} mutants")
    return 0


if __name__ == "__main__":
    sys.exit(main())
