# Progress: stan na teraz (Current State)

**Last Updated:** 2026-11-05 (start hackathonu)
**Cel na demo:** kupujący pyta o laptopy → agenci negocjują → człowiek akceptuje → zamówienie w Mercurze.
**Next:** F00 (kontrakt RFQ) i F01 (Mercur lokalnie) równolegle.

Każdy nadpisuje tylko swój blok. Historia jest w `harness/journal/`, statusy w `feature_list.json`.

---

## S1 Platforma (Mercur, seed, zamówienia)

- **Kto:** —
- **Active Feature:** —
- **What's done:** —
- **In progress:** —
- **Next:** F01
- **Blockers:** —

---

## S2 Backend RFQ (kontrakt, moduł, guardrails)

- **Kto:** —
- **Active Feature:** —
- **What's done:** —
- **In progress:** —
- **Next:** F00
- **Blockers:** —

---

## S3 Agenci (kupujący, sprzedawcy)

- **Kto:** —
- **Active Feature:** —
- **What's done:** —
- **In progress:** —
- **Next:** wybór runtime'u agentów (DECYZJA), potem F05 i F06 na mocku
- **Blockers:** —

---

## S4 Storefront i demo

- **Kto:** —
- **Active Feature:** —
- **What's done:** —
- **In progress:** —
- **Next:** pomoc przy storefroncie w F01, potem F07 na mocku
- **Blockers:** —

---

## Wspólne blokery i ryzyka (Blockers / Risks)

- **Runtime agentów niejasny:** w rozmowie padało „grok" / „krokbot". S3 decyduje w pierwszych 15 minutach.
- **Nasłuchiwanie agentów:** webhook/subscriber vs polling. Bot „wypadał z pętli".
- **Czas:** ok. 2,5 h. Feature freeze w T+2:00.
- **Inny zespół robi coś B2B:** juror ma sprawdzić, czy się nie dublujemy.

## Evidence of Completion

Evidence każdego feature'a jest w polu `evidence` w `feature_list.json` i we wpisie `DONE` w journalu autora.
