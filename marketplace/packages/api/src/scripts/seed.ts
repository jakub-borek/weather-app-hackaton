// Seed marketplace'u z elektroniką: sklep (PLN), region Polska, kategorie, 12 sprzedawców,
// ~90 produktów i oferty kilku sprzedawców na każdy produkt (różne ceny, stany i ceny minimalne).
// Dane: ./seed-data.ts. Uruchomienie: bun run seed (w packages/api). Reset: docker compose down -v.
import { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { AttributeType, ProductStatus, type CreateOfferDTO, type CreateProductDTO } from "@mercurjs/types";
import {
  approveSellerWorkflow,
  createOffersWorkflow,
  createProductAttributesWorkflow,
  createProductsWorkflow,
  createSellerAccountWorkflow,
  createSellerShippingOptionsWorkflow,
  createSellerStockLocationsWorkflow,
} from "@mercurjs/core/workflows";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
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
import {
  CATALOG,
  CATEGORY_TREE,
  COLOR_VALUES,
  CONDITION_VALUES,
  COUNTRIES,
  CURRENCY,
  DEMO_OFFERS,
  DEMO_SELLERS,
  EUR_RATE,
  OFFERS_PER_PRODUCT,
  PRICE_JITTER,
  SELLER_PASSWORD,
  SELLERS,
  SHIPPING_PRICE_PLN,
  STOCK_RANGE,
  sellerHandle,
  type CatalogItem,
  type DemoOffer,
  type SellerConfig,
} from "./seed-data";

const ALL_SELLERS = [...SELLERS, ...DEMO_SELLERS];

const STORE_NAME = "Marketplace RFQ";
const SALES_CHANNEL_NAME = "Default Sales Channel";
const SHIPPING_PROFILE_NAME = "Marketplace Shipping";

type SeededAttribute = { id: string; handle: string; values: { id: string; name: string }[] };
type SeededAttributes = { color: SeededAttribute; condition: SeededAttribute };
type SeededSeller = { id: string; config: SellerConfig; memberId: string; stockLocationId: string };
type SeededProduct = { handle: string; variants: { id: string; sku: string | null }[] };
type SellerContext = { salesChannelId: string; regionId: string; shippingProfileId: string };

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: { supported_currencies: { currency_code: string; is_default?: boolean }[]; store_id: string }) => {
    const normalized = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map((currency) => ({
          currency_code: currency.currency_code,
          is_default: currency.is_default ?? false,
        })),
      },
    }));
    return new WorkflowResponse(updateStoresStep(normalized));
  }
);

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const rootCategoryOf = (subcategory: string): string => {
  const root = Object.keys(CATEGORY_TREE).find((parent) => CATEGORY_TREE[parent].includes(subcategory));
  if (!root) {
    throw new Error(`Podkategoria "${subcategory}" nie występuje w CATEGORY_TREE`);
  }
  return root;
};

// Deterministyczny PRNG (mulberry32), żeby ponowny seed dawał ten sam rozkład ofert.
const createRng = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const retailPrice = (value: number): number => Math.max(9, Math.round(value / 10) * 10 - 1);

async function seedStore(container: MedusaContainer): Promise<{ storeId: string; salesChannelId: string }> {
  const storeService = container.resolve(Modules.STORE);
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
  const [store] = await storeService.listStores();
  const [existingChannel] = await salesChannelService.listSalesChannels({ name: SALES_CHANNEL_NAME });
  const salesChannel =
    existingChannel ??
    (await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: SALES_CHANNEL_NAME }] } }))
      .result[0];

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [{ currency_code: CURRENCY, is_default: true }, { currency_code: "eur" }],
    },
  });
  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { name: STORE_NAME, default_sales_channel_id: salesChannel.id } },
  });
  return { storeId: store.id, salesChannelId: salesChannel.id };
}

