/**
 * F02: seed demo RFQ (3 sprzedawców, 3 laptopy, 6 ofert) dla Mercura 2.4.x.
 *
 * SZKIC przygotowany przed F01. Po postawieniu Mercura:
 *   cp docs/seed/seed-rfq.ts docs/seed/rfq-demo-data.json marketplace/packages/api/src/scripts/
 *   cd marketplace/packages/api && npx medusa exec ./src/scripts/seed-rfq.ts
 *
 * Oparty na templates/basic/packages/api/src/scripts/seed.ts z mercurjs/mercur v2.4.1
 * (te same workflowy i kolejność), bez katalogu butów i losowych ofert.
 * Dane: rfq-demo-data.json. Cena minimalna (rules.*) NIE idzie do offer.metadata,
 * bo /store/offers zwraca metadata domyślnie. Patrz docs/seed-plan.md.
 */
import fs from "node:fs";
import path from "node:path";
import { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, toHandle } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { AttributeType, ProductStatus, type CreateOfferDTO } from "@mercurjs/types";
import {
  approveSellerWorkflow,
  createOffersWorkflow,
  createProductAttributesWorkflow,
  createProductsWorkflow,
  createSellerAccountWorkflow,
  createSellerShippingOptionsWorkflow,
  createSellerStockLocationsWorkflow,
} from "@mercurjs/core/workflows";
import {
  createApiKeysWorkflow,
  createLocationFulfillmentSetWorkflow,
  createProductCategoriesWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createServiceZonesWorkflow,
  createShippingProfilesWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

// ---------- dane ----------

type SellerCfg = {
  key: string; name: string; email: string; first_name: string; last_name: string;
  city: string; address_1: string; country_code: string; description: string;
};
type ProductCfg = {
  key: string; title: string; brand: string; sku: string; configuration: string; description: string;
};
type OfferCfg = {
  seller: string; product: string; list_price: number; stock: number; leadtime_days: number;
  rules: { min_unit_price: number; volume_discounts: { min_qty: number; pct: number }[] };
};
type SeedData = {
  currency_code: string;
  region: { name: string; countries: string[] };
  category: { name: string; handle: string };
  variant_axis: { name: string; handle: string };
  seller_password: string;
  sellers: SellerCfg[];
  products: ProductCfg[];
  offers: OfferCfg[];
};

const DATA_PATH = process.env.RFQ_SEED_DATA ?? path.resolve(__dirname, "rfq-demo-data.json");
const SHIPPING_PROFILE_NAME = "Marketplace Shipping";
const SALES_CHANNEL_NAME = "Default Sales Channel";
const RFQ_MODULE_KEY = "rfq"; // do potwierdzenia w kontrakcie F00

function loadSeedData(): SeedData {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8")) as SeedData;
  const sellerKeys = new Set(data.sellers.map((s) => s.key));
  const productKeys = new Set(data.products.map((p) => p.key));
  const errors = data.offers.flatMap((o) => [
    ...(sellerKeys.has(o.seller) ? [] : [`oferta: nieznany sprzedawca "${o.seller}"`]),
    ...(productKeys.has(o.product) ? [] : [`oferta: nieznany produkt "${o.product}"`]),
    ...(o.rules.min_unit_price <= o.list_price ? [] : [`${o.seller}/${o.product}: min_unit_price > list_price`]),
    ...(o.stock >= 0 ? [] : [`${o.seller}/${o.product}: ujemny stan`]),
  ]);
  if (errors.length) {
    throw new Error(`Niepoprawne dane seeda (${DATA_PATH}):\n- ${errors.join("\n- ")}`);
  }
  return data;
}

// ---------- infrastruktura sklepu ----------

const updateStoreCurrencies = createWorkflow(
  "rfq-seed-update-store-currencies",
  (input: { store_id: string; currency_code: string }) => {
    const normalized = transform({ input }, ({ input }) => ({
      selector: { id: input.store_id },
      update: { supported_currencies: [{ currency_code: input.currency_code, is_default: true }] },
    }));
    return new WorkflowResponse(updateStoresStep(normalized));
  }
);

async function seedStore(container: MedusaContainer, currency: string) {
  const storeService = container.resolve(Modules.STORE);
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
  const [store] = await storeService.listStores();

  let [salesChannel] = await salesChannelService.listSalesChannels({ name: SALES_CHANNEL_NAME });
  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: SALES_CHANNEL_NAME }] },
    });
    salesChannel = result[0];
  }

  await updateStoreCurrencies(container).run({ input: { store_id: store.id, currency_code: currency } });
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { name: "RFQ Marketplace", default_sales_channel_id: salesChannel.id },
    },
  });
  return { storeId: store.id, salesChannelId: salesChannel.id };
}

