# Glossary map

## Contexts

- [Billing](docs/billing/GLOSSARY.md)
- [Ledger](docs/ledger/GLOSSARY.md)

## Relationships

- Billing publishes `InvoiceIssued`; Ledger books an Entry on receivables and on revenue.
- Billing publishes `PaymentReceived`; Ledger books an Entry on the bank Account.
- Billing publishes `CreditNoteIssued`; Ledger records it.
