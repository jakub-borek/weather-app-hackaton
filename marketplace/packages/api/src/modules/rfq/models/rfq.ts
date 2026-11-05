// Modele modułu RFQ (F03). Kontrakt: docs/rfq-contract.md.
// Ceny w PLN, jednostki główne. ID innych modułów (seller, variant) jako zwykły tekst, bez linków.
import { model } from "@medusajs/framework/utils";

export const Rfq = model.define("rfq", {
  id: model.id({ prefix: "rfq" }).primaryKey(),
  status: model.enum(["draft", "negotiating", "ready", "accepted", "cancelled"]).default("draft"),
  need_text: model.text(),
  // [{ variant_id, product_title, quantity, list_unit_price, target_unit_price? }]
  items: model.json().nullable(),
  max_rounds: model.number().default(3),
  accept_token: model.text(),
  // Koszyk, z którego kupujący wysłał zapytanie (POST /store/rfq-requests).
  cart_id: model.text().nullable(),
  order_group_id: model.text().nullable(),
  negotiations: model.hasMany(() => RfqNegotiation, { mappedBy: "rfq" }),
});

export const RfqNegotiation = model.define("rfq_negotiation", {
  id: model.id({ prefix: "rfqneg" }).primaryKey(),
  seller_id: model.text(),
  status: model
    .enum(["awaiting_seller", "awaiting_buyer", "final", "declined", "accepted", "rejected"])
    .default("awaiting_seller"),
  round: model.number().default(0),
  rfq: model.belongsTo(() => Rfq, { mappedBy: "negotiations" }),
  messages: model.hasMany(() => RfqMessage, { mappedBy: "negotiation" }),
});

export const RfqMessage = model.define("rfq_message", {
  id: model.id({ prefix: "rfqmsg" }).primaryKey(),
  // buyer = człowiek (wiadomość wysłana z koszykiem), buyer_agent / seller_agent = agenci.
  author: model.enum(["buyer", "buyer_agent", "seller_agent", "system"]),
  kind: model.enum(["offer", "counter", "final", "decline", "stop", "note"]),
  // [{ variant_id, quantity, unit_price }]
  lines: model.json().nullable(),
  text: model.text().nullable(),
  negotiation: model.belongsTo(() => RfqNegotiation, { mappedBy: "messages" }),
});

// Prywatna reguła cenowa sprzedawcy dla jednej oferty (F04): dolny limit negocjacji i rabaty wolumenowe.
// Osobna tabela, bo metadata oferty jest publiczne (/store/offers). Czyta ją tylko backend i Vendor API
// sprzedawcy (pole pricing). Zasilenie: seed (seedPriceRules w src/scripts/seed-price-rules.ts).
export const SellerPriceRule = model
  .define("seller_price_rule", {
    id: model.id({ prefix: "spr" }).primaryKey(),
    offer_id: model.text(),
    seller_id: model.text(),
    variant_id: model.text(),
    // Najniższa cena jednostkowa (PLN), na jaką sprzedawca może zejść. Niżej backend zwraca 422 BELOW_MIN_PRICE.
    min_unit_price: model.number(),
    // [{ min_quantity, discount_pct }]
    volume_discounts: model.json().nullable(),
  })
  .indexes([
    { on: ["offer_id"], unique: true },
    { on: ["seller_id", "variant_id"] },
  ]);