async function seedRegion(container: MedusaContainer): Promise<string> {
  const regionService = container.resolve(Modules.REGION);
  const regions = await regionService.listRegions({}, { relations: ["countries"] });
  const existing = regions.find((region) => region.countries?.some((c) => COUNTRIES.includes(c.iso_2)));
  if (existing) {
    return existing.id;
  }
  const { result } = await createRegionsWorkflow(container).run({
    input: {
      regions: [{ name: "Polska", currency_code: CURRENCY, countries: COUNTRIES, payment_providers: ["pp_system_default"] }],
    },
  });
  return result[0].id;
}

async function seedTaxRegions(container: MedusaContainer): Promise<void> {
  const taxService = container.resolve(Modules.TAX);
  const existing = new Set((await taxService.listTaxRegions()).map((region) => region.country_code));
  const missing = COUNTRIES.filter((country) => !existing.has(country));
  if (missing.length) {
    await createTaxRegionsWorkflow(container).run({
      input: missing.map((country_code) => ({ country_code, provider_id: "tp_system" })),
    });
  }
}

async function seedPublishableKey(container: MedusaContainer, salesChannelId: string): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "api_key", fields: ["id", "token"], filters: { type: "publishable" } });
  const key =
    data[0] ??
    (
      await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title: "Storefront", type: "publishable", created_by: "" }] },
      })
    ).result[0];
  try {
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [salesChannelId] } });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.message.includes("already"))) {
      throw error;
    }
  }
  return key.token as string;
}

async function seedCategories(container: MedusaContainer): Promise<Map<string, string>> {
  const productService = container.resolve(Modules.PRODUCT);
  const parents = Object.keys(CATEGORY_TREE);
  const existing = await productService.listProductCategories({
    name: [...parents, ...Object.values(CATEGORY_TREE).flat()],
  });
  const ids = new Map(existing.map((category) => [category.name, category.id]));
  const create = async (inputs: { name: string; rank: number; parent_category_id?: string }[]) => {
    if (!inputs.length) return;
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: inputs.map((input) => ({ ...input, is_active: true })) },
    });
    result.forEach((category) => ids.set(category.name, category.id));
  };

  await create(parents.filter((name) => !ids.has(name)).map((name) => ({ name, rank: parents.indexOf(name) })));
  await create(
    parents
      .flatMap((parent) =>
        CATEGORY_TREE[parent].map((name, rank) => ({ name, rank, parent_category_id: ids.get(parent) as string }))
      )
      .filter((child) => !ids.has(child.name))
  );
  return ids;
}

async function seedAttributes(container: MedusaContainer): Promise<SeededAttributes> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const definitions = [
    { name: "Color", handle: "color", values: COLOR_VALUES },
    { name: "Condition", handle: "condition", values: CONDITION_VALUES },
  ];
  const load = async (): Promise<Map<string, SeededAttribute>> => {
    const { data } = await query.graph({
      entity: "product_attribute",
      fields: ["id", "handle", "values.id", "values.name"],
      filters: { handle: definitions.map((d) => d.handle), product_id: null },
    });
    return new Map((data as SeededAttribute[]).map((attribute) => [attribute.handle, attribute]));
  };

  const existing = await load();
  const missing = definitions.filter((d) => !existing.has(d.handle));
  if (missing.length) {
    await createProductAttributesWorkflow(container).run({
      input: {
        attributes: missing.map((d, index) => ({
          name: d.name,
          handle: d.handle,
          type: AttributeType.MULTI_SELECT,
          is_variant_axis: true,
          is_filterable: true,
          rank: index,
          values: d.values.map((name, rank) => ({ name, rank })),
        })),
      },
    });
  }
  const attributes = missing.length ? await load() : existing;
  return { color: attributes.get("color")!, condition: attributes.get("condition")! };
}

async function seedShippingProfile(container: MedusaContainer): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
    filters: { name: SHIPPING_PROFILE_NAME },
  });
  if (data[0]) {
    return data[0].id as string;
  }
  const { result } = await createShippingProfilesWorkflow(container).run({
    input: { data: [{ name: SHIPPING_PROFILE_NAME, type: "default" }] },
  });
  return result[0].id;
}

