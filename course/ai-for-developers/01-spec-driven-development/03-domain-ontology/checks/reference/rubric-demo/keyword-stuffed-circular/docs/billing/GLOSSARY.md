# Billing


## Language

**Customer**: Customer - это Customer в контексте Billing: Invoice, Customer, Payment, Credit Note, Reminder и Dispute связаны с Customer через Outstanding Balance.
_Avoid_: client, account

**Invoice**: Invoice - это Invoice в контексте Billing: Invoice, Customer, Payment, Credit Note, Reminder и Dispute связаны с Invoice через Outstanding Balance.
_Avoid_: bill

**Payment**: Payment - это Payment в контексте Billing: Invoice, Customer, Payment, Credit Note, Reminder и Dispute связаны с Payment через Outstanding Balance.
_Avoid_: settlement

**Credit Note**: Credit Note - это Credit Note в контексте Billing: Invoice, Customer, Payment, Credit Note, Reminder и Dispute связаны с Credit Note через Outstanding Balance.
_Avoid_: refund

**Outstanding Balance**: Outstanding Balance - это Outstanding Balance в контексте Billing: Invoice, Customer, Payment, Credit Note, Reminder и Dispute связаны с Outstanding Balance через Outstanding Balance.
_Avoid_: debt

**Reminder**: Reminder - это Reminder в контексте Billing: Invoice, Customer, Payment, Credit Note, Reminder и Dispute связаны с Reminder через Outstanding Balance.
_Avoid_: dunning

**Dispute**: Dispute - это Dispute в контексте Billing: Invoice, Customer, Payment, Credit Note, Reminder и Dispute связаны с Dispute через Outstanding Balance.
_Avoid_: complaint

