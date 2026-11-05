# Pitch deck

- `index.html`: źródło prezentacji, 5 slajdów. Edytujesz tylko ten plik.
- `pitch.pdf`: wersja dla jurorów, generowana z `index.html`. Nie edytuj jej ręcznie.

## Podgląd

Otwórz `index.html` w przeglądarce. Strzałki ← → przełączają slajdy, `F` włącza pełny ekran. Numer slajdu jest w adresie (`#3`).

## Edycja

- Każdy slajd to jeden `<section class="slide">` w kolejności 01–05. Teksty zmieniasz bezpośrednio w HTML.
- Slajd ma stały rozmiar 1600×900 i skaluje się do okna. Po zmianie sprawdź, czy tekst nie nachodzi na stopkę.
- Kolory są w zmiennych CSS na górze pliku (`--purple`, `--orange` itd.).
- Liczby na slajdzie 3 (273 400 → 248 600 zł) pochodzą z przebiegu F05 w trybie reguł. Po przebiegu z Grokiem podmień je.

## PDF po zmianach

```bash
./scripts/pitch-pdf.sh
```

Potem obejrzyj `pitch.pdf` i zacommituj oba pliki razem.
