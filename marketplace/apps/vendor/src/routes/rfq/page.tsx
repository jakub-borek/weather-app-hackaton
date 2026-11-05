// Panel sprzedawcy: czat RFQ. Sprzedawca widzi swoje wątki z kupującymi, odpisuje wiadomością
// albo składa ofertę (ceny i ilości). Reguły (cena minimalna, stan, kolejka, rundy) pilnuje backend.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Text, Textarea } from "@medusajs/ui"
import type { RouteConfig } from "@mercurjs/dashboard-sdk"
import { getAuthHeaders } from "@mercurjs/vendor"

declare const __BACKEND_URL__: string

export const config: RouteConfig = {
  label: "Zapytania ofertowe",
  icon: ChatBubbleLeftRight,
}

type Line = { variant_id: string; quantity: number; unit_price: number }
type Message = { id: string; author: string; kind: string; lines: Line[]; text: string | null; created_at: string; valid_until: string | null }
type Pricing = { variant_id: string; unit_price: number; min_unit_price: number; stock: number }
type Negotiation = {
  id: string
  rfq: { id: string; need_text: string; max_rounds: number }
  status: string
  round: number
  requested: { variant_id: string; product_title: string; quantity: number }[]
  pricing: Pricing[]
  messages: Message[]
  order: { id: string; display_id: number; total: number; status: string } | null
}

const POLL_MS = 2000
const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 })
const STATUS: Record<string, string> = {
  awaiting_seller: "Twoja kolej",
  awaiting_buyer: "Czeka na kupującego",
  final: "Oferta końcowa",
  declined: "Odmówiono",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
}
const KIND: Record<string, string> = { note: "Wiadomość", offer: "Oferta", counter: "Kontroferta", final: "Oferta końcowa", decline: "Odmowa", stop: "Koniec negocjacji" }
const AUTHOR: Record<string, string> = { buyer: "Kupujący", buyer_agent: "Agent kupującego", seller_agent: "Ty", system: "System" }
// Czat działa też po zakupie. Zamknięty tylko w wątkach odrzuconych.
const CHAT_CLOSED = ["declined", "rejected"]

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${__BACKEND_URL__}${path}`, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.code ? `${body.code}: ${body.message}` : body?.message ?? `Błąd ${response.status}`)
  }
  return body as T
}

function Bubble({ message, titles }: { message: Message; titles: Map<string, string> }) {
  const mine = message.author === "seller_agent"
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 ${mine ? "bg-ui-bg-interactive text-ui-fg-on-color" : "bg-ui-bg-subtle"}`}>
        <Text size="xsmall" className="opacity-70">
          {AUTHOR[message.author] ?? message.author} · {KIND[message.kind] ?? message.kind} ·{" "}
          {new Date(message.created_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
        </Text>
        {message.text && <Text size="small" className="whitespace-pre-wrap">{message.text}</Text>}
        {message.lines.map((line) => (
          <Text key={line.variant_id} size="small" weight="plus">
            {line.quantity} × {titles.get(line.variant_id) ?? line.variant_id}: {pln.format(line.unit_price)}/szt.
          </Text>
        ))}
      </div>
    </div>
  )
}

function Reply({ negotiation, onSent }: { negotiation: Negotiation; onSent: () => void }) {
  const priceOf = (variantId: string) => negotiation.pricing.find((p) => p.variant_id === variantId)
  const [text, setText] = useState("")
  const [lines, setLines] = useState<Line[]>(() =>
    negotiation.requested.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity, unit_price: priceOf(item.variant_id)?.unit_price ?? 0 }))
  )
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const myTurn = negotiation.status === "awaiting_seller"

  const send = async (kind: string) => {
    setSending(true)
    setError(null)
    try {
      await api(`/vendor/rfq-negotiations/${negotiation.id}/messages`, {
        method: "POST",
        body: { kind, text, lines: kind === "note" || kind === "decline" ? [] : lines },
      })
      setText("")
      onSent()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Nie udało się wysłać")
    }
    setSending(false)
  }
  const update = (index: number, field: "quantity" | "unit_price", value: number) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [field]: value } : line)))

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {myTurn &&
        lines.map((line, index) => {
          const pricing = priceOf(line.variant_id)
          const title = negotiation.requested.find((r) => r.variant_id === line.variant_id)?.product_title
          return (
            <div key={line.variant_id} className="grid grid-cols-[1fr_90px_120px] items-center gap-2">
              <Text size="small">
                {title}
                <span className="text-ui-fg-muted"> · min {pln.format(pricing?.min_unit_price ?? 0)} · stan {pricing?.stock ?? 0}</span>
              </Text>
              <Input type="number" value={line.quantity} onChange={(e) => update(index, "quantity", Number(e.target.value))} />
              <Input type="number" value={line.unit_price} onChange={(e) => update(index, "unit_price", Number(e.target.value))} />
            </div>
          )
        })}
      <Textarea rows={2} placeholder="Napisz do kupującego…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="small" variant="secondary" disabled={sending || !text.trim()} onClick={() => send("note")}>
          Wyślij wiadomość
        </Button>
        {myTurn && (
          <>
            <Button size="small" disabled={sending} onClick={() => send("offer")}>Wyślij ofertę</Button>
            <Button size="small" variant="secondary" disabled={sending} onClick={() => send("final")}>Oferta końcowa</Button>
            <Button size="small" variant="danger" disabled={sending} onClick={() => send("decline")}>Odmów</Button>
          </>
        )}
      </div>
      {error && <Text size="small" className="text-ui-fg-error">{error}</Text>}
    </div>
  )
}