async function seedRegion(container: MedusaContainer, data: SeedData) {
  const regionService = container.resolve(Modules.REGION);
  const regions = await regionService.listRegions({}, { relations: ["countries"] });
  const existing = regions.find((r) => r.countries?.some((c) => data.region.countries.includes(c.iso_2)));
  if (existing) return existing;

  const { result } = await createRegionsWorkflow(container).run({
    input: {
      regions: [{
        name: data.region.name,
        currency_code: data.currency_code,
        countries: data.region.countries,
        payment_providers: ["pp_system_default"],
      }],
    },
  });
  return result[0];
}

async function seedTaxRegions(container: MedusaContainer, countries: string[]) {
  const taxService = container.resolve(Modules.TAX);
  const existing = new Set((await taxService.listTaxRegions()).map((t) => t.country_code));
  const missing = countries.filter((c) => !existing.has(c));
  if (!missing.length) return;
  // Bez stawek: ceny w seedzie są netto (B2B), podatek 0 na demo.
  await createTaxRegionsWorkflow(container).run({
    input: missing.map((country_code) => ({ country_code, provider_id: "tp_system" })),
  });
}

async function seedPublishableKey(container: MedusaContainer, salesChannelId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id", "token"],
    filters: { type: "publishable" },
  });
  let key = data[0] as { id: string; token: string } | undefined;
  if (!key) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: "Webshop", type: "publishable", created_by: "" }] },
    });
    key = result[0] as { id: string; token: string };
  }
  try {
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [salesChannelId] } });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes("already"))) throw error;
  }
  return key.token;
}

async function seedCategory(container: MedusaContainer, category: SeedData["category"]) {
  const productService = container.resolve(Modules.PRODUCT);
  const [existing] = await productService.listProductCategories({ handle: category.handle });
  if (existing) return existing.id;
  const { result } = await createProductCategoriesWorkflow(container).run({
    input: { product_categories: [{ name: category.name, handle: category.handle, is_active: true, rank: 0 }] },
  });
  return result[0].id;
}

type VariantAxis = { id: string; values: { id: string; name: string }[] };

async function seedVariantAxis(container: MedusaContainer, data: SeedData): Promise<VariantAxis> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const load = async () => {
    const { data: rows } = await query.graph({
      entity: "product_attribute",
      fields: ["id", "values.id", "values.name"],
      filters: { handle: data.variant_axis.handle, product_id: null },
    });
    return rows[0] as VariantAxis | undefined;
  };
  const existing = await load();
  if (existing) return existing;

  const values = [...new Set(data.products.map((p) => p.configuration))];
  await createProductAttributesWorkflow(container).run({
    input: {
      attributes: [{
        name: data.variant_axis.name,
        handle: data.variant_axis.handle,
        type: AttributeType.MULTI_SELECT,
        is_variant_axis: true,
        is_filterable: true,
        rank: 0,
        values: values.map((name, rank) => ({ name, rank })),
      }],
    },
  });
  const created = await load();
  if (!created) throw new Error("Nie udało się utworzyć atrybutu wariantu");
  return created;
}

async function seedShippingProfile(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
    filters: { name: SHIPPING_PROFILE_NAME },
  });
  if (data[0]) return data[0].id as string;
  const { result } = await createShippingProfilesWorkflow(container).run({
    input: { data: [{ name: SHIPPING_PROFILE_NAME, type: "default" }] },
  });
  return result[0].id;
}

// ---------- sprzedawcy ----------

type SellerCtx = {
  currency: string;
  password: string;
  salesChannelId: string;
  shippingProfileId: string;
  regionId: string;
  countries: string[];
};
type SeededSeller = { key: string; id: string; memberId: string; stockLocationId: string };

async function registerSellerAuth(container: MedusaContainer, email: string, password: string) {
  const auth = container.resolve(Modules.AUTH);
  const res = await auth.register("emailpass", { body: { email, password } });
  if (res.success && res.authIdentity) return res.authIdentity.id;
  const [identity] = await auth.listProviderIdentities({ entity_id: email, provider: "emailpass" });
  if (!identity?.auth_identity_id) throw new Error(`Brak auth identity dla ${email}: ${res.error ?? "?"}`);
  return identity.auth_identity_id;
}