async function registerSellerIdentity(container: MedusaContainer, email: string): Promise<string> {
  const authService = container.resolve(Modules.AUTH);
  const response = await authService.register("emailpass", { body: { email, password: SELLER_PASSWORD } });
  if (response.success && response.authIdentity) {
    return response.authIdentity.id;
  }
  const [identity] = await authService.listProviderIdentities({ entity_id: email, provider: "emailpass" });
  if (!identity?.auth_identity_id) {
    throw new Error(`Nie udało się zarejestrować ani znaleźć tożsamości dla ${email}: ${response.error ?? "brak szczegółów"}`);
  }
  return identity.auth_identity_id;
}

async function createApprovedSeller(
  container: MedusaContainer,
  config: SellerConfig
): Promise<{ sellerId: string; memberId: string }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const authIdentityId = await registerSellerIdentity(container, config.email);
  const { result: seller } = await createSellerAccountWorkflow(container).run({
    input: {
      auth_identity_id: authIdentityId,
      member_email: config.email,
      first_name: config.first_name,
      last_name: config.last_name,
      seller: {
        name: config.name,
        email: config.email,
        currency_code: CURRENCY,
        description: `${config.name} (${config.city}): sprzęt IT dla firm.`,
        logo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(config.name)}`,
        banner: `https://picsum.photos/seed/${slugify(config.name)}/1200/320`,
        // Tylko dane publiczne: /store/sellers zwraca metadata każdemu. Reguły negocjacji są w seed-data.ts.
        metadata: { city: config.city, categories: config.categories },
      },
    },
  });
  await approveSellerWorkflow(container).run({ input: { seller_id: seller.id } });
  const { data: members } = await query.graph({ entity: "member", fields: ["id"], filters: { email: config.email } });
  return { sellerId: seller.id, memberId: members[0].id as string };
}

async function createSellerLocation(
  container: MedusaContainer,
  config: SellerConfig,
  sellerId: string,
  salesChannelId: string
): Promise<{ stockLocationId: string; fulfillmentSetId: string }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const { result: locations } = await createSellerStockLocationsWorkflow(container).run({
    input: {
      seller_id: sellerId,
      locations: [
        { name: `${config.name} Magazyn`, address: { city: config.city, country_code: "PL", address_1: config.address_1 } },
      ],
    },
  });
  const stockLocationId = locations[0].id;

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });
  await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: stockLocationId, add: [salesChannelId] } });
  await createLocationFulfillmentSetWorkflow(container).run({
    input: { location_id: stockLocationId, fulfillment_set_data: { name: `${config.name} wysyłka`, type: "shipping" } },
  });

  const { data } = await query.graph({
    entity: "stock_location",
    fields: ["id", "fulfillment_sets.id"],
    filters: { id: stockLocationId },
  });
  const fulfillmentSetId = data[0]?.fulfillment_sets?.[0]?.id;
  if (!fulfillmentSetId) {
    throw new Error(`Nie powstał fulfillment set dla sprzedawcy "${config.name}"`);
  }
  return { stockLocationId, fulfillmentSetId };
}

