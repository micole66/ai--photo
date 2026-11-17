# Snapshot: mercati "pop culture" Polymarket con YES pompato >80% ma risposta probabile NO

**Fonte dati:** Gamma API Polymarket (`https://gamma-api.polymarket.com/markets?tag_id=596&closed=false&active=true&order=volume24hr&ascending=false`), tag **596 = Culture / entertainment / pop culture**.
**Snapshot:** 2026-11-17, ordinamento per volume 24h, campione di ~45 mercati (offset 0–40).
**Nota metodologica:** il filtro `tag_slug`/`slug` sull'endpoint `/tags` viene ignorato dall'API (restituisce sempre i primi 100 tag); l'unico modo affidabile per isolare la pop culture è `tag_id=596` sull'endpoint `/markets` (o `/events`). Il prezzo è in `outcomePrices` (JSON `["YES","NO"]`); per i mercati neg-risk con "No Change" l'outcomes può essere `["Yes","No"]` con il NO che assorbe il "no change".

---

## 1. Correzione della premessa (importante)

Il criterio "YES > 80% pompato da hype" **non è sufficiente** nel mondo pop-culture: la maggior parte dei mercati con un lato >80% ha **NO** come lato alto, e NO è quasi sempre **corretto**. Esempi reali dallo snapshot:

| Mercato | Yes / No | Chi è >80% | Corretto? |
|---|---|---|---|
| Will the US confirm aliens exist before 2027? | 0.0135 / **0.9865** | NO | Sì (NO) |
| Will Jesus Christ return before 2027? | 0.0085 / **0.9915** | NO | Sì (NO) |
| GTA 6 launch postponed again? | 0.0115 / **0.9885** | NO | Sì (NO) |
| Will Tim Cook be next CEO of NVIDIA? | 0.035 / **0.965** | NO | Sì (NO) |
| Dune: Messiah top-grossing movie 2026 | 0.0005 / **0.9995** | NO | Sì (NO) |
| Elon Musk # tweets 240–259 (settimana) | 0.0005 / **0.9995** | NO | Sì (NO) |

Uno screen ingenuo "YES>80% = hype" produce quindi soprattutto **falsi positivi** (NO corretti). Il vero target sono i mercati dove **il lato YES è quello >80%** e la narrativa batte il base rate.

---

## 2. Candidati reali: YES > 80% pompato da hype, NO probabile

Prezzi live al 2026-11-17. Ordinati per "fragilità" (quanto la narrativa regge il prezzo vs. base rate).

### A. Blockbuster / box office (i più chiari)
1. **Avengers: Doomsday — biggest domestic opening weekend in 2026** — **YES 0.83 / NO 0.17**
   - `oneMonthPriceChange: +0.265`, `oneYearPriceChange: +0.29` → pompato nel mese.
   - Tesi ribassista (NO): un singolo weekend d'apertura è volatile; Spider-Man, Dune e altri blockbuster possono sorpassare; il +26.5% in un mese sa di momentum/hype, non di fundamentals.
   - Volume 24h ~$11k, liquidità ~$17k → mercato sottile, facile da muovere.
2. **Spider-Man: Brand New Day — top-grossing movie of 2026** — **YES 0.905 / NO 0.095**
   - `oneYearPriceChange: +0.62` → salita enorme.
   - Tesi ribassista (NO): "highest grossing" dipende dal calendar gross e dalla concorrenza; 90% è aggressivo per un film non ancora uscito; Avengers/Jurassic/Avatar possono superare.

### B. Premi / classifiche annuali (narrative-driven)
3. **Jensen Huang — #1 searched person on Google 2026** — **YES 0.13 / NO 0.87** → NO è il lato alto e corretto (controllo, non target).
4. **Jensen Huang — Top 5 most searched people 2026** — **YES 0.755 / NO 0.245** → YES ~75%, vicino alla soglia; candidato "YES quasi 80%" se sale.
5. **TIME Person of the Year 2026 (vari)** — e.g. Zohran Mamdani **YES 0.225 / NO 0.775** → NO alto; non target.

### C. Eventi "gossip" Jensen Huang (cluster, prezzi ~0.11–0.55)
6. **Jensen Huang divorce by Dec 31, 2026** — **YES 0.115 / NO 0.885** → NO alto e corretto.
7. **Jensen Huang divorce by Mar 31, 2027** — **YES 0.265 / NO 0.735**.
8. **Fourth Jensen Huang affair reported by Dec 31** — **YES 0.455 / NO 0.545** → near coin-flip; la "quarta" relazione non è confermata.
9. **Jensen Huang admits another affair by Dec 31** — **YES 0.335 / NO 0.665**.
10. **Will 3 / 4 Jensen Huang affairs be reported by Dec 31** — YES 0.555 / 0.245.
    - Lettura: qui YES è **sottovalutato** (non pompato). Sono candidati opposti (YES cheap), non target del tuo screen.

### D. Console / gaming
11. **GTA VI released by Nov 30** — **YES 0.995 / NO 0.005** → YES è **corretto** (gioco atteso 19 nov). Non target.

---

## 3. Sintesi operativa

- **YES>80% con NO probabile (veri target):** Avengers: Doomsday best opening weekend (0.83), Spider-Man: Brand New Day top-grossing (0.905).
- **YES>80% ma YES corretto (NON target):** GTA VI released by Nov 30 (0.995).
- **NO>80% corretto (NON target, la maggioranza):** aliens, Jesus, GTA postponed, CEO candidates, tweet buckets, Dune top-grossing.
- **YES basso/coin-flip (opposto del target, eventualmente YES cheap):** cluster Jensen Huang affair/divorce.

**Caveat:** snapshot di un solo istante; i prezzi possono cambiare in ore. "Hype" non è misurabile dal solo prezzo: serve confrontare `oneDayPriceChange`/`oneMonthPriceChange`/`oneYearPriceChange` con il base rate dell'evento. Stimare il payoff del NO come (1 − YES), e considerare fee (`culture_fees` 5% taker) e spread.

**Disclaimer:** non è consulenza finanziaria. Mercati illiquidi con fee alte e spread ampi; il "value" del NO può essere eroso da fee e slippage.