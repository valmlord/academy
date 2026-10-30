# Billing

Выставление счетов покупателям, приём оплат и напоминания об оплате.

## Language

**Customer**: Организация, которой компания выставляет Invoice и которая обязана его оплатить.
_Avoid_: account

**Invoice**: Документ на оплату с номером, строками, валютой и сроком оплаты, выставленный одному Customer.
_Avoid_: bill

**Payment**: Деньги, которые Customer перевёл в счёт одного Invoice; Payment может быть частичным.
_Avoid_: settlement

**Credit Note**: Документ, который уменьшает сумму к оплате по выставленному Invoice и не возвращает деньги.
_Avoid_: refund

**Outstanding Balance**: Сумма Invoice за вычетом всех Payment и Credit Note по нему, то есть сколько Customer ещё должен.
_Avoid_: debt

**Reminder**: Напоминание Customer об оплате просроченного Invoice; у Reminder три уровня.
_Avoid_: dunning

**Dispute**: Официальное несогласие Customer с Invoice; пока Dispute открыт, оплату не требуют.
_Avoid_: complaint
