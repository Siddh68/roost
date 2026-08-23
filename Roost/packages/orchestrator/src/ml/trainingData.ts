// Bootstrap labeled dataset for the tone classifier. Labels describe the
// TONE of a landlord's reply, not the final negotiation intent — a
// deterministic combination step (see intentModel.ts) folds the extracted
// price and this tone together to produce the final accept/counter_offer/
// reject/needs_info/off_topic classification. Comparing a price and picking
// accept-vs-counter is a numeric fact, not something worth "learning"; the
// genuinely learnable part is reading the tone of the message.

export type ToneLabel = "agreement" | "decline" | "question" | "statement" | "off_topic";

export interface LabeledExample {
  text: string;
  label: ToneLabel;
}

export const TRAINING_DATA: LabeledExample[] = [
  // agreement
  { text: "That works for us, let's move forward.", label: "agreement" },
  { text: "Sounds good, we agree to that rate.", label: "agreement" },
  { text: "Great, we accept your offer. Happy to proceed.", label: "agreement" },
  { text: "Deal — let's confirm and get the paperwork started.", label: "agreement" },
  { text: "Yes, that price works, we're in.", label: "agreement" },
  { text: "Perfect, confirmed at that rate. Send over the next steps.", label: "agreement" },
  { text: "We're happy to go ahead at that number.", label: "agreement" },
  { text: "Agreed, let's finalize the lease.", label: "agreement" },
  { text: "That's acceptable to us, we can proceed.", label: "agreement" },
  { text: "Works for me, let's lock it in.", label: "agreement" },
  { text: "Okay, confirmed. Looking forward to having you as a tenant.", label: "agreement" },
  { text: "We accept, thank you for working with us on this.", label: "agreement" },

  // decline
  { text: "Unfortunately we can't accommodate that price.", label: "decline" },
  { text: "Sorry, this space is no longer available.", label: "decline" },
  { text: "We've decided to go with another tenant.", label: "decline" },
  { text: "That's not feasible for us, we'll have to pass.", label: "decline" },
  { text: "We won't be able to work with that budget.", label: "decline" },
  { text: "Not interested at that rate, sorry.", label: "decline" },
  { text: "I'm afraid that offer doesn't work for us at all.", label: "decline" },
  { text: "We're declining this proposal, thank you for your interest though.", label: "decline" },
  { text: "This isn't a fit for us, we'll pass on this opportunity.", label: "decline" },
  { text: "Regretfully we cannot proceed with this deal.", label: "decline" },
  { text: "We have to reject this offer, it's too far from our expectations.", label: "decline" },
  { text: "The space has already been leased to someone else.", label: "decline" },

  // question
  { text: "Could you tell us more about your company size?", label: "question" },
  { text: "What is your expected move-in date?", label: "question" },
  { text: "Can you clarify how many seats you actually need?", label: "question" },
  { text: "What are your requirements around parking?", label: "question" },
  { text: "Please let us know your budget range before we proceed.", label: "question" },
  { text: "Would you like to schedule a site visit first?", label: "question" },
  { text: "Are you looking for a furnished space or unfurnished?", label: "question" },
  { text: "How long a lease term are you considering?", label: "question" },
  { text: "Wondering if you need any additional amenities?", label: "question" },
  { text: "Can you share more details about your team?", label: "question" },
  { text: "What is the timeline you're working with?", label: "question" },
  { text: "Do you have any specific floor preference?", label: "question" },

  // statement (typically states a price/position, neutral tone)
  { text: "We can do ₹2,20,000 per month for this space.", label: "statement" },
  { text: "Our rate for this listing is ₹1,80,000 monthly.", label: "statement" },
  { text: "The best we can offer is ₹3,10,000 per month.", label: "statement" },
  { text: "We're asking ₹95,000 a month for the unit.", label: "statement" },
  { text: "Rent for this space is ₹2,45,000/month, negotiable slightly.", label: "statement" },
  { text: "We could bring it down to ₹2,00,000 monthly.", label: "statement" },
  { text: "₹1,50,000 per month is our current asking price.", label: "statement" },
  { text: "The lowest we can go is ₹2,75,000 a month.", label: "statement" },
  { text: "For that seat count we'd need ₹2,60,000 monthly.", label: "statement" },
  { text: "We can offer ₹1,95,000 per month given the terms.", label: "statement" },
  { text: "Our counter would be ₹2,30,000 a month.", label: "statement" },
  { text: "The space is priced at ₹3,00,000 per month currently.", label: "statement" },

  // off_topic
  { text: "Thanks for reaching out, I'm currently out of office and will respond next week.", label: "off_topic" },
  { text: "This is an automated response confirming receipt of your email.", label: "off_topic" },
  { text: "Please note our office will be closed for the holidays.", label: "off_topic" },
  { text: "Forwarding this to my colleague who handles leasing inquiries.", label: "off_topic" },
  { text: "Thank you for your email, we'll be in touch soon.", label: "off_topic" },
  { text: "Just checking in, no update from our side yet.", label: "off_topic" },
  { text: "This mailbox is no longer monitored, please contact our main office.", label: "off_topic" },
  { text: "Attaching some photos of the property for your reference.", label: "off_topic" },
  { text: "We received your message and will review it shortly.", label: "off_topic" },
  { text: "Note that this property listing has been updated recently.", label: "off_topic" },
  { text: "Our team will circle back on this by end of week.", label: "off_topic" },
  { text: "Thanks for your patience while we sort out some internal details.", label: "off_topic" },
];
