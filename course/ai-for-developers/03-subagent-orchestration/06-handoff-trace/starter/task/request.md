# FIN-12: invoice totals are a cent off

Accounting reports that invoice totals drift by one cent from their figures. `tax_cents` in
`src/invoices/totals.py` rounds the tax of every line and adds the results, and `round_cents` rounds
halves to the even cent. Finance policy FIN-12: compute the tax on the invoice's net amount, round it
once, and round halves up (away from zero).

`tests/test_totals.py` already holds the case from the accountant's report; it fails today.
