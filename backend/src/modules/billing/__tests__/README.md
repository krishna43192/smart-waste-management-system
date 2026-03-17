# Billing module tests

This folder contains comprehensive unit tests for the payment/billing flows:
- listBills
- createCheckoutSession
- syncCheckoutSession
- getReceipt
- basic model validations for Bill and PaymentTransaction
- route registration sanity checks

Mocks:
- Stripe SDK checkout session creation/retrieval
- Mongoose models (Bill, PaymentTransaction, SpecialCollectionRequest, User)
- Mailer service sendPaymentReceipt

How to run just the billing tests with coverage:

```
# from repo root or backend folder
npm --prefix ./backend run test:billing:coverage
```

This reports coverage for the billing controller, routes, models, and mailer utility. The controller exceeds 90% coverage across statements/branches/functions.