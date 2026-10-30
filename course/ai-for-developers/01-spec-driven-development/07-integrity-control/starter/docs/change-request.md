# Change request: no reminders on disputed invoices

From the billing team lead, fictional policy of the company for this course.

A Customer can open a Dispute against an invoice (the `dispute` field of `Invoice`, `DisputeState.OPEN`). While the
Dispute is open, the company does not ask for payment, so the daily plan must hold no reminder for
that invoice. Once the Dispute is resolved, reminders follow the usual rules again, from the same
history of sent reminders.

The rest of the reminder policy does not change.
