# Lorum Club Online

Potpuna multiplayer MVP verzija Loruma za 4 igrača.

## Funkcionalnosti
- Kreiranje sobe i ulazak kodom
- Točno 4 igrača
- Socket.IO real-time sinkronizacija
- Autoritativni server: server provjerava poteze i čuva skrivene karte
- Reconnect preko lokalno spremljenog session ID-a
- 7 miniigara
- Dealer ostaje isti svih 7 miniigara
- Prvi igra igrač nakon dealera
- NIZ s početnim rangom koji određuje prvi igrač
- Dark/light tema
- 8 u nizu ili 2×4 raspored ruke
- Isključivi efekti na posebnim kartama/događajima
- Responsive prikaz za mobitel

## Lokalno pokretanje

Trebaš Node.js 20 ili noviji.

```bash
npm install
npm start
```

Otvori:

```text
http://localhost:3000
```

Za test 4 igrača otvori četiri različita browser prozora ili privatna prozora.

## Deploy na Railway

1. Napravi novi GitHub repozitorij.
2. Uploadaj sve datoteke iz ove mape.
3. Na Railwayu odaberi **New Project → Deploy from GitHub repo**.
4. Odaberi repozitorij.
5. Railway će automatski pokrenuti `npm start`.
6. U Railway postavkama generiraj javnu domenu.

Baza podataka nije potrebna za ovu verziju. Aktivne sobe se čuvaju u memoriji servera i nestaju pri restartu deploya.

## Važna napomena
Projekt je MVP. Za produkcijsku verziju preporučeni sljedeći koraci su:
- Redis adapter za više server instanci
- PostgreSQL za račune, statistiku i povijest partija
- timer poteza
- host transfer nakon disconnecta
- automatsko čišćenje starih soba
- testovi game enginea
