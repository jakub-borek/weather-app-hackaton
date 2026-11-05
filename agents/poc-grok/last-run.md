# PoC Grok: ostatni przebieg negocjacji

Plik nadpisuje `bun agents/poc-grok/negotiate.ts`. Logika i decyzje: `README.md` obok.

- Runtime: mock (deterministyczna strategia, bez modelu)
- Start: 5.11.2026, 19:41:01, czas całości: 0.0 s
- Zapytanie: „20 MacBooków, 30 Lenovo, 10 HP", max 3 rundy na sprzedawcę
- Wywołania modelu: 19
- Ruchy odrzucone przez backend lub parser: 4 (BELOW_MIN_PRICE: 4)

## Wynik

| Sprzedawca | Status | Rundy | Oferta końcowa | Suma | Wg cennika | Oszczędność |
|---|---|---|---|---|---|---|
| TechHurt | final | 3 | 20× Apple MacBook Air po 4390 zł, 15× Lenovo ThinkPad T14 po 4020 zł, 8× HP EliteBook 840 po 4330 zł | 182 740 zł | 194 070 zł | 11 330 zł (5.8%) |
| LaptoPol | final | 3 | 30× Lenovo ThinkPad T14 po 3950 zł, 10× HP EliteBook 840 po 4190 zł | 160 400 zł | 177 600 zł | 17 200 zł (9.7%) |
| iStacja | final | 3 | 20× Apple MacBook Air po 4290 zł | 85 800 zł | 95 800 zł | 10 000 zł (10.4%) |

## Przebieg (z myślami agentów)

### TechHurt (styl: twardy)

1. **sprzedawca · offer**: 20× Apple MacBook Air po 4500 zł, 15× Lenovo ThinkPad T14 po 4160 zł, 8× HP EliteBook 840 po 4490 zł. „Proponujemy: 20 szt. po 4500 zł, 15 szt. po 4160 zł, 8 szt. po 4490 zł."
   - myśl agenta: Styl twardy: otwieram cennikiem z rabatem wolumenowym, ilość ograniczam do stanu.
2. **kupujący · counter**: 20× Apple MacBook Air po 4230 zł, 15× Lenovo ThinkPad T14 po 3910 zł, 8× HP EliteBook 840 po 4220 zł. „Konkurencja daje lepiej. Proponujemy: 4230 zł, 3910 zł, 4220 zł."
   - myśl agenta: variant_mba: oferta 4500, konkurencja 4500, proponuję 4230; variant_t14: oferta 4160, konkurencja 4080, proponuję 3910; variant_hp840: oferta 4490, konkurencja 4410, proponuję 4220
3. **sprzedawca · counter**: 20× Apple MacBook Air po 4420 zł, 15× Lenovo ThinkPad T14 po 4090 zł, 8× HP EliteBook 840 po 4410 zł. „Proponujemy: 20 szt. po 4420 zł, 15 szt. po 4090 zł, 8 szt. po 4410 zł."
   - myśl agenta: Styl twardy: oddaję 30% różnicy do kontroferty.
4. **kupujący · counter**: 20× Apple MacBook Air po 4150 zł, 15× Lenovo ThinkPad T14 po 3840 zł, 8× HP EliteBook 840 po 4150 zł. „Konkurencja daje lepiej. Proponujemy: 4150 zł, 3840 zł, 4150 zł."
   - myśl agenta: variant_mba: oferta 4420, konkurencja 4290, proponuję 4150; variant_t14: oferta 4090, konkurencja 3960, proponuję 3840; variant_hp840: oferta 4410, konkurencja 4280, proponuję 4150
5. **sprzedawca · final**: 20× Apple MacBook Air po 4340 zł, 15× Lenovo ThinkPad T14 po 4020 zł, 8× HP EliteBook 840 po 4330 zł. „Ostateczna propozycja: 20 szt. po 4340 zł, 15 szt. po 4020 zł, 8 szt. po 4330 zł."
   - myśl agenta: Styl twardy: oddaję 30% różnicy do kontroferty.
   - ✗ odrzucone: `BELOW_MIN_PRICE`: Cena 4340 < minimum dla variant_mba
6. **sprzedawca · final** (próba 2): 20× Apple MacBook Air po 4390 zł, 15× Lenovo ThinkPad T14 po 4020 zł, 8× HP EliteBook 840 po 4330 zł. „Ostateczna propozycja: 20 szt. po 4390 zł, 15 szt. po 4020 zł, 8 szt. po 4330 zł."
   - myśl agenta: Styl twardy: oddaję 30% różnicy do kontroferty, po odrzuceniu podnoszę do minimum.

