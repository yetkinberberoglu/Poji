/**
 * Who Poji is, legally.
 *
 * One place, because these details have to agree everywhere they appear:
 * the website footer, the Terms, the Privacy Notice, invoices, and the
 * documents Meta and Stripe are handed during verification. A VAT number
 * that reads one way in the footer and another in the Terms is the kind of
 * mismatch that gets a verification refused, and it is the kind of thing
 * nobody notices until it does.
 *
 * Malta and the EU both require a trader selling services online to name
 * themselves, say where they are, and give a working way to reach them.
 * This is not decoration — it is the disclosure.
 *
 * If any of this changes, it changes here and nowhere else.
 */
export const LEGAL = {
  /** Trading name people know us by. */
  brand: 'Poji',

  /** The name on the VAT registration. Self-employed, so it is a person. */
  legalName: 'Yetkin Berberoglu',

  /** As registered. Kept on one line for the footer, split for the Terms. */
  addressLines: [
    'Howard Milner Residence, Flat 2',
    'Triq Guze Howard',
    'Sliema',
    'Malta',
  ],

  /** Malta VAT number, in the form it appears on the certificate. */
  vat: 'MT28441815',

  /** A mailbox a person actually reads. A role address rather than a
      personal one, so it survives the business changing shape and so
      the same address appears in the footer, the Terms and the app's
      own Contact line. */
  email: 'supportpoji@gmail.com',

  /** Where the service lives. */
  site: 'po-ji.com',
} as const;

/** The address as a single line, for a footer or an invoice header. */
export const legalAddress = LEGAL.addressLines.join(', ');

/**
 * The one-line disclosure: who is behind the site and under what number.
 * Used wherever there is room for a sentence but not a block.
 */
export const legalOneLine =
  `${LEGAL.brand} is operated by ${LEGAL.legalName}, ` +
  `${legalAddress}. VAT ${LEGAL.vat}.`;
