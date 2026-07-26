# 07 — Validation: this is not a concept

Most hackathon projects have to go find users to validate against. MilFi is built *inside*
an operating business — the validation is the operating record.

## The operators are the builders

We run a private counter-UAV defense company in Ukraine. The coordination platform in
`platform/` is not a demo shell built for this hackathon — it is the tool we and our
partnered military units use in live operations to place interceptor assets, assign crews,
and orchestrate engagements (declared as the pre-hackathon base per the Start Fresh rule).

## Operational record

- **Hundreds of hostile drones intercepted** by our partnered units in operations
  coordinated through this platform. This is the engagement volume MilFi's settlement
  layer is built to pay out on — not a projected user base, our existing one.
- **Real hardware, real launches.** The submission video includes live footage from our
  operations in Ukraine: interceptor drones in the field, launches from armored vehicles.
  The imagery Agent A/B judge is the class of imagery our operations actually produce.
- **Both sides of the settlement flow are already our counterparties.** Protected
  facilities (energy and industrial sites) contract us for protection; partnered military
  units fly the intercepts. The payer and the payee of MilFi's flow are people we invoice
  and work alongside today.

## The market feedback loop is nightly

The classic hackathon validation question — "did outsiders use it and react?" — inverts
here: the builders are the market. We experience the pain MilFi solves first-hand every
settlement cycle: kills confirmed in months, payments in more months, evidence chains
living in inboxes. Every operational night with our partnered units is a feedback cycle on
what the settlement layer must do.

## The state has already validated demand

Ukraine's e-points economy (see [01 — Story](./01-story.md)) is the strongest possible
demand signal: the government already runs a kill-to-reward points system, units already
compete on it, and a marketplace measured in the tens of billions of hryvnias already
redeems those points for equipment. MilFi doesn't have to prove people want to be paid for
confirmed kills — the state proved that. MilFi fixes the part everyone in the pipeline
complains about: settlement speed and evidence trust.

## Next validation milestone

A pilot with **one partnered brigade** using the system internally — points, rewards, and
commendations on the same Hedera rails, no state approval required (see
[08 — Business model & roadmap](./08-business-model.md)). That converts operational
validation into product traction with a named early adopter.
