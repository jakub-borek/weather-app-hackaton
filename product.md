# Product: marketplace z negocjacją ofert przez agentów (RFQ)

> Nazwa robocza: do ustalenia.
> Źródło: rozmowa zespołu z jurorem na hackathonie, 2026-11-05. Czas na build: ok. 2,5 h.
> Punkty oznaczone **(wniosek)** nie padły wprost w rozmowie. Wynikają z kryteriów jurora albo z obaw zespołu.

## TL;DR

Marketplace z wieloma sprzedawcami na open source Mercurze, w którym obok „kup" jest „Zapytaj o ofertę". Agent kupującego rozsyła zapytanie do pasujących sprzedawców. Każdy sprzedawca ma własnego agenta, który sprawdza swój stan magazynowy i negocjuje cenę. Agenci tylko zostawiają oferty, a ostatecznie akceptuje człowiek po stronie kupującego. Po akceptacji w systemie powstaje prawdziwe zamówienie.

## Problem

Kupujący B2B ma zamówienie, którego nie załatwi w jednym sklepie: „muszę kupić 20 Maców, 30 Lenovo i 10 HP". Dziś ktoś musi:

- napisać do kilku sklepów (Media Expert, Morele itd., „nawet do 8 sklepów"),
- zebrać i porównać oferty,
- negocjować, a negocjacje są uciążliwe dla każdego („od Wiedźmina 3 po OLX"),
- przynieść wynik reszcie zespołu.

Po stronie sklepu ktoś musi pilnować inventory, odpowiadać na zapytania i ręcznie je wyceniać.

**Wzorzec z rynku (klient Marka):** marketplace części do statków. Kupujący nie przegląda ofert, tylko wysyła zapytanie (np. „silnik do statku") do listy vendorów. Każdy vendor, którego to dotyczy, odpowiada swoją ofertą. Ten proces da się zautomatyzować prawie w całości po obu stronach.

## Propozycja wartości

- **Kogo zastępujemy:** po stronie kupującego osobę, która zbiera oferty, negocjuje i kupuje. Po stronie sklepu osobę, która pilnuje inventory i odpowiada na zapytania.
- **Autonomia:** obie strony dogadują się same, człowiek tylko zatwierdza wynik.
- **Wartość:** wynegocjowana cena + zaoszczędzony czas („szybciej i lepiej").
- **Wyróżnik:** bulk RFQ + negocjacja agent–agent. Juror nie widział tego na hackathonach, w przeciwieństwie do „mój AI dzwoni i zamawia" i botów customer service.

## Użytkownicy

| Rola | Kto to | Czego chce |
|---|---|---|
| Kupujący B2B | procurement, office manager, IT w firmie | raz podać potrzebę i dostać najlepszą wynegocjowaną ofertę do zatwierdzenia |
| Sprzedawca | sklep lub hurtownia na platformie | odpowiadać na zapytania bez ręcznej pracy i nie schodzić poniżej swojej ceny minimalnej |
| Operator platformy | właściciel marketplace'u | żeby zapytania i zamówienia przechodziły przez jego platformę |

## Główny flow (MVP)

1. Kupujący klika w sklepie „Zapytaj o ofertę" albo wpisuje potrzebę: „szukam 20 laptopów".
2. Agent kupującego zamienia potrzebę na zapytanie (RFQ): produkty, ilości, cena docelowa lub budżet, termin.
3. Platforma rozsyła RFQ do sprzedawców, których dotyczy (wg kategorii lub asortymentu).
4. Agent każdego sprzedawcy odbiera zapytanie (nasłuchuje na kanale), sprawdza swoje inventory i cenę, odpowiada ofertą.
5. Agent kupującego negocjuje z każdym sprzedawcą na piśmie, w kilku rundach.
6. Agenci zostawiają oferty końcowe. Żaden agent nie akceptuje oferty.
7. Kupujący widzi porównanie ofert i log negocjacji.
8. Kupujący akceptuje ofertę (w UI albo mailem). W Mercurze powstaje zamówienie po wynegocjowanej cenie, u właściwego sprzedawcy. **(wniosek)**

Krok 8 jest ważny dla jury. Najwyżej punktowane jest to, że system „actually coś zrobił" w realnym sofcie, a nie tylko napisał tekst albo wysłał maila.

## Wymagania

### Must (na demo)

- Marketplace na open source Mercurze (Medusa pod spodem). Sprzedawcy są w nim natywnie, więc ich nie mockujemy.
- Seed danych: 2–3 sprzedawców z własnymi produktami, cenami i stanami magazynowymi (laptopy: MacBook, Lenovo, HP).
- Przycisk lub formularz „Zapytaj o ofertę" w storefroncie.
- Agent kupującego i po jednym agencie na sprzedawcę, podpiętym pod inventory tego sprzedawcy.
- Kanał agent–agent widoczny na ekranie (czat lub wątek per RFQ).
- Oferta końcowa → akceptacja człowieka → zamówienie w Mercurze. **(wniosek)**

### Should

- Jedno RFQ rozesłane naraz do wszystkich pasujących sprzedawców + porównanie ofert.
- Zamówienie dzielone: Maki od sprzedawcy A, Lenovo od B. **(wniosek)**
- Licznik wartości: cena katalogowa vs wynegocjowana, czas vs ręczne pisanie do N sklepów. **(wniosek)**

### Could (jeśli zostanie czas)

- **Proaktywny łowca okazji:** cron + alert (np. na Pepperze). Agent sam wyłapuje nową ofertę, sprawdza, czy jest prawdziwa, i negocjuje, zanim powiadomi człowieka („przed spamem ludzi"). Ktoś z zespołu robił już z Claude'em codzienny raport z Peppera.
- **Backend wystawiony agentom przez MCP:** jeśli agenci mają MCP, mogą rozmawiać bezpośrednio z backendem, bez frontu.

## Zasady i guardrails

- Agent nigdy nie akceptuje oferty. Final accept jest zawsze po stronie człowieka.
- Agent sprzedawcy oferuje tylko to, co ma w inventory.
- Agent sprzedawcy nie schodzi poniżej ceny minimalnej. Pilnuje tego kod w backendzie, nie sam prompt. W rozmowie padła obawa, że bota łatwo „rozpykać". **(wniosek)**
- Negocjacja ma limit rund i czasu, żeby boty się nie zapętliły. **(wniosek)**
- Cały log negocjacji jest zapisany i widoczny.

## Poza zakresem

- Dzwonienie i voice (ElevenLabs). Boty nie powinny do siebie dzwonić, a „mój AI dzwoni i zamawia" juror widział już wiele razy.
- Bot customer service, bo są na to gotowe rozwiązania.
- Własny moduł multi-vendor. Sprzedawców bierzemy z Mercura.
- Onboarding sprzedawców przez UI. Na demo sprzedawców seedujemy.
- Płatności, wysyłka, faktury.

## Decyzje z rozmowy

- **Mercur (open source) jako baza.** W rozmowie skłanialiśmy się ku zwykłej Medusie z zamockowanymi sprzedawcami. Ostatecznie bierzemy Mercura, bo ma już sprzedawców (multi-vendor) i wystarczy go zaseedować danymi na demo.
- **Marketplace zamiast Slacka jako kanału:** na Slacku boty powtarzały w kółko to samo i łatwo było je zmanipulować.
- **Rdzeń to dwa negocjujące agenty.** Łowca okazji jest dodatkiem („niech będzie prościej, szybciej").
- **Podział pracy:** jedna osoba stawia Mercura i seed, druga spina agentów.
- **Zasady hackathonu:** wolno używać open source, initial commit może być po prostu z gotowego projektu.

## Scenariusz demo (2–3 min)

1. Kupujący wpisuje: „Szukam 20 laptopów" albo „20 MacBooków, 30 Lenovo, 10 HP".
2. Na ekranie RFQ trafia do 2–3 sprzedawców.
3. Na żywo widać log negocjacji: oferta, kontroferta, oferta końcowa.
4. Porównanie ofert i licznik oszczędności.
5. Kupujący klika „Akceptuj", a zamówienie pojawia się w panelu Mercura (admin i panel sprzedawcy).

## Kryteria sukcesu (wg jurora)

- Krok dalej niż „AI zamawia jedną rzecz": agent kupującego negocjuje z agentem sklepu, który ma dostęp do inventory.
- Realna akcja w innym sofcie (zamówienie w Mercurze), nie tylko tekst albo mail.
- Skala: jedno zapytanie do wielu sprzedawców naraz.
- Widoczna wartość: wynegocjowana cena i zaoszczędzony czas.

## Otwarte pytania

- **Runtime agentów:** w transkrypcie pada „grok" / „krokbot" / „globy". Trzeba ustalić, co to dokładnie jest.
- **Nasłuchiwanie:** jak agent sprzedawcy dowiaduje się o RFQ? Webhook lub subscriber w Mercurze (Medusa pod spodem) czy polling co minutę? Padło, że bot „wypada z pętli".
- **Kanał agent–agent:** czat w storefroncie, mail czy dedykowane API/MCP?
- **Akceptacja końcowa:** przycisk w UI czy mail?
- **Seed:** ilu sprzedawców, jakie produkty, ceny katalogowe i ceny minimalne. Gdzie trzymamy cenę minimalną i reguły rabatowe sprzedawcy?
- **Reguły cenowe sprzedawców:** cena minimalna, rabat za wolumen, maksymalny rabat.
- **Konkurencja na sali:** inny zespół też myśli o B2B. Juror ma sprawdzić, czy się nie dublujemy.
- **Eksport sesji:** padło „żebyśmy byli w stanie wyeksportować sesję". Do potwierdzenia, czy to wymóg hackathonu i czego dotyczy.
- **Do sprawdzenia:** czy w Mercurze jest już coś, co da się użyć jako flow zapytań ofertowych (RFQ / quotes).

## Odrzucone pomysły (kontekst)

- **Security / phishing:** agenci testujący pracowników, np. podmiana jednej cyfry w numerze konta w mailu do księgowej. Ryzyko reakcji „przecież to już robi X", bo istnieją gotowe narzędzia (np. Cyber Coach).
