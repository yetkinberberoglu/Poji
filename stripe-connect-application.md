# Stripe Connect — application text

Copy the sections you need into Stripe's form. Each one is written to answer
what the reviewer is actually asking, which is: who holds the money, for how
long, and what happens when something goes wrong.

Keep it factual. Reviewers reject vague descriptions far more often than
they reject small platforms.

---

## Business description

> Poji is a home and vehicle services marketplace operating in Malta. Clients
> book verified independent providers — cleaners, electricians, plumbers, AC
> technicians, water filter specialists, mobile tyre fitters and others — for
> work at their home or at the roadside.
>
> I am registered as self-employed in Malta and hold a Maltese VAT number. I
> operate the platform. I do not perform any of the work myself, and I do not
> employ the providers; they are independent and set their own prices.

---

## How the money moves

> The client pays through Poji at the point the work is approved. Poji takes a
> 20% commission on the labour and 5% on any parts the provider supplies. The
> remainder goes to the provider.
>
> Nothing is captured until the work is finished and the client has confirmed
> it, or six hours have passed since the provider marked it complete. Before
> that point the client's card is only authorised.
>
> I am asking for Connect specifically so that Stripe holds and splits the
> funds rather than me receiving the full amount and paying providers myself.

---

## Why Connect and not standard payments

> Providers are independent businesses, not my staff. Holding their earnings
> in my own balance and transferring them on would make me a money
> transmitter, which I am not licensed to be in Malta. Connect keeps each
> provider's share in their own connected account from the moment it settles.

---

## Average transaction and volume

Fill in honestly. Low numbers are fine — made-up numbers are not.

> Typical booking: €45 to €180, with roadside callouts from €40 and larger
> jobs such as a house move or a rewire going up to about €800.
>
> Expected volume in the first three months: under 100 transactions a month
> while the platform builds a provider base in Malta.

---

## How providers are onboarded

> Every provider completes identity verification before they can accept work:
> government ID or passport, a selfie holding the document, proof of right to
> work in Malta, and a public profile photo. I review each application
> manually before approval.
>
> They will separately complete Stripe's own onboarding to create their
> connected account.

---

## Refunds, disputes and cancellations

> Cancellation is free before a provider accepts, and free up to 12 hours
> before the job. Inside 12 hours the provider may charge up to one hour at
> their rate.
>
> If a client is unhappy with completed work they raise a dispute in the app
> within the six-hour approval window. I review the evidence — the arrival
> PIN, the timestamps, the completed task checklist, the chat history and
> both accounts — and either refund the client in full or in part, or release
> payment to the provider.
>
> Refunds are issued through Stripe to the original card.

---

## VAT

> I act as a disclosed VAT agent. Poji collects 18% Maltese VAT on the full
> job value and issues the VAT invoice on the provider's behalf. I remit the
> VAT. My 20% commission is taken from the net value, before VAT.

---

## What safeguards are in place

> A job starts only when the client gives the provider a four-digit PIN at the
> door, which the server generates and checks. The clock runs from that moment.
> Hourly work is billed on the time actually worked, calculated server-side,
> not by the app.
>
> Parts added during a job must be approved by the client before they appear
> on the bill. In-app messages are scanned for attempts to take work off the
> platform, and there is a documented penalty schedule ending in removal.

---

## Country and entity

> Malta. Currently a sole trader (self-employed, VAT registered). I intend to
> incorporate as Pojico Ltd once volume justifies it, and will apply to
> transfer the account's ownership at that point.

Say this. Volunteering it reads as planning; having it discovered later reads
as something else.

---

## Website

> https://po-ji.com

Before you submit, make sure the live site shows: what Poji does, how pricing
works, the Terms of Service and the Privacy Notice, and a way to contact you.
Reviewers open the URL. An app that demands a login before showing anything is
a common reason for delay.

---

## If they come back asking for more

They usually want one of three things:

**Proof of self-employment and VAT registration.** Your Maltese VAT
certificate and your self-employment registration with Jobsplus.

**Evidence the service is real.** Screenshots of the booking flow, a sample
invoice, your provider agreement. The Terms of Service already on the site
covers most of this.

**Clarity on who bears risk.** Answer plainly: the provider carries their own
public liability insurance; Poji is the introducer and the payment rail, not
the contractor. That is already written into your terms.

---

## Two things worth knowing before you start

**Providers will verify twice.** They have already given you ID during Poji
onboarding; Stripe will ask again for its own records. Tell them up front —
being surprised by it is the sort of thing that loses a provider.

**Transferring ownership later is supported but not instant.** Stripe can move
an account from an individual to a company, and your history and customers
come with it. The review can pause payouts for a few days. Doing it at fifty
transactions costs you nothing; doing it at five hundred is a bad week.