const RfqChatPage = () => {
  const [negotiations, setNegotiations] = useState<Negotiation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<{ negotiations: Negotiation[] }>("/vendor/rfq-negotiations")
      .then((data) => {
        setNegotiations([...data.negotiations].reverse())
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Błąd"))
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => !document.hidden && load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const selected = negotiations.find((n) => n.id === selectedId) ?? negotiations[0]
  const titles = useMemo(
    () => new Map((selected?.requested ?? []).map((item) => [item.variant_id, item.product_title])),
    [selected]
  )

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading>Zapytania ofertowe</Heading>
        <Text size="small" className="text-ui-fg-subtle">Rozmowy z kupującymi. Odświeżane co 2 s.</Text>
        {error && <Text size="small" className="text-ui-fg-error">{error}</Text>}
      </div>
      <div className="grid min-h-[480px] grid-cols-[280px_1fr] border-t">
        <div className="flex flex-col border-r">
          {negotiations.length === 0 && <Text size="small" className="p-4 text-ui-fg-muted">Brak zapytań.</Text>}
          {negotiations.map((negotiation) => (
            <button
              key={negotiation.id}
              onClick={() => setSelectedId(negotiation.id)}
              className={`border-b px-4 py-3 text-left ${negotiation.id === selected?.id ? "bg-ui-bg-subtle" : ""}`}
            >
              <Text size="small" weight="plus" className="line-clamp-2">{negotiation.rfq.need_text}</Text>
              <div className="mt-1 flex items-center gap-2">
                <Badge size="2xsmall" color={negotiation.status === "awaiting_seller" ? "orange" : "grey"}>
                  {STATUS[negotiation.status] ?? negotiation.status}
                </Badge>
                <Text size="xsmall" className="text-ui-fg-muted">runda {negotiation.round}/{negotiation.rfq.max_rounds}</Text>
              </div>
            </button>
          ))}
        </div>
        {selected && (
          <div className="flex flex-col gap-3 p-6">
            <Text size="small" className="text-ui-fg-subtle">
              {selected.requested.map((item) => `${item.quantity} × ${item.product_title}`).join(", ")}
            </Text>
            {selected.order && (
              <div className="rounded-lg bg-ui-bg-subtle px-3 py-2">
                <Text size="small" weight="plus">
                  <Link to={`/orders/${selected.order.id}`} className="underline">
                    Zamówienie #{selected.order.display_id}
                  </Link>
                </Text>
                <Text size="xsmall" className="text-ui-fg-muted">
                  {pln.format(selected.order.total)} z dostawą · status: {selected.order.status}
                </Text>
              </div>
            )}
            <div className="flex flex-1 flex-col gap-2">
              {selected.messages.map((message) => (
                <Bubble key={message.id} message={message} titles={titles} />
              ))}
            </div>
            {!CHAT_CLOSED.includes(selected.status) ? (
              <Reply key={selected.id} negotiation={selected} onSent={load} />
            ) : (
              <Text size="small" className="text-ui-fg-muted">Negocjacja zamknięta: {STATUS[selected.status]}.</Text>
            )}
          </div>
        )}
      </div>
    </Container>
  )
}

export default RfqChatPage