async function createApprovedSeller(container: MedusaContainer, cfg: SellerCfg, ctx: SellerCtx) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const authIdentityId = await registerSellerAuth(container, cfg.email, ctx.password);
  const { result: seller } = await createSellerAccountWorkflow(container).run({
    input: {
      auth_identity_id: authIdentityId,
      member_email: cfg.email,
      first_name: cfg.first_name,
      last_name: cfg.last_name,
      seller: {
        name: cfg.name,
        email: cfg.email,
        currency_code: ctx.currency,
        description: cfg.description,
        logo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(cfg.name)}`,
        banner: `https://picsum.photos/seed/${toHandle(cfg.name)}/1200/320`,
      },
    },
  });
  await approveSellerWorkflow(container).run({ input: { seller_id: seller.id } });
  const { data: members } = await query.graph({ entity: "member", fields: ["id"], filters: { email: cfg.email } });
  return { sellerId: seller.id as string, memberId: members[0].id as string };
}

async function createSellerWarehouse(container: MedusaContainer, sellerId: string, cfg: SellerCfg, ctx: SellerCtx) {
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const { result } = await createSellerStockLocationsWorkflow(container).run({
    input: {
      seller_id: sellerId,
      locations: [{
        name: `${cfg.name} magazyn`,
        address: { city: cfg.city, country_code: cfg.country_code, address_1: cfg.address_1 },
      }],
    },
  });
  const locationId = result[0].id as string;
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });
  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: locationId, add: [ctx.salesChannelId] },
  });
  return locationId;
}

async function createSellerShipping(
  container: MedusaContainer, sellerId: string, locationId: string, cfg: SellerCfg, ctx: SellerCtx
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  await createLocationFulfillmentSetWorkflow(container).run({
    input: { location_id: locationId, fulfillment_set_data: { name: `${cfg.name} dostawa`, type: "shipping" } },
  });
  const { data: [loc] } = await query.graph({
    entity: "stock_location",
    fields: ["id", "fulfillment_sets.id"],
    filters: { id: locationId },
  });
  const fulfillmentSetId = loc?.fulfillment_sets?.[0]?.id;
  if (!fulfillmentSetId) throw new Error(`Brak fulfillment set dla "${cfg.name}"`);

  const { result: zones } = await createServiceZonesWorkflow(container).run({
    input: {
      data: [{
        fulfillment_set_id: fulfillmentSetId,
        name: `${cfg.name} Polska`,
        geo_zones: ctx.countries.map((country_code) => ({ country_code, type: "country" as const })),
      }],
    },
  });
  await createSellerShippingOptionsWorkflow(container).run({
    input: {
      seller_id: sellerId,
      shipping_options: [{
        name: "Kurier",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: zones[0].id,
        shipping_profile_id: ctx.shippingProfileId,
        type: { label: "Kurier", description: "Dostawa 1-3 dni.", code: "standard" },
        prices: [{ currency_code: ctx.currency, amount: 0 }, { region_id: ctx.regionId, amount: 0 }],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      }],
    },
  });
}

async function seedSeller(container: MedusaContainer, cfg: SellerCfg, ctx: SellerCtx): Promise<SeededSeller> {
  const { sellerId, memberId } = await createApprovedSeller(container, cfg, ctx);
  const stockLocationId = await createSellerWarehouse(container, sellerId, cfg, ctx);
  await createSellerShipping(container, sellerId, stockLocationId, cfg, ctx);
  return { key: cfg.key, id: sellerId, memberId, stockLocationId };
}

// ---------- katalog i oferty ----------

type SeededVariant = { productKey: string; variantId: string };

async function seedProducts(
  container: MedusaContainer, data: SeedData, sellers: SeededSeller[], categoryId: string, axis: VariantAxis
): Promise<SeededVariant[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const valueId = (name: string) => axis.values.find((v) => v.name === name)?.id;

  for (const product of data.products) {
    // Produkt zakłada członek pierwszego sprzedawcy, który go oferuje.
    const ownerKey = data.offers.find((o) => o.product === product.key)?.seller;
    const owner = sellers.find((s) => s.key === ownerKey) ?? sellers[0];
    await createProductsWorkflow(container).run({
      input: {
        created_by: owner.memberId,
        products: [{
          title: product.title,
          handle: product.key,
          description: product.description,
          status: ProductStatus.PUBLISHED,
          category_ids: [categoryId],
          attributes: [{ id: axis.id, value_ids: [valueId(product.configuration)].filter((v): v is string => !!v) }],
          variants: [{
            title: product.configuration,
            sku: product.sku,
            options: { [data.variant_axis.name]: product.configuration },
          }],
        }],
      },
    });
  }

  const { data: rows } = await query.graph({
    entity: "product",
    fields: ["handle", "variants.id"],
    filters: { handle: data.products.map((p) => p.key) },
  });
  return rows.map((r) => ({ productKey: r.handle as string, variantId: r.variants[0].id as string }));
}