async function createSellerShipping(
  container: MedusaContainer,
  config: SellerConfig,
  sellerId: string,
  fulfillmentSetId: string,
  context: SellerContext
): Promise<void> {
  const { result: zones } = await createServiceZonesWorkflow(container).run({
    input: {
      data: [
        {
          fulfillment_set_id: fulfillmentSetId,
          name: `${config.name} Polska`,
          geo_zones: COUNTRIES.map((country_code) => ({ country_code, type: "country" as const })),
        },
      ],
    },
  });
  await createSellerShippingOptionsWorkflow(container).run({
    input: {
      seller_id: sellerId,
      shipping_options: [
        {
          name: "Kurier",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: zones[0].id,
          shipping_profile_id: context.shippingProfileId,
          type: { label: "Kurier", description: "Dostawa w 1-2 dni robocze.", code: "courier" },
          prices: [
            { currency_code: CURRENCY, amount: SHIPPING_PRICE_PLN },
            { currency_code: "eur", amount: Math.round(SHIPPING_PRICE_PLN / EUR_RATE) },
            { region_id: context.regionId, amount: SHIPPING_PRICE_PLN },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    },
  });
}

async function seedSeller(container: MedusaContainer, config: SellerConfig, context: SellerContext): Promise<SeededSeller> {
  const { sellerId, memberId } = await createApprovedSeller(container, config);
  const { stockLocationId, fulfillmentSetId } = await createSellerLocation(
    container,
    config,
    sellerId,
    context.salesChannelId
  );
  await createSellerShipping(container, config, sellerId, fulfillmentSetId, context);
  return { id: sellerId, config, memberId, stockLocationId };
}

function buildProducts(categoryIds: Map<string, string>, attributes: SeededAttributes): CreateProductDTO[] {
  const valueId = (attribute: SeededAttribute, name: string): string[] =>
    attribute.values.filter((value) => value.name === name).map((value) => value.id);

  return CATALOG.map((item) => {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) {
      throw new Error(`Brak kategorii "${item.category}" dla produktu "${item.title}"`);
    }
    const handle = slugify(item.title);
    const image = `https://placehold.co/800x600/png?text=${encodeURIComponent(item.title)}`;
    return {
      title: item.title,
      handle,
      description: `${item.title}. Kategoria: ${item.category}. Sprzęt nowy, z gwarancją producenta.`,
      category_ids: [categoryId],
      status: ProductStatus.PUBLISHED,
      thumbnail: image,
      images: [{ url: image }],
      weight: 1000,
      metadata: { brand: item.brand, list_price_pln: item.price },
      attributes: [
        { id: attributes.color.id, value_ids: valueId(attributes.color, item.color) },
        { id: attributes.condition.id, value_ids: valueId(attributes.condition, "New") },
      ],
      variants: [
        { title: "Standard", sku: handle.toUpperCase(), options: { Color: item.color, Condition: "New" } },
      ],
    } as CreateProductDTO;
  });
}

function pickSellers(item: CatalogItem, sellers: SeededSeller[], rand: () => number): SeededSeller[] {
  const root = rootCategoryOf(item.category);
  const eligible = sellers.filter(
    (seller) => seller.config.categories.includes("*") || seller.config.categories.includes(root)
  );
  const wanted = OFFERS_PER_PRODUCT.min + Math.floor(rand() * (OFFERS_PER_PRODUCT.max - OFFERS_PER_PRODUCT.min + 1));
  return eligible
    .map((seller) => ({ seller, key: rand() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, Math.min(wanted, eligible.length))
    .map(({ seller }) => seller);
}

type OfferInput = {
  item: CatalogItem;
  variant: { id: string; sku: string | null };
  seller: SeededSeller;
  shippingProfileId: string;
  price: number;
  stock: number;
};

// metadata oferty jest publiczne (/store/offers), więc trafia tu tylko cena katalogowa.
// Cena minimalna i rabaty: minPriceFor() i DEMO_OFFERS w seed-data.ts.
function toOffer({ item, variant, seller, shippingProfileId, price, stock }: OfferInput): CreateOfferDTO {
  const sku = `${sellerHandle(seller.config).toUpperCase()}-${variant.sku ?? variant.id}`;
  return {
    seller_id: seller.id,
    created_by: seller.memberId,
    sku,
    variant_id: variant.id,
    shipping_profile_id: shippingProfileId,
    inventory_items: [{ sku, stock_levels: [{ location_id: seller.stockLocationId, stocked_quantity: stock }] }],
    prices: [
      { amount: price, currency_code: CURRENCY },
      { amount: Math.round(price / EUR_RATE), currency_code: "eur" },
    ],
    metadata: { list_price_pln: item.price },
  };
}

function demoOffers(
  item: CatalogItem,
  product: SeededProduct,
  demo: DemoOffer[],
  sellers: SeededSeller[],
  shippingProfileId: string
): CreateOfferDTO[] {
  return demo.flatMap((offer) => {
    const seller = sellers.find((candidate) => sellerHandle(candidate.config) === offer.seller);
    if (!seller) {
      throw new Error(`Oferta demo dla "${item.title}" wskazuje nieznanego sprzedawcę "${offer.seller}"`);
    }
    return product.variants.map((variant) =>
      toOffer({ item, variant, seller, shippingProfileId, price: offer.price, stock: offer.stock })
    );
  });
}

function buildOffers(products: SeededProduct[], sellers: SeededSeller[], shippingProfileId: string): CreateOfferDTO[] {
  const rand = createRng(0x9e3779b9);
  const itemByHandle = new Map(CATALOG.map((item) => [slugify(item.title), item]));
  return products.flatMap((product) => {
    const item = itemByHandle.get(product.handle);
    if (!item) return [];
    const demo = DEMO_OFFERS[item.title];
    if (demo) {
      return demoOffers(item, product, demo, sellers, shippingProfileId);
    }
    return pickSellers(item, sellers, rand).flatMap((seller) =>
      product.variants.map((variant) => {
        const price = retailPrice(item.price * (1 + (rand() * 2 - 1) * PRICE_JITTER));
        const stock = STOCK_RANGE.min + Math.floor(rand() * (STOCK_RANGE.max - STOCK_RANGE.min + 1));
        return toOffer({ item, variant, seller, shippingProfileId, price, stock });
      })
    );
  });
}

async function sellersAlreadySeeded(container: MedusaContainer): Promise<boolean> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "seller", fields: ["id"], filters: { email: SELLERS[0].email } });
  return data.length > 0;
}

async function seedSellers(container: MedusaContainer, context: SellerContext): Promise<SeededSeller[]> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  let seeded: SeededSeller[] = [];
  for (const config of ALL_SELLERS) {
    seeded = [...seeded, await seedSeller(container, config, context)];
    logger.info(`Sprzedawca ${seeded.length}/${ALL_SELLERS.length}: ${config.name}`);
  }
  return seeded;
}

