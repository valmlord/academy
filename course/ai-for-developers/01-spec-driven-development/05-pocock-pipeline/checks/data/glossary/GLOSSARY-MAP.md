# Glossary map

## Contexts

- [Billing](docs/billing/GLOSSARY.md): invoices, payments and reminders to customers.
- [Ledger](docs/ledger/GLOSSARY.md): the accounting books of the company.

## Relationships

- Billing publishes `InvoiceIssued`; Ledger books an Entry on receivables and on revenue.
- Billing publishes `PaymentReceived`; Ledger books an Entry on the bank Account.
- Billing publishes `CreditNoteIssued`; Ledger books an Entry that reduces revenue.
