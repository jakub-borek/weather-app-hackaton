# Negocjator w Grok Bocie: konfiguracja (F06)

Agent kupującego to Grok Bot o nazwie **Negocjator**. Kupujący pisze do niego w aplikacji Grok Bot (desktop albo iOS),
na przykład: „Potrzebuję 20 MacBooków Air, 30 ThinkPadów T14 i 10 EliteBooków. Mam 250 tys. netto. Wróć z ofertą."

Cały harness jest w [`PLAYBOOK.md`](PLAYBOOK.md). W Grok Bocie wklejasz tylko poniższy krótki prompt. Bot pobiera
playbook z GitHuba na początku każdej rozmowy, więc zmiana zachowania to commit do `PLAYBOOK.md`, bez ponownego
wklejania.

## 1. Utwórz bota

W aplikacji Grok Bot dodaj nowego bota do floty.

**Nazwa:** `Negocjator`

**Opis** (służy też do delegowania w flocie):

```text
Agent zakupowy B2B. Przyjmuje zamówienie (produkty, ilości, budżet), szuka produktów w naszym marketplace,
sprawdza ceny rynkowe w internecie, składa zapytanie ofertowe (RFQ) i negocjuje cenę ze sprzedawcami.
Wraca z najlepszą ofertą do akceptacji przez człowieka. Nigdy sam nie akceptuje zakupu.
```

**Prompt** (wklej, uzupełnij `API` i `PK`, niczego więcej nie dopisuj):

```text
Jesteś Negocjatorem, agentem zakupowym B2B.

Na początku KAŻDEJ rozmowy, zanim cokolwiek odpowiesz, pobierz w terminalu swój playbook i postępuj dokładnie według niego:
curl -s https://raw.githubusercontent.com/jakub-borek/weather-app-hackaton/main/agents/negocjator/PLAYBOOK.md

Playbook ma pierwszeństwo przed twoimi nawykami. Jeśli nie da się go pobrać, powiedz to człowiekowi i nie negocjuj.

Konfiguracja (ustaw jako zmienne w terminalu, nie wypisuj PK w czacie):
API=<adres backendu marketplace, np. https://xxxx.ngrok-free.app>
PK=<publishable key z logu seeda>

Nigdy nie akceptujesz oferty. Decyzja o zakupie należy do człowieka.
```

`PK` to klucz publiczny sklepu, nie sekret, ale i tak nie trzymamy go w repo. Bierzesz go z logu seeda albo od S1.

## 2. Wystaw backend publicznie

Grok Bot działa w chmurze, więc nie widzi `localhost`. Backend Mercura (port 9000) musi mieć publiczny adres:

```bash
ngrok http 9000
```

Adres z ngroka wpisz jako `API` w prompcie. Restart ngroka zmienia adres, więc wtedy trzeba poprawić prompt.
Lepsza opcja: stała domena z darmowego konta ngrok (`ngrok http --url=<twoja-domena> 9000`).

Agenci sprzedawców muszą działać w tym samym czasie: `bun agents/seller-agent.ts`.

## 3. Test (5 minut)

1. Sprawdź, czy bot widzi backend. Napisz do Negocjatora: „Sprawdź połączenie: wywołaj GET $API/store/products?limit=1
   i powiedz, ile produktów zwrócił." Oczekiwany wynik: bot podaje liczbę produktów.
2. Pełny przebieg: „Potrzebuję 20 MacBooków Air i 10 HP EliteBooków, budżet 130 tys. netto. Wróć z ofertą."
3. Sprawdź:
   - bot podał ceny rynkowe ze źródłami,
   - w backendzie jest RFQ z negocjacjami u co najmniej 2 sprzedawców (`GET /store/rfqs/<id>`),
   - w wiadomościach kupującego są argumenty z cenami rynkowymi,
   - bot wrócił z raportem i **nie** zaakceptował oferty.
4. Zapisz czas od wiadomości do raportu i liczbę rund. Wpisz to do evidence F06 w `feature_list.json`.

## Znane ograniczenia

- **Tempo:** jeden krok Grok Bota to 5–40 s. Research cen i 3 rundy to kilka minut. Na demo uruchom Negocjatora
  na początku prezentacji i wróć do niego na koniec.
- **Krótkie tury:** bot potrafi przerwać po około minucie. Stan negocjacji jest w backendzie, więc wystarczy napisać
  „kontynuuj" (playbook, krok 5).
- **`accept_token`:** `POST /store/rfqs` zwraca token temu, kto tworzy RFQ, czyli tu botowi. Tego, że bot go nie
  użyje, pilnuje na razie tylko playbook. Do poprawy w backendzie (S2), zob. journal `jkurylak`.