async function seedCatalogAndOffers(
  container: MedusaContainer,
  sellers: SeededSeller[],
  shippingProfileId: string
): Promise<{ products: number; offers: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const categoryIds = await seedCategories(container);
  const attributes = await seedAttributes(container);
  const products = buildProducts(categoryIds, attributes);
  await createProductsWorkflow(container).run({ input: { created_by: sellers[0].memberId, products } });

  const { data } = await query.graph({
    entity: "product",
    fields: ["handle", "variants.id", "variants.sku"],
    filters: { handle: products.map((product) => product.handle as string) },
  });
  const offers = buildOffers(data as SeededProduct[], sellers, shippingProfileId);
  await createOffersWorkflow(container).run({ input: { offers } });
  return { products: products.length, offers: offers.length };
}

export default async function seedElectronicsMarketplace({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  logger.info("Seed: sklep, region, podatki, klucz publiczny...");
  const { storeId, salesChannelId } = await seedStore(container);
  const regionId = await seedRegion(container);
  await seedTaxRegions(container);
  const publishableKey = await seedPublishableKey(container, salesChannelId);

  if (await sellersAlreadySeeded(container)) {
    logger.info("Sprzedawcy już są w bazie, pomijam sprzedawców, produkty i oferty. Pełny reset: docker compose down -v.");
    logger.info(`Publishable API key (storefront): ${publishableKey}`);
    return;
  }

  const shippingProfileId = await seedShippingProfile(container);
  const sellers = await seedSellers(container, { salesChannelId, regionId, shippingProfileId });
  await updateStoresWorkflow(container).run({
    input: { selector: { id: storeId }, update: { default_location_id: sellers[0].stockLocationId } },
  });

  logger.info("Seed: kategorie, atrybuty, produkty, oferty...");
  const counts = await seedCatalogAndOffers(container, sellers, shippingProfileId);

  logger.info(`Gotowe: ${sellers.length} sprzedawców, ${counts.products} produktów, ${counts.offers} ofert.`);
  logger.info(`Publishable API key (storefront): ${publishableKey}`);
  logger.info(`Panel sprzedawcy: http://localhost:9000/seller, np. ${SELLERS[0].email} / ${SELLER_PASSWORD}`);
}