/** SKU oferty: unikalny per sprzedawca (indeks IDX_offer_seller_sku_unique). */
function offerSku(data: SeedData, o: OfferCfg): string {
  const product = data.products.find((p) => p.key === o.product)!;
  return `${o.seller}-${product.sku}`.toUpperCase();
}

function buildOffers(
  data: SeedData, sellers: SeededSeller[], variants: SeededVariant[], shippingProfileId: string
): CreateOfferDTO[] {
  return data.offers.map((o) => {
    const seller = sellers.find((s) => s.key === o.seller)!;
    const variant = variants.find((v) => v.productKey === o.product)!;
    const sku = offerSku(data, o);
    return {
      seller_id: seller.id,
      created_by: seller.memberId,
      sku,
      variant_id: variant.variantId,
      shipping_profile_id: shippingProfileId,
      leadtime_to_ship: o.leadtime_days,
      inventory_items: [{ sku, stock_levels: [{ location_id: seller.stockLocationId, stocked_quantity: o.stock }] }],
      prices: [{ amount: o.list_price, currency_code: data.currency_code }],
      // Tylko dane publiczne. Cena minimalna NIE tutaj (metadata wraca w /store/offers).
      metadata: { rfq_seed: true, seller_key: o.seller, product_key: o.product },
    };
  });
}

async function seedPriceRules(container: MedusaContainer, data: SeedData) {
  if (!container.hasRegistration(RFQ_MODULE_KEY)) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(
      `Moduł "${RFQ_MODULE_KEY}" (F03) nie istnieje jeszcze: ceny minimalne nie zapisane. Uruchom seed ponownie po F03.`
    );
    return;
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: offers } = await query.graph({
    entity: "offer",
    fields: ["id", "sku", "seller_id", "variant_id"],
    filters: { sku: data.offers.map((o) => offerSku(data, o)) },
  });
  const rows = data.offers.map((o) => {
    const offer = offers.find((x) => x.sku === offerSku(data, o));
    if (!offer) throw new Error(`Brak oferty ${o.seller}/${o.product}`);
    return {
      offer_id: offer.id,
      seller_id: offer.seller_id,
      variant_id: offer.variant_id,
      currency_code: data.currency_code,
      min_unit_price: o.rules.min_unit_price,
      volume_discounts: o.rules.volume_discounts,
    };
  });
  // Nazwa metody zależy od modelu w F03 (model SellerPriceRule -> createSellerPriceRules).
  const rfq = container.resolve(RFQ_MODULE_KEY) as { createSellerPriceRules: (r: typeof rows) => Promise<unknown> };
  await rfq.createSellerPriceRules(rows);
}

// ---------- main ----------

export default async function seedRfqDemo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const data = loadSeedData();

  const { salesChannelId } = await seedStore(container, data.currency_code);
  const region = await seedRegion(container, data);
  await seedTaxRegions(container, data.region.countries);
  const publishableKey = await seedPublishableKey(container, salesChannelId);
  logger.info(`Publishable API key (dla storefrontu i agentów): ${publishableKey}`);

  const { data: existing } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { email: data.sellers[0].email },
  });
  if (existing[0]) {
    logger.info("Sprzedawcy RFQ już istnieją, pomijam sprzedawców, produkty i oferty.");
    await seedPriceRules(container, data);
    return;
  }

  const categoryId = await seedCategory(container, data.category);
  const axis = await seedVariantAxis(container, data);
  const shippingProfileId = await seedShippingProfile(container);
  const ctx: SellerCtx = {
    currency: data.currency_code,
    password: data.seller_password,
    salesChannelId,
    shippingProfileId,
    regionId: region.id,
    countries: data.region.countries,
  };

  const sellers: SeededSeller[] = [];
  for (const cfg of data.sellers) {
    sellers.push(await seedSeller(container, cfg, ctx));
    logger.info(`Sprzedawca "${cfg.name}" gotowy (${cfg.email}).`);
  }

  const variants = await seedProducts(container, data, sellers, categoryId, axis);
  await createOffersWorkflow(container).run({ input: { offers: buildOffers(data, sellers, variants, shippingProfileId) } });
  logger.info(`Utworzono ${data.products.length} produkty i ${data.offers.length} ofert.`);

  await seedPriceRules(container, data);
  logger.info("Seed RFQ zakończony.");
}
