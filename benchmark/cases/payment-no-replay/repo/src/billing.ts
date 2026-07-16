export async function chargeCustomer(stripe: any, customerId: string, amountCents: number) {
  return stripe.charges.create({ customer: customerId, amount: amountCents });
}
