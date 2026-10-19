/* Sponsor thank-you posts. Shared by the app (Sponsors pop-up) and the GitHub Action in sponsors/,
   so this file has no dependencies and works both in a browser and in Node. */
(function (root) {
"use strict";
const DEFAULT_MESSAGE = "Thank you {name} for sponsoring my open source work on GitHub! 💜";
// X counts every character as one here except emoji and a few scripts; 280 is the limit for a plain post
const MAX = 280;

// The newest sponsorships of an account. Private ones only come back when the token belongs to that account.
const SPONSORS_QUERY = `query($l:String!,$p:Boolean!){user(login:$l){sponsorshipsAsMaintainer(first:50,activeOnly:false,includePrivate:$p,orderBy:{field:CREATED_AT,direction:DESC}){totalCount nodes{createdAt privacyLevel isOneTimePayment tier{name monthlyPriceInDollars} sponsorEntity{__typename ...on User{login name avatarUrl} ...on Organization{login name avatarUrl}}}}}}`;

// GraphQL nodes → plain sponsors, newest first. A sponsor with no entity (a deleted account) is dropped.
function sponsorsFrom(data) {
  const nodes = data?.user?.sponsorshipsAsMaintainer?.nodes || [];
  return nodes.filter((n) => n.sponsorEntity?.login).map((n) => ({
    login: n.sponsorEntity.login, name: n.sponsorEntity.name || n.sponsorEntity.login, avatar: n.sponsorEntity.avatarUrl || null,
    org: n.sponsorEntity.__typename === "Organization", at: n.createdAt, private: n.privacyLevel === "PRIVATE",
    oneTime: !!n.isOneTimePayment, tier: n.tier?.name || "", dollars: n.tier?.monthlyPriceInDollars || 0,
  }));
}
// One key per sponsorship, so someone who sponsors again later is thanked again
const sponsorKey = (s) => `${s.login}@${s.at}`;

// Fills {name}, {login}, {tier} and {amount} in a message and keeps it within one post
function thankText(template, s) {
  const amount = s.dollars ? `$${s.dollars}` : "";
  let text = String(template || DEFAULT_MESSAGE)
    .replace(/\{name\}/g, s.name).replace(/\{login\}/g, s.login)
    .replace(/\{tier\}/g, s.tier).replace(/\{amount\}/g, amount)
    .replace(/[ \t]{2,}/g, " ").trim();
  const chars = [...text];
  if (chars.length > MAX) text = chars.slice(0, MAX - 1).join("") + "…";
  return text;
}

const api = { DEFAULT_MESSAGE, SPONSORS_QUERY, sponsorsFrom, sponsorKey, thankText };
if (typeof module === "object" && module.exports) module.exports = api; else root.AtlasThanks = api;
})(typeof window !== "undefined" ? window : globalThis);
