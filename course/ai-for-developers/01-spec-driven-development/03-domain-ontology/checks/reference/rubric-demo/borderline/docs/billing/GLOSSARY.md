# Billing


## Language

**Customer**: Организация, которой мы выставляем Invoice и которая должна его оплатить; хранится в справочнике контрагентов.
_Avoid_: client, account

**Invoice**: Документ на оплату с номером, строками и сроком оплаты, выставленный одному Customer.
_Avoid_: bill

**Payment**: Деньги, которые Customer перевёл по одному Invoice; Payment бывает частичным.
_Avoid_: settlement

**Credit Note**: Документ, который уменьшает сумму Invoice.
_Avoid_: refund

**Outstanding Balance**: Сколько Customer ещё должен по Invoice после всех Payment и Credit Note.
_Avoid_: debt

**Reminder**: Напоминание Customer об оплате просроченного Invoice; у него три уровня.
_Avoid_: dunning

**Dispute**: Несогласие Customer с Invoice.
_Avoid_: complaint