### LaptoPol (styl: wolumenowy)

1. **sprzedawca · offer**: 30× Lenovo ThinkPad T14 po 4080 zł, 10× HP EliteBook 840 po 4410 zł. „Proponujemy: 30 szt. po 4080 zł, 10 szt. po 4410 zł."
   - myśl agenta: Styl wolumenowy: otwieram cennikiem z rabatem wolumenowym, ilość ograniczam do stanu.
2. **kupujący · counter**: 30× Lenovo ThinkPad T14 po 3840 zł, 10× HP EliteBook 840 po 4150 zł. „Konkurencja daje lepiej. Proponujemy: 3840 zł, 4150 zł."
   - myśl agenta: variant_t14: oferta 4080, konkurencja 4160, proponuję 3840; variant_hp840: oferta 4410, konkurencja 4490, proponuję 4150
3. **sprzedawca · counter**: 30× Lenovo ThinkPad T14 po 3960 zł, 10× HP EliteBook 840 po 4280 zł. „Proponujemy: 30 szt. po 3960 zł, 10 szt. po 4280 zł."
   - myśl agenta: Styl wolumenowy: oddaję 50% różnicy do kontroferty.
4. **kupujący · counter**: 30× Lenovo ThinkPad T14 po 3720 zł, 10× HP EliteBook 840 po 4020 zł. „Konkurencja daje lepiej. Proponujemy: 3720 zł, 4020 zł."
   - myśl agenta: variant_t14: oferta 3960, konkurencja 4090, proponuję 3720; variant_hp840: oferta 4280, konkurencja 4410, proponuję 4020
5. **sprzedawca · final**: 30× Lenovo ThinkPad T14 po 3840 zł, 10× HP EliteBook 840 po 4150 zł. „Ostateczna propozycja: 30 szt. po 3840 zł, 10 szt. po 4150 zł."
   - myśl agenta: Styl wolumenowy: oddaję 50% różnicy do kontroferty.
   - ✗ odrzucone: `BELOW_MIN_PRICE`: Cena 3840 < minimum dla variant_t14
6. **sprzedawca · final** (próba 2): 30× Lenovo ThinkPad T14 po 3950 zł, 10× HP EliteBook 840 po 4190 zł. „Ostateczna propozycja: 30 szt. po 3950 zł, 10 szt. po 4190 zł."
   - myśl agenta: Styl wolumenowy: oddaję 50% różnicy do kontroferty, po odrzuceniu podnoszę do minimum.

### iStacja (styl: elastyczny)

1. **sprzedawca · offer**: 20× Apple MacBook Air po 4500 zł. „Proponujemy: 20 szt. po 4500 zł."
   - myśl agenta: Styl elastyczny: otwieram cennikiem z rabatem wolumenowym, ilość ograniczam do stanu.
2. **kupujący · counter**: 20× Apple MacBook Air po 4230 zł. „Konkurencja daje lepiej. Proponujemy: 4230 zł."
   - myśl agenta: variant_mba: oferta 4500, konkurencja 4500, proponuję 4230
3. **sprzedawca · counter**: 20× Apple MacBook Air po 4230 zł. „Proponujemy: 20 szt. po 4230 zł."
   - myśl agenta: Styl elastyczny: oddaję 100% różnicy do kontroferty.
   - ✗ odrzucone: `BELOW_MIN_PRICE`: Cena 4230 < minimum dla variant_mba
4. **sprzedawca · counter** (próba 2): 20× Apple MacBook Air po 4290 zł. „Proponujemy: 20 szt. po 4290 zł."
   - myśl agenta: Styl elastyczny: oddaję 100% różnicy do kontroferty, po odrzuceniu podnoszę do minimum.
5. **kupujący · counter**: 20× Apple MacBook Air po 4030 zł. „Konkurencja daje lepiej. Proponujemy: 4030 zł."
   - myśl agenta: variant_mba: oferta 4290, konkurencja 4420, proponuję 4030
6. **sprzedawca · final**: 20× Apple MacBook Air po 4030 zł. „Ostateczna propozycja: 20 szt. po 4030 zł."
   - myśl agenta: Styl elastyczny: oddaję 100% różnicy do kontroferty.
   - ✗ odrzucone: `BELOW_MIN_PRICE`: Cena 4030 < minimum dla variant_mba
7. **sprzedawca · final** (próba 2): 20× Apple MacBook Air po 4290 zł. „Ostateczna propozycja: 20 szt. po 4290 zł."
   - myśl agenta: Styl elastyczny: oddaję 100% różnicy do kontroferty, po odrzuceniu podnoszę do minimum.
