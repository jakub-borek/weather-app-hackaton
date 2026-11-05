# Marketplace RFQ z negocjacją agentów

Hackathon. Marketplace na open source Mercurze, w którym agent kupującego negocjuje z agentami sprzedawców, a człowiek akceptuje wynik i powstaje zamówienie.

- **Co budujemy:** [`product.md`](product.md)
- **Jak pracujemy (ludzie i agenci):** [`AGENTS.md`](AGENTS.md)

## Start

```bash
git clone https://github.com/jakub-borek/weather-app-hackaton.git
cd weather-app-hackaton
./init.sh
```

`./init.sh` sprawdza środowisko i pokazuje stan zespołu: kto co robi, co jest gotowe, co można wziąć.

## Co gdzie jest

| Plik | Po co |
|---|---|
| `feature_list.json` | feature'y F00–F13: status, owner, zależności, evidence |
| `progress.md` | stan na teraz, blok na każdy strumień |
| `session-handoff.md` | checkpoint całego zespołu |
| `harness/journal/` | historia pracy każdej osoby (`./scripts/log.sh`) |
| `harness/sessions/` | wyeksportowane sesje agentów |
| `scripts/status.sh` | stan zespołu w jednym widoku |
