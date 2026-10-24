# Bahn (bahnexpress.fi) and the operations of driven-car delivery: dossier and AI opportunity map

Research date: 2026-10-24 (hackathon day 1). Hackathon MCP check: `list_partners` lists Bahn as a challenge partner ("Europe's fastest car transport for dealers and fleets: a fixed price, one driver per car, delivered in days"). `list_challenges` returned `revealed: false`, so the brief was not yet public when these notes were written.

Method note: on top of web sources, I downloaded the public client JS bundle of Bahn's customer/driver/carrier portal (`https://app.bahnexpress.fi`, 37 Next.js chunks) and grepped its Zod enums and constants. These enum names show the shape of Bahn's internal data model, but they are **inference from code identifiers**, not company statements. They are marked "[bundle]" below.

---

## Q1. What exactly does Bahn sell, to whom, where, at what price, and who runs it?

### Takeaway
Bahn (legal name Oy Bahn Express Ab, founded Jan 2024, Helsinki) sells B2B car moves at a fixed price, with one freelance driver per car. Customers are used-car dealers, importers, brokers, leasing and rental fleets, with some private pickups and home deliveries. The core business is driving imports from Germany and Sweden into Finland and Denmark, plus domestic moves in Finland, Denmark and Germany. It has since added a truck-load marketplace for 7–8-car carriers across Europe. It is small but growing fast: 2025 revenue was about €4.4M with an operating loss of about €1.4M, and the company claims €20M ARR and 20% month-on-month growth in 2026. CEO Matias Blomberg and CTO Leevi Jäkälä run it. Its own code suggests a fairly mature ops platform, with driver tiers, LLM-graded driver onboarding, an expense ledger, ferry-leg routing and damage cases.

### Cited Findings

**Identity, people, size**
- Legal entity Oy Bahn Express Ab. VAT FI34148134. Address Erottajankatu 5 C, 00130 Helsinki. The brand now shows as "Bahn" (the about page title is "About us · Bahn"). — [bahnexpress.fi](https://bahnexpress.fi); [bahnexpress.com/about](https://www.bahnexpress.com/about)
- Y-tunnus 3414813-4, founding date 16.1.2024. — [Vainu](https://search.vainu.com/company/oy-bahn-express-ab-taloustiedot-ja-liikevaihto/FI34148134/yritystiedot)
- Team on the about page: Matias Blomberg (co-founder & CEO), Leevi Jäkälä (co-founder & CTO), Antti Aalto (Sales), Sakari Vanhanen (Operations). Sales contacts: Janne Lehtinen and Suvi-Tuuli Ruohonen (Commercial partnerships). Carrier/truck ops contacts: Emil Dürr, Erica Väyrynen and Sakari Vanhanen, with a Danish phone number (+45). — [bahnexpress.fi/tietoa-meista](https://bahnexpress.fi/tietoa-meista); [bahnexpress.fi](https://bahnexpress.fi); [bahnexpress.fi/kuljetusliikkeet](https://bahnexpress.fi/kuljetusliikkeet)
- Founder conflict: Feb/Mar 2025 pre-seed coverage names **Atte Vesala** as co-founder ([Vestbee](https://vestbee.com/blog/articles/bahn-express-raises-920-k); [EU-Startups](https://www.eu-startups.com/2025/02/bahn-express-lands-e920k-to-slash-used-car-delivery-times-from-weeks-to-days/)). The Dec 2025 and 2026 coverage and the company site name **Leevi Jäkälä** ([Startbase](https://www.startbase.com/news/bahn-express-sichert-sich-e5-millionen-zur-europaweiten-expansion/); [kuljetusnet.fi](https://kuljetusnet.fi/bahn-express-eurorahoituksella-euroopan-laajuiseen-autosiirtoon.html)).
- Headcount and offices: about 30 employees, with offices in Helsinki, Copenhagen and Berlin (Dec 2025). — [Startbase](https://www.startbase.com/news/bahn-express-sichert-sich-e5-millionen-zur-europaweiten-expansion/). Asiakastieto/Vainu register data shows 10 employees for FY2025, which likely counts only the Finnish entity's payroll. — [Asiakastieto](https://www.asiakastieto.fi/yritykset/fi/oy-bahn-express-ab/34148134/rating-alfa_SV)
- CEO LinkedIn activity (search snippet; the page itself returned HTTP 999): a personal €1,000 referral bonus for successful hires, and a repost announcing a "Head of Strategy and Operations, Germany" hire. — [LinkedIn: Matias Blomberg](https://fi.linkedin.com/in/matias-blomberg). Another snippet mentions Bahn hiring "product-minded developers" on-site in Helsinki. — [LinkedIn: Sakari Vanhanen](https://fi.linkedin.com/in/vanhanen)

**Funding and financials**
- Pre-seed: €920k (reported 28 Feb – 3 Mar 2025) from Trind Ventures and Innovestor, with Wave Ventures and angels. Claims at the time: 1,500+ vehicles delivered, €150k monthly revenue, partnerships covering more than 70% of Finland's imported used-car market, about €400 saved per vehicle, stock turnover up 30%. — [Vestbee](https://vestbee.com/blog/articles/bahn-express-raises-920-k)
- Seed: €5M announced 17 Dec 2025, led by node.vc (partner Daniela Sjunnesson), with Trind, Innovestor and angels. — [Startbase](https://www.startbase.com/news/bahn-express-sichert-sich-e5-millionen-zur-europaweiten-expansion/). Named angels include Tuomo Riekki (Smartly co-founder) and Vincent Ho-Tin-Noe (Wolt CPO). Stated use of funds: grow the tech team and the platform in Finland, and expand into Germany, Denmark and Poland. — [kuljetusnet.fi](https://kuljetusnet.fi/bahn-express-eurorahoituksella-euroopan-laajuiseen-autosiirtoon.html)
- The careers page claims €20M ARR, 20% MoM growth, €6M raised from "Nordic investors and operators from platform unicorns such as Wolt", a €10B European used-car logistics market, and operations in FI, SE, DK and DE. Timeline: H1 2024 first routes DE/SE→FI; H2 2024 pre-seed; H1 2025 Denmark live; H2 2025 €5M seed and first German hires; H1 2026 German country team, 20% MoM sustained. — [bahnexpress.com/careers](https://www.bahnexpress.com/careers)
- A Copenhagen Ops Associate posting (now inactive) gives monthly revenue milestones: H2 2024 €150k, H1 2025 €400k, H1 2026 above €1M. — [The Hub](https://thehub.io/jobs/6a195d602d5abfe5b6a351cf)
- Register data: 2025 revenue about €4.4M (+580%), operating loss about −€1.4M (−30.7% margin), equity ratio 92%. — [Asiakastieto](https://www.asiakastieto.fi/yritykset/fi/oy-bahn-express-ab/34148134/rating-alfa_SV) (seen through a search snippet; I did not buy the full report)
- The two revenue claims are hard to reconcile. "Above €1M/month in H1 2026" is roughly a €12M+ run rate, against "€20M ARR" on the careers page. That only fits if growth continued through H2 2026, or if "ARR" means gross bookings.

**What it sells**
- Services: dealership branch-to-branch transfers (same-day pickup, fixed price per car); customer home deliveries with live tracking; private-seller pickups (the driver inspects and test-drives the car, and it is held until the buyer pays); rental and leasing fleet transfers and end-of-lease returns; domestic purchases (transfer plates and insurance included for unregistered cars); and imports from anywhere in Europe with CMR and VAT paperwork. Single-car moves only: "multiple cars are arranged as separate deliveries." — [bahnexpress.fi](https://bahnexpress.fi); [bahnexpress.com](https://www.bahnexpress.com)
- Ordering channels: portal, API (with webhooks), email, Excel, "or your own system". Domestic drivers are found "within minutes". A named Bahn person owns each order. — [bahnexpress.com](https://www.bahnexpress.com)
- Published SLAs: 86% of branch transfers within 1 day, the rest within 2; domestic purchases mostly within 1 day, 98% within 2; fleet and leasing 83% within 2 days; Sweden→Finland about 36 h on average; Germany→Finland under 3 days; 2-day average overall. — [bahnexpress.com](https://www.bahnexpress.com)
- Customers: the home page says "400+ dealerships and brokers" while the about page says "100+ dealerships in FI, DK, DE" (inconsistent). Named: Kamux, Autohuset Vestergaard, Forza Leasing ([bahnexpress.fi](https://bahnexpress.fi)), plus J. Rinta-Jouppi and Kiesi ([kuljetusnet.fi](https://kuljetusnet.fi/bahn-express-eurorahoituksella-euroopan-laajuiseen-autosiirtoon.html)).
- Kamux case study: transport took about 2 weeks before Bahn and now about 3 days from Sweden and about 5 days from Germany. Bahn's digital CMR is needed for Kamux's complaints to sellers. Quote: "The faster we get cars to our showroom, the more profit we make." — [bahnexpress.fi/tarinat/kamux](https://bahnexpress.fi/tarinat/kamux)
- [bundle] Customer-specific pricing profiles are an enum: DEFAULT, AAMPERE, IMPEC, K_AUTO, HIGH_INTRA_GER, KM_PRICING, KM_PRICING_FIXED, KAMUX_GERMANY, KAMUX_FINLAND, STERN_WAGEN, ROAD_SURFER, RJA, SAKA, AUDI_ZENTRUM_AJA, VAIHTOAUTOMAA, MUG_PKW, WETTERI, PS_AUTOMOBILE, BILAR99, LANSIAUTO, VEHO, TRANSIETT, HEDIN, KVD, EUROPCAR, DINBILAUKTION, INTERNAL_CARS, NORD_AUTOMOTIVE, AUTOZENTRUM_HANDEWITT, MIND2MOVE, OUTLET_CARS, ECARS_TRADE, SELECTED_CAR_GROUP, **FRANCE_LAUNCH**. — [app.bahnexpress.fi JS bundle](https://app.bahnexpress.fi). So per-customer rate cards exist (Europcar, Roadsurfer, Hedin, Veho, Kamux DE/FI, KVD and others), and a France launch is being prepared.

**Pricing**
- No public price list. The customer gets a fixed price at quote time: "no auctions, bidding, or later surcharges". Each vehicle is insured up to €100k in transit. — [bahnexpress.com](https://www.bahnexpress.com)
- The terms add fees and liability caps. Waiting: first 45 min free, then €25 per half hour per vehicle for driven moves (€50 by truck), capped at the empty-pickup fee. Empty pickup: full price if the cause is on the customer side (no keys, no documents, unroadworthy car, nobody present). Customer cancellation: free until a driver is assigned, then 100%. Invoices due in 7 days. Liability: transfer plates, up to the lower of market value or €100k, underbody excluded. Windshield cracks are covered *only if the pickup photo clearly shows no crack*. Existing plates: €5k plus bonus loss. Exclusions: stone chips, punctures, minor paint damage, mechanical faults. Damage must be claimed by email **within 1 business day** of delivery (CMR hidden damage 7 days, delay 21 days), and **the burden of proof is on the customer**. Disputes go to arbitration in Helsinki. Traffic fines, tolls and parking are *not addressed*, except that fines caused by missing plates or insurance fall on the customer. — [bahnexpress.fi/ehdot](https://bahnexpress.fi/ehdot)
- [bundle] Surcharge types: EMPTY_PICKUP_FEE, BASIC_VAN_HEIGHT_FEE, TALL_VAN_HEIGHT_FEE, PRIVATE_PICKUP_FEE, TRADE_IN_VEHICLE_FEE, CUSTOMER_DELIVERY_FEE, VEHICLE_INSPECTION_FEE, TRADE_PLATES_FEE, SAME_DAY_DELIVERY_FEE, plus SERVICE_LEVEL_DISCOUNT. A trade-in leg means one driver delivers a car and brings the customer's trade-in back. — [app.bahnexpress.fi bundle](https://app.bahnexpress.fi)
- Truck marketplace ("Täytä rekkasi", /kuljetusliikkeet): full 7–8-car loads from large dealers, at a reference price or the carrier's own bid. Examples: Toulouse→Antwerp 8 cars €2,300; Madrid→Vejle 8 cars €4,200; Kolding→Hannover 7 cars €1,200; Malmö→Roeselare 8 cars €2,900. Payment terms depend on evidence: net 30 by default, net 14 after three clean loads, net 60 for delays, missing photos or documents, or damage. Carriers must upload time-stamped photos of all four sides, windshield, tyres, keys and damage, plus a signed CMR, the same day. — [bahnexpress.fi/kuljetusliikkeet](https://bahnexpress.fi/kuljetusliikkeet)

**Drivers: recruiting, dispatch, pay, return legs**
- Driver numbers: 5,000+ signed up, cars collected from 25 countries, 4.8/5 driver rating ([bahnexpress.fi/kuljettajat](https://bahnexpress.fi/kuljettajat)). Press says "500+ independent drivers" ([kuljetusnet.fi](https://kuljetusnet.fi/bahn-express-eurorahoituksella-euroopan-laajuiseen-autosiirtoon.html)). A 2025 job ad said 300+ in FI and DE (search snippet). These are registered vs active counts, so they diverge.
- Requirements: age 19+, licence held 1+ year with a clean record, self-employed status, smartphone. Process: download the Bahn Driver app, apply, pass an online course and a driver test. Drivers pick jobs in an app marketplace that shows route, car, distance, timing and fixed pay before acceptance. Pay is weekly via **Truster** (3.5% fee, insurance included). Example: €50 per domestic trip, 8 trips = €400 gross. Most drivers are part-time students. Support: in-app chat on weekdays, phone line evenings, nights and weekends. — [bahnexpress.fi/kuljettajat](https://bahnexpress.fi/kuljettajat)
- **Return legs.** Domestic: public transport is *not* reimbursed, because "trips are chained" and the delivery point usually offers a return car, or the driver books a bundled trip with a return car. Cross-border: public transport, flights, ferries, hotels, fuel and charging are reimbursed. — [bahnexpress.fi/kuljettajat](https://bahnexpress.fi/kuljettajat)
- Duunitori ads (Jul–Aug 2026) advertise €10–25/h for freelance transfer drivers in Jyväskylä, Hyvinkää, Lappeenranta, Masku, Kerava, Pietarsaari, Lempäälä, Kotka, Porvoo and elsewhere. — [Duunitori](https://duunitori.fi/tyopaikat/tyo/auton-kuljettaja-sdsuu-20471709)
- Driver sentiment (anonymous Suomi24 thread, May–Oct 2026, unverified):
  - Helsinki→Hyvinkää paid €25 and "you buy your own ticket home"; a Lahti trip paid €43; Germany trips pay €200–300 for 3–4 days.
  - One driver estimated €4–5/h net after unpaid time and costs. Others report €17–25/h.
  - Jobs "often appear in big batches at the same time".
  - Drivers report a €200 cancellation fee and a deductible of up to €2,000, and say support is slow.
  - Foreign-trip drivers are found via Telegram. There are allegations of points for app-store reviews. Some VR staff reportedly drive for Bahn using their staff travel cards.
  — [Suomi24](https://keskustelu.suomi24.fi/t/19415536/bahn-express-oy-kokemuksia)
- [bundle] **Driver tier and score system.** Initial score 1900. Internal tiers: Probation/Building/Basic/Trusted/Elite. Driver-facing tiers: recovery/basic/priority/elite. Gig points: intra-country 100, import to FI or DK 150, FI–SE 50, cross-country 100. Score events: GIG_COMPLETED, GIG_POINTS_REVOKED, WARNING_APPLIED, MANUAL_CORRECTION. Priority gigs give tier ≥3 drivers **180 minutes of early access** (60 min at short notice). Gig pay mode is **FIXED or AUTO_INCREASE**, which suggests pay escalates when a gig stays unfilled. — [app.bahnexpress.fi bundle](https://app.bahnexpress.fi)
- [bundle] **Automated driver vetting with a model.** Check codes: LICENCE_VALID, LICENCE_IDENTITY_MATCH, DRIVING_RECORD_CLEAR, BACKGROUND_CHECK_CLEAR, INTRO_VIDEO_VALID, INTRO_VIDEO_FINNISH, VIDEO_Q1–Q3, each PASS/FAIL. Failure reasons include EVIDENCE_UNREADABLE, IDENTITY_UNASSESSABLE, VIDEO_LANGUAGE_UNASSESSABLE and **MODEL_OUTPUT_INCOMPLETE**. So an LLM or vision model already grades applicant IDs, licences and recorded video answers. — [app.bahnexpress.fi bundle](https://app.bahnexpress.fi)
- [bundle] **German driver onboarding pipeline:** LEAD_CAPTURED → QUESTIONNAIRE_COMPLETED → AWAITING_POA_SIGNATURE → POA_SIGNED → BACKGROUND_CHECKED → GEWERBE_FILED → GEWERBE_RECEIVED → INSURANCE_REQUESTED → INSURANCE_ISSUED → PLATES_FILED → PLATES_READY → PLATES_PICKED_UP → ACTIVE. Rejection reasons include NO_GEWERBE, NO_RED_PLATES, NO_EVB, NO_SELF_EMPLOYMENT and LANGUAGE. The insurer or broker is MARTENS_PRAHL. In Germany each driver apparently needs a trade registration (Gewerbe) and their own red transfer plates with an eVB insurance number, and Bahn acts under a power of attorney (POA). — [app.bahnexpress.fi bundle](https://app.bahnexpress.fi)
- [bundle] Driver deactivation reasons: FRAUD_OR_THEFT, IDENTITY_OR_DOCUMENT_FRAUD, ABUSIVE_BEHAVIOUR, SAFETY_RISK, LOSS_OF_TRUST, REPEATED_POLICY_VIOLATION. — [app.bahnexpress.fi bundle](https://app.bahnexpress.fi)

**Operational data model seen in the bundle [bundle]** — [app.bahnexpress.fi](https://app.bahnexpress.fi)
- Trip stages: NOT_STARTED → PLATES_PICKUP → VEHICLE_PICKUP → VEHICLE_DELIVERY → TRADE_IN_VEHICLE_PICKUP → TRADE_IN_VEHICLE_DELIVERY → FEEDBACK → CONFIRM_END_OF_DRIVE → COMPLETED. Order statuses include DRAFT, QUOTED, WAITING_FOR_PICKUP, IN_TRANSIT, PARTIALLY_PICKED_UP, PARTIALLY_DELIVERED, DELIVERED, CANCEL_REQUESTED, NEEDS_CARRIER.
- Photo slots: SIDE, WINDSHIELD, RIMS, VIN, PAPERWORK, ODOMETER, CMR, ACCESSORIES, KEYS, UNDERBODY. Images are tagged pickup, pickup damage, delivery, delivery damage, trade-in, plate pickup, plate return, key pickup, key delivery. Damage severity is graded (e.g. SEVERE). Vehicle source: FROM_WAREHOUSE, FROM_PREVIOUS_DRIVE, FROM_ANOTHER_DRIVER (plate and key hand-offs between drivers).
- **Ferry-aware cross-border routing modes:** DRIVING_DIRECT, DRIVING_DIRECT_PARTIAL, DRIVING_FINNLINES_TRV (Travemünde), DRIVING_FINNLINES_KAP (Kapellskär), DRIVING_VIKING_LINE_STO, DRIVING_STENA_LINE_ROK_[FINNLINES_KAP|SILJA_LINE_STO|VIKING_LINE_STO] (Rostock–Trelleborg plus a Baltic crossing). There are also unaccompanied "cargo" pickup and dropoff points: Finnlines Helsinki/Naantali/Kapellskär/Travemünde, Silja Line Helsinki/Turku/Stockholm, Viking Line Helsinki/Stockholm, Transfennica Hanko/Travemünde.
- Expense ledger types: BUS_TICKET, TRAIN_TICKET, TAXI, GAS_OR_ELECTRICITY, FLIGHT, SHIP, FREIGHT, HOTEL, TOLL, FERRY, PARKING, OTHER. Reconciliation states: PENDING/RECONCILED/EXPIRED/FAILED. Booking types: TRAIN_BUS_BOOKING, FLIGHT_BOOKING, HOTEL_BOOKING, FERRY_BOOKING. Refuel type: REFUELING/CHARGING. Fuel types include ELECTRIC and the hybrid variants. There is an incident string "Wrong Fuel Used".
- Case and incident events: ACCIDENT_OPENED/UPDATED, COVERAGE_CHECK_REQUESTED, PROOF_REQUESTED/REVIEWED/EDITED, DOCUMENT_FILED/APPROVED/REJECTED, CANCELLATION_[BROKER|DRIVER]_NOTIFIED, CALL_LOGGED, EMAIL_SENT/RECEIVED, ALARM_SET/CLEARED, RELOCATION_DECISION. Order sources: FUNNEL_V4, DELEGATED_V2, ONBOARDING_V1, BROKER_IMPORT, **BROKER_MAIL**, MANUAL. Some orders are evidently ingested from broker emails.
- Roles: DRIVER, BUYER, CUSTOMER_ADMIN, CARRIER_USER, CARRIER_ADMIN, DRIVE_ORGANIZER (dispatcher), BAHN_EXPRESS_ADMIN, DRIVER_RECRUITER.

**Tech stack hints** (from my HTTP and bundle inspection, 2026-10-24)
- Marketing site: Next.js on Vercel. Portal (app.bahnexpress.fi): Next.js static export on AWS S3 + CloudFront (Helsinki edge). Attachments go to an S3 bucket in eu-north-1 whose name looks like an AWS CDK stack (`s3attachmentsbucketstack-prod…`). api.bahnexpress.fi answers with `x-powered-by: Express` (Node). The client uses Zod schemas, better-auth, PostHog (EU and US), Intercom, Sentry, nuqs and motion. Other hosts referenced: `ops.bahnexpress.com` (internal ops console), `drive.bahnexpress.fi` (driver web) and `app.bahnexpress.dev` (staging). Customer webhooks are supported. — [app.bahnexpress.fi](https://app.bahnexpress.fi); [bahnexpress.fi](https://bahnexpress.fi)
- Jobs: the only open listing on 2026-10-24 is Head of Sales, Denmark ([bahnexpress.com/careers](https://www.bahnexpress.com/careers)). Earlier there were Ops Associate roles in Copenhagen and Berlin (Berlin described as "one of its most operationally complex markets"), covering daily transport coordination, driver support and onboarding, customer comms by phone, email and chat, and sourcing truck carriers ([The Hub](https://thehub.io/jobs/6a195d602d5abfe5b6a351cf)). The Berlin posting URL now returns 404.

### Inferences
- Bahn's moat is **speed for cross-border used-car imports into the Nordics**. Truck consolidation waits 10–30 days, while Bahn drives in 2–5 days. Dealers lose money every day a car sits (depreciation, capital cost, lost sale), so Bahn sells the saved time, not the cheaper move.
- Domestic business runs on **trip chaining** instead of paid return tickets. The optimisation burden (finding a return car near each delivery point) sits with Bahn's dispatch, and its unpaid slack (driver travel time and tickets) sits with drivers. That explains both the driver complaints and why chaining quality determines driver supply.
- The codebase looks like a fast-moving monolith with many versioned funnels (V0…V4 dated 2025-06 to 2026-08). There are many manual-review states (PROOF_REQUESTED, MANUAL_CORRECTION, CALL_LOGGED, ALARM_SET), so humans in ops still close most exceptions. At about 30 staff and claimed 20% MoM growth, **ops headcount scaling** is the obvious pressure point.
- Bahn already uses LLMs for driver onboarding checks. A brief like "put an LLM on X" would be table stakes for them. A non-trivial pitch should focus on optimisation, simulation, or verification of agent output.

### Gaps
- No public per-route price points for Bahn's driven service. Only carrier truck reference prices and anecdotal driver pay are public.
- No confirmed active-driver count, utilisation, cars per month, or share of domestic vs cross-border.
- I could not read LinkedIn posts directly (HTTP 999). The Berlin Ops job text is gone (404).
- The €20M ARR claim is not independently verifiable and conflicts with the register's 2025 revenue (€4.4M) and the job post's ">€1M/month in H1 2026".

---

## Q2. What is the unit-economics bottleneck of driveaway services, and what does the operation look like step by step?

### Takeaway
Every driveaway operator has the same economics: **one paid driver-hour per car-hour, plus the driver's unpaid or paid reposition back**. Margin is therefore set by (a) how much of the driver's day is spent moving a paying car vs travelling empty on transit, (b) how often trips can be chained so a delivery point becomes the next pickup, and (c) exception cost: waiting, empty pickups, damage disputes, fines, plates and paperwork. Trucks win on cost per car (7–8 cars per driver) and driven moves win on lead time. Bahn's fixed-price promise turns every one of these uncertainties into Bahn's own risk.

### Cited Findings
- Benchmark economics from Flovi (the Finnish market leader):
  - 2024: more than 100,000 transfers, about 23M km, about €12M group revenue. — [Tech.eu](https://tech.eu/2025/10/02/finnish-car-logistics-pioneer-flovi-rolls-into-poland/)
  - 2025: more than 160,000 transfers and about 35M km. — [Invest in Spain](https://www.investinspain.org/en/noticias-main/2026/flovi)
  - My arithmetic: about €120 revenue per transfer and about 220–230 km per transfer.
  - Flovi says its savings over in-house dealer logistics come "mainly by eliminating employee return costs". Customers pay per km actually driven. Delivery takes 12–42 h. — [Antyweb](https://antyweb.pl/finscy-spece-od-relokacji-pojazdow-chca-podbic-polske-jestesmy-uberem-dla-automotive)
- Bahn's driver cost side: €50 per domestic trip in the calculator ([bahnexpress.fi/kuljettajat](https://bahnexpress.fi/kuljettajat)). Anecdotal: €25 Helsinki→Hyvinkää, €43 to Lahti, €200–300 for a 3–4-day Germany trip ([Suomi24](https://keskustelu.suomi24.fi/t/19415536/bahn-express-oy-kokemuksia)). Cross-border trips also reimburse flights, ferries and hotels ([bahnexpress.fi/kuljettajat](https://bahnexpress.fi/kuljettajat)).
- Truck alternative per car, from Bahn's carrier reference prices (my arithmetic): Kolding→Hannover about €171/car, Toulouse→Antwerp about €288/car, Malmö→Roeselare about €363/car, Madrid→Vejle about €525/car. — [bahnexpress.fi/kuljetusliikkeet](https://bahnexpress.fi/kuljetusliikkeet)
- Value claim: vehicles can wait up to 40 days before they are ready for sale; Bahn claims savings of "several hundred euros per vehicle" and stock turnover up to 30% higher ([Startbase](https://www.startbase.com/news/bahn-express-sichert-sich-e5-millionen-zur-europaweiten-expansion/)), or about €400 per vehicle ([Vestbee](https://vestbee.com/blog/articles/bahn-express-raises-920-k)). The site's value calculator example shows €30,808/yr kept and +81.6 cars sold per year for one dealer. — [bahnexpress.fi](https://bahnexpress.fi)
- Bahn ran at a −30.7% operating margin in 2025 (−€1.4M on €4.4M). — [Asiakastieto](https://www.asiakastieto.fi/yritykset/fi/oy-bahn-express-ab/34148134/rating-alfa_SV)
- Why trucks are slow: trucks wait to fill or pass through several hubs, so lead time is 10–30 days. — [Startbase](https://www.startbase.com/news/bahn-express-sichert-sich-e5-millionen-zur-europaweiten-expansion/); [bahnexpress.fi/tietoa-meista](https://bahnexpress.fi/tietoa-meista)
- Exception cost levers in Bahn's own terms: waiting (45 min free, then €25 per 30 min), empty pickups, cancellation after assignment, windshield photo rule, 1-business-day claim window. — [bahnexpress.fi/ehdot](https://bahnexpress.fi/ehdot)
- Late-arriving liabilities exist on Bahn's key corridor. Swedish congestion tax (Stockholm and Gothenburg) applies to foreign-registered vehicles and is invoiced to the owner through EPASS24. Bills often arrive late, sometimes after the due date, with a SEK 500 penalty for late payment. — [Transportstyrelsen](https://www.transportstyrelsen.se/en/road/road-tolls/congestion-taxes-in-stockholm-and-goteborg/); [EVZ](https://www.evz.de/en/topics/transport/car/fines-abroad/congestion-charge-sweden/)
- In Finland, a camera-issued traffic fine (liikennevirhemaksu) goes to the vehicle owner/holder or the company's CEO if no named user is registered. The recipient escapes liability by naming the driver in an appeal (oikaisuvaatimus). — [Kaleva](https://www.kaleva.fi/poliisi-yrityksilla-ja-yhteisoilla-on-puutteellise/2767863); [Moottori](https://moottori.fi/liikenne/jutut/liikennevirhemaksun-voi-kiistaa-poliisin-on-todistettava-kuka-oli-kuljettaja/)

**Operational anatomy of one order (Bahn's flow, with pain points)**
1. **Quote / feasibility.** Enter pickup and delivery addresses, get route availability, a fixed price and an ETA ([bahnexpress.fi](https://bahnexpress.fi)). *Pain:* the price is fixed before Bahn knows driver availability, return-leg options, ferry slots, the car's condition or EV charge level.
2. **Order intake.** Portal, API/webhooks, email, Excel, broker mail import ([bahnexpress.com](https://www.bahnexpress.com); [bundle](https://app.bahnexpress.fi)). *Pain:* messy free-text orders (VIN or plate, contact person, opening hours, keys location).
3. **Legal-to-drive prep.** Unregistered cars need transfer plates (Finnish koekilvet/siirtokilvet; German red plates via the driver's Gewerbe, eVB and POA) and insurance ([bahnexpress.fi](https://bahnexpress.fi); [bundle](https://app.bahnexpress.fi)). *Pain:* plates are physical objects that must be picked up and returned (PLATES_PICKUP, PLATE_RETURN_IMAGE), so plates become a second routing commodity.
4. **Driver matching.** An app marketplace with tiers, 180-min priority early access, and FIXED vs AUTO_INCREASE pay ([bundle](https://app.bahnexpress.fi)). Jobs drop "in big batches" ([Suomi24](https://keskustelu.suomi24.fi/t/19415536/bahn-express-oy-kokemuksia)). *Pain:* drivers cherry-pick, long or awkward legs stay unfilled, pay escalation is costly, and reliability varies.
5. **Reposition to pickup.** Domestic is self-paid or chained; cross-border uses reimbursed flights, buses, trains and ferries ([bahnexpress.fi/kuljettajat](https://bahnexpress.fi/kuljettajat)). *Pain:* this is the unpaid or empty part of the trip. In Finland it means VR trains and Matkahuolto/Onnibus coaches with sparse rural timetables.
6. **Pickup inspection.** About 10 photo slots, odometer, keys, CMR, damage photos ([bundle](https://app.bahnexpress.fi)). *Pain:* bad photos make damage claims unprovable. The windshield clause shows the photo *is* the contract ([ehdot](https://bahnexpress.fi/ehdot)).
7. **Transit.** Fuel or charging, tolls, ferries (Finnlines, Viking, Silja, Stena, Transfennica legs), hotels; expenses reconciled later ([bundle](https://app.bahnexpress.fi)). *Pain:* ferry timing dominates DE→FI lead time. EV range drops in winter. Receipts need checking.
8. **Delivery / PoD.** Photos, signed CMR (needed for the seller's VAT refund and for complaints), key handover, plate return ([bahnexpress.fi](https://bahnexpress.fi); [Kamux case](https://bahnexpress.fi/tarinat/kamux)). *Pain:* the recipient isn't present (waiting fees), and CMR signatures go missing.
9. **Settlement.** Customer invoice due in 7 days. Driver paid weekly via Truster. Carriers net 14/30/60 based on evidence quality ([ehdot](https://bahnexpress.fi/ehdot); [kuljetusliikkeet](https://bahnexpress.fi/kuljetusliikkeet)).
10. **Post-delivery tail.** Damage claims within 1 business day; accident cases with coverage checks; fines, congestion charges and parking notices weeks later; driver score and tier updates ([ehdot](https://bahnexpress.fi/ehdot); [bundle](https://app.bahnexpress.fi); [EVZ](https://www.evz.de/en/topics/transport/car/fines-abroad/congestion-charge-sweden/)).

### Inferences
- The binding constraint is **driver-hours lost to repositioning and waiting**, plus **lead-time reliability under a fixed price**. Each extra chained leg that turns a dead return into a paid move improves margin and driver pay at the same time. That is a rare win-win and a strong pitch.
- Cross-border driven imports likely cost more per car than truck slots (one driver, fuel, ferry, flight home, hotel vs about €170–525/car by truck). The product is the *time* saved. So the right objective for a demo is **cost per day of lead time saved**, not cost alone.
- Bahn's truck marketplace hints at an internal **mode-choice decision**: drive it, truck it, or ship it unaccompanied on ro-ro (the CARGO_PICKUP/DROPOFF enums). Each car needs a deadline-aware choice. This is a hard, high-value optimisation.
- Exception tails (damage, fines, cases) cost little per incident but scale linearly with volume and hit trust. They are the natural place for "verification-first" agents.

### Gaps
- No published utilisation numbers (paid km per driver-hour, share of chained trips, empty-reposition km) for Bahn or competitors.
- No data on Bahn's damage-claim rate or fine volume. These would need to come from Bahn at the hackathon.

---

## Q3. Competitors and analogues: what is still manual, and what have they automated or bragged about?

### Takeaway
Bahn's closest and most dangerous competitor is **Flovi** (formerly Biila), the Finnish incumbent. Flovi does about 160k transfers a year, raised €5M in 2026, and is expanding to Poland and Spain with "AI-based" positioning, but it is domestic-relocation-first. French players (Hiflow about 1,000 cars/day; Pop Valet about 2,500 convoyeurs) and UK Engineius show the mature driven-delivery model. Their public tech claims are booking portals, live tracking, photo audit trails and "chaining", and none publicly claims sophisticated multimodal driver optimisation. The most explicit AI bragging is from the US truck marketplace **RunBuggy**: "RunBot" claims to autonomously resolve 85% of orders and to have eliminated about 1,000 admin hours a month of ETA chasing.

### Cited Findings

**Nordic / Finland**
- **Flovi (formerly Biila, Vantaa):**
  - Founded 2008. CEO Aapeli Kallunki. Built its own tech from 2016. Acquired Saka's driving-logistics unit (about 100 drivers).
  - 2024: more than 100k transfers, 23M km, about €12M revenue. Average relocation in Finland takes 22 h.
  - Expansion: Poland (Oct 2025), target of 10 countries by 2028. €3.5M from Voland Partners in 2023.
  — [Tech.eu](https://tech.eu/2025/10/02/finnish-car-logistics-pioneer-flovi-rolls-into-poland/)
  - Spain is its 4th market (2026). It markets an "AI-based vehicle logistics automation platform" combining market demand data, route efficiency and journey tracking. 2025: more than 160k transfers and about 35M km. €5M round led by Nordea and Business Finland in early 2026. — [Invest in Spain](https://www.investinspain.org/en/noticias-main/2026/flovi)
  - Poland: more than 5,000 verified drivers in Europe and over 1,000 active in Poland. Licences are checked in real time against the CEPiK registry. Orders from different clients are combined to cut empty returns. "Order and forget." Pay per km actually driven. "We are the Uber for automotive." — [Antyweb](https://antyweb.pl/finscy-spece-od-relokacji-pojazdow-chca-podbic-polske-jestesmy-uberem-dla-automotive)
- SAKA appears as a customer pricing profile in Bahn's bundle, the same dealer whose in-house driving unit Flovi bought ([bundle](https://app.bahnexpress.fi)).

**France**
- **Hiflow:**
  - Site claims: 10,000 professional drivers available within 24 h across France; 50 partner truck carriers; more than 1,000 vehicles delivered per day; 300+ key accounts (Hertz, Ayvens, Stellantis &You, Drivalia, Fraikin, Autohero). Add-ons: handover, washing, EV charging, appointment booking, "smart return" to rental parks, W-garage plates. — [hiflow.com](https://www.hiflow.com/)
  - Jan 2025: 2024 results 25% above plan; Belgium and Spain each +62%; Italy entered in 2024. In Spain 95% of value is used cars delivered to homes. — [Journal de l'Automobile](https://journalauto.com/journal-des-flottes/convoyage-hiflow-tire-profit-de-son-internationalisation/)
  - Formed from Expedicar + LuckyLoc; €4M raised in 2019. — [L'Usine Digitale](https://www.usine-digitale.fr/article/expedicar-et-luckyloc-deviennent-hiflow-qui-leve-4-millions-d-euros.N857850)
  - Trustpilot about 4.5/5 on about 510 reviews. Recurring complaints: unreachable customer service and unexplained delays. — [Trustpilot](https://fr.trustpilot.com/review/hiflow.com/fr-fr)
- **Pop Valet:**
  - 2,500 convoyeurs and 50,000+ transports in 2022, per a 2023 article. — [Journal de l'Automobile](https://journalauto.com/services/pop-valet-met-sa-nouvelle-dimension-logistique-en-avant-avec-un-site-internet/)
  - €2.5M from IMA and MAIF Avenir. — [Journal de l'Automobile](https://journalauto.com/services/pop-valet-leve-25-millions-deuros-aupres-de-ima-et-maif/)
  - Independent convoyeurs do 80–90% of missions (search snippet of the same outlet). No Hiflow–Pop Valet merger found.

**UK**
- **Engineius (Birmingham, founded 2018):** 500+ trained drivers and agents managed in-house ([Tracxn](https://tracxn.com/d/companies/engineius/__3lZQXp8zp68c-7gmCjyGViBZrjmYkwgvZBh1sJMMb3U)). Booking takes about 30 s with a price up front. Every move has a full audit trail of photos, GPS and timestamps. DataClear wipes personal data from vehicles (Privacy4Cars). It markets "no chaser vehicles", implying drivers reposition by public transport. — [engineius.co.uk](https://www.engineius.co.uk/). The only disclosed investor is Ascot Capital Partners. — [Crunchbase](https://www.crunchbase.com/organization/engineius)

**US**
- **HopDrive:** dealer valet pickup and delivery, dispatched "in seconds" from a portal or the dealer's scheduler. Live GPS, automated two-way SMS, photo checks, digital signatures, geo-stamps. — [hopdrive.com](https://www.hopdrive.com/). $8M Series A in Jan 2023 led by Cox Enterprises. — [Richmond BizSense](https://richmondbizsense.com/2023/01/26/local-transportation-startup-pulls-in-8m-capital-raise/)
- **Draiver:** on-demand relocation platform (Overland Park, KS). Sued HopDrive for patent infringement in 2020 (per search summary). — [Crunchbase](https://www.crunchbase.com/organization/driverdo)
- **RunBuggy (truck-hauler marketplace):** RunBot "autonomously resolves 85% of orders", predicts delivery problems with 80% accuracy, recommends and contacts transporters, and uses LLMs to interpret requirements. A Jan 2026 post says RunBuggy eliminated "nearly 1,000 hours of monthly administrative work" by replacing manual ETA chasing. — [RunBuggy](https://runbuggy.com/artificial-intelligence-runbuggy-runbot/). $37M Series B in Sept 2025 (Centana) (search result). — [Techleap](https://finder.techleap.nl/news/feed/runbuggy-secures-37m-in-series-b-funding). It also reports AI voice agents for routine data collection (Jan 2026 press release, search summary). — [RunBuggy](https://runbuggy.com/haul-smarter-not-harder-with-ai-order-grouping/)
- **Montway (broker):** claims 100k+ vehicles a year. Real-time tracking via Ship.Cars. A planned GenAI chatbot on its tracking page was announced; I could not confirm it launched. — [IoT M2M Council](https://iotm2mcouncil.org/iot-library/news/smart-logistics-news/montway-adds-real-time-vehicle-shipment-tracking/)

**One-way relocation analogues (driver supply from travellers)**
- **Movacar (Berlin):** €1 one-way car and camper trips matched to vehicles rental firms need moved. Clients include Europcar, roadsurfer and Indie Campers. **Roadsurfer Rally:** €129 one-way van transfers, about 10,000 vehicles in 16 countries. — [Roadsurfer help](https://rent-help.roadsurfer.com/hc/en-us/articles/11434225522067-Roadsurfer-rally-what-is-it-and-how-can-I-participate); [Dealroom](https://app.dealroom.co/companies/movacar). Both EUROPCAR and ROAD_SURFER are pricing profiles in Bahn's bundle ([bundle](https://app.bahnexpress.fi)).

**Damage-inspection AI vendors (adjacent)**
- ProovStation (Lyon) builds AI inspection gantries. It raised €10.4M (2023), and logistics firm GCA contracted 30 stations. — [Tech.eu](https://tech.eu/2023/01/25/proovstation-raises-eur104-million-continues-to-scan-for-damage/); [Journal de l'Automobile](https://journalauto.com/services/le-logisticien-gca-va-deployer-proovstation-a-grande-echelle/)
- Tchek does AI inspection, partnered with fleet manager Fatec. — [Journal de l'Automobile](https://journalauto.com/journal-des-flottes/fatec-et-tchek-un-partenariat-qui-va-de-soi/)
- WeProov is used by convoyage firm Fullcar Services for condition reports (search snippet). — [auto-infos.fr](https://www.auto-infos.fr/convoyage/)

### Inferences
- **What is publicly automated across the sector:** instant quote, online booking, live tracking, photo audit trails, licence checks (Flovi with CEPiK; Bahn with model-graded onboarding), automated SMS, and order and dispatch recommendation (RunBuggy).
- **What still looks manual or weakly automated:**
  - multimodal return-leg planning and chaining across clients (only vaguely claimed);
  - fixed-price risk pricing;
  - post-delivery claims and fines;
  - exception comms ("customer service hard to reach", "unexplained delays" in Hiflow reviews; Bahn's "named person owns each order");
  - plates and paperwork logistics;
  - expense reconciliation.
- No competitor publicly brags about **solving the driver-as-passenger routing problem with transit timetables**. That makes it a differentiated demo theme. Flovi is the benchmark Bahn will be measured against in Finland.

### Gaps
- No engineering blogs found for Hiflow, Pop Valet, Engineius or Flovi describing their dispatch algorithms.
- No reliable 2025–2026 funding data for Hiflow or Pop Valet.
- The Draiver and HopDrive 2025 status is unclear (aggregator numbers conflict).

---

## Q4. What OR/academic literature applies, and could an LLM/agent loop plus a solver beat hand dispatching in a weekend demo?

### Takeaway
The directly relevant problem families are **operator-based relocation in one-way carsharing** (staff move cars and reposition by bike, foot, shuttle or carpool), the **pickup-and-delivery problem with transfers/transshipment (PDPT)**, and **multimodal routing with fixed public-transport timetables**. I found no paper that models exactly Bahn's case: freelance drivers who are the "vehicle" between jobs and ride GTFS transit, with cars as one-way requests, chaining, plates as secondary commodities, and fixed-price acceptance. That makes it publishable-novel and demo-novel. A weekend demo can plausibly beat greedy, human-style dispatch on a one-day Finnish instance using a time-expanded network over real timetables and a standard solver. An LLM is best used as a heuristic designer and verifier rather than as the solver itself.

### Cited Findings
- Bruglieri, Colorni & Luè: the relocation problem for one-way electric carsharing, where staff ("jockeys") move cars and reposition between jobs. — [arXiv 1307.7195](https://arxiv.org/pdf/1307.7195)
- Bruglieri et al. (2017, *Discrete Optimization*): E-VReP with operators on folding bikes; the profit objective is revenue per satisfied request minus cost per operator; the MILP is CPU-heavy, so they use four heuristics. A 2019 extension adds operator carpooling. — [Polimi repository](https://re.public.polimi.it/bitstream/11311/1049916/2/11311-1049916_Bruglieri.pdf); [Polimi](https://re.public.polimi.it/handle/11311/1049916)
- Heuristic algorithms for operator-based relocation in one-way e-carsharing. — [arXiv 1504.02163 record](https://discovery-imamu.kwaretech.com/EdsRecord/edsarx,edsarx.1504.02163/Details)
- Multi-objective jockey relocation (rejected demand, number of jockeys, jockey time), comparing NSGA-II and a memetic algorithm (2018). — [Journal of Modern Transportation](https://doaj.org/article/55747a308846437cad760852602c1746)
- Yard car reallocation with drivers plus shuttle vehicles, decomposed into driver routes and shuttle routes, with shift rules as side constraints. — [CNR IRIS](https://iris.cnr.it/handle/20.500.14243/306681)
- Survey of carsharing relocation algorithm archetypes (Prinz et al., 2024). — [SciTePress](https://scitepress.org/PublishedPapers/2024/127024)
- PDP with transshipment, MIP models (Rais, Alvelos & Carvalho, EJOR 2014). — [IDEAS/RePEc](https://ideas.repec.org/a/eee/ejores/v235y2014i3p530-539.html). ALNS for PDPT (Masson, Lehuédé & Péton, *Transportation Science*). — [HAL](https://hal.archives-ouvertes.fr/hal-00597066). Crowdsourced drivers in PDPT (Sampaio et al. 2020). — [EUR repository](https://repub.eur.nl/pub/131143). PDPT overview. — [arXiv 1803.03907](https://arxiv.org/pdf/1803.03907)
- VRP with transfers (*Computers & OR*, 2025). — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0305054825000085)
- Multimodal transport with ridesharing against a **fixed transit timetable** (rideshare↔transit matches at stations). — [arXiv 2106.00232](https://arxiv.org/pdf/2106.00232). Exact set packing for first/last-mile with transit. — [arXiv 2505.01989](https://arxiv.org/abs/2505.01989)
- Idle-vehicle repositioning with integrated transit transfers. — [ScienceDirect (TR-E)](https://www.sciencedirect.com/science/article/pii/S1366554518314790). PDPTW with scheduling on edges. — [arXiv 2511.07681](https://arxiv.org/html/2511.07681v1)
- Karpathy's "autoresearch" pattern: an agent edits a small codebase, runs a fixed short evaluation, keeps or reverts the change, and logs everything in git. Reported: about 700 experiments in 2 days and about 20 kept improvements (secondary sources). — [The New Stack](https://thenewstack.io/karpathy-autonomous-experiment-loop/); [Fortune](https://fortune.com/2026/03/17/andrej-karpathy-loop-autonomous-ai-agents-future/). LangChain's adaptation makes the agent code the editable asset under a fixed eval harness (secondary). — [Data Science Dojo](https://datasciencedojo.com/blog/karpathy-autoresearch-explained/)

### Inferences
- **Modelling recipe for a weekend:**
  - Build a time-expanded graph where nodes are (place, time). Arcs: (i) *paid car legs*, a driver moving an order car with a time window, using road time from OSRM or a speed table; (ii) *transit legs*, from the Digitransit itinerary API or Digitraffic train timetables; (iii) *waits*; (iv) optional *walk/taxi* legs with a cost.
  - Each driver is a path from home to home within a shift. Each order must be covered once.
  - The result is a set-partitioning / column-generation problem (price paths with a resource-constrained shortest path) or a CP-SAT / ALNS model.
  - Scale: 30–80 orders, 20–40 drivers, one day in southern Finland. Tractable with OR-Tools CP-SAT, PyVRP plus custom moves, or HiGHS on a path-based model.
- **Baseline to beat:** a "greedy marketplace" simulator in which each order is offered to the nearest willing driver and each driver goes home by the fastest transit after each job. This mirrors Bahn's batch-posted marketplace plus self-paid domestic returns. Expected wins: fewer unpaid transit-hours and dead returns, more chained pairs, a higher on-time rate.
- **Where the LLM adds non-trivial value:**
  - autoresearch-style evolution of the heuristic or operator code against a frozen benchmark of synthetic days, keeping only changes that cut cost without breaking feasibility;
  - translating dispatcher natural-language constraints ("Matti won't drive manuals", "dealer closes 17:00 Fridays") into checked solver constraints;
  - generating adversarial scenarios (train cancellations, a no-show, snow) for the simulator;
  - writing human-readable "proof cards" for each plan, with every leg cited to a timetable trip ID and a feasibility check, so a dispatcher can accept a plan without re-deriving it. This fits the builder's thesis about agent output outpacing human verification.

### Gaps
- No paper found that combines all of: freelance drivers as passengers on GTFS public transport, one-way car requests, chaining, and fixed-price acceptance.
- I did not open full texts. Paper characterisations come from abstracts and search summaries.

---

## Q5. What public data can a hackathon team use for a realistic demo?

### Takeaway
A Finland demo can be fully real-data: Digitransit's GraphQL routing (free key required), Digitraffic's open train API (no key), Digitraffic road data (no key) and Traficom's vehicle register open data (CSV, CC BY 4.0). EV charging data for Finland is the weak spot: NOBIL dropped Finland and Denmark, and Open Charge Map needs a key. Cross-border demos can model ferry timetables (Finnlines, Viking, Silja, Stena, Transfennica) by hand from public schedules.

### Cited Findings
- **Digitransit routing API v2 (GraphQL, POST only):**
  - Endpoints:
    - `https://api.digitransit.fi/routing/v2/hsl/gtfs/v1`
    - `https://api.digitransit.fi/routing/v2/waltti/gtfs/v1`
    - `https://api.digitransit.fi/routing/v2/finland/gtfs/v1` (Finland and Estonia)
    - `https://api.digitransit.fi/routing/v2/varely/gtfs/v1`
  - Registration and an API key are required. — [Digitransit routing docs](https://digitransit.fi/en/developers/apis/1-routing-api/); [Digitransit developers](https://digitransit.fi/en/developers/)
  - I verified that calling the finland endpoint without a key returns HTTP 401.
  - Other Digitransit APIs: geocoding, map tiles, realtime (GTFS-RT trip updates, vehicle positions, MQTT). — [Digitransit developers](https://digitransit.fi/en/developers/)
- **Which operators are in the national feed:** Traficom says supplying market-based (commercial) route data to matka.fi is voluntary and not all such operators do. Fintraffic supplies route data to Digitransit. Matkahuolto and VR run their own Digitransit/OTP deployments. — [Traficom](https://static.traficom.fi/en/transport/liikennejarjestelma/public-transport-information-services); [OTP deployments](https://docs.opentripplanner.org/en/latest/Deployments/). Whether Onnibus is in the feed is **unverified**. Check with GraphQL `{feeds{feedId agencies{name}}}` once a key is obtained.
- **Digitraffic rail (Fintraffic):** `rata.digitraffic.fi/api/v1/live-trains/...` works with no key. It requires `Accept-Encoding: gzip`, and a `Digitraffic-User` header is recommended. I verified it returns live VR trains (e.g. PYO 266 ROI→HKI). Digitraffic road TMS stations also return HTTP 200 with no key. (My own curl test, 2026-10-24.)
- **Traficom vehicle open data:** registration, approval and technical data for all vehicles in traffic. ZIP-packed CSV, about 930 MB unpacked, CC BY 4.0; latest listed version is dated 30.9.2025. — [avoindata.fi](https://avoindata.suomi.fi/data/en/dataset/ajoneuvojen-avoin-data/resource/00041d67-966e-48cf-a720-255faf09d55c). Useful for realistic make, model and powertrain mixes and EV share (no plates in the open data, per Traficom's FAQ). — [Traficom open data](https://tieto.traficom.fi/en/open-data)
- **Charging data:** NOBIL now covers only Norway and Sweden (CC-BY, key required). — [OSM wiki](https://wiki.OpenStreetMap.org/wiki/Import/Catalogue/Nordic_Charging_Station_Import); [OCM forum](https://community.openchargemap.org/t/nobil-dropps-support-for-all-countries-except-sweden-and-norway/1788). Open Charge Map API returned HTTP 403 without a key in my test. latauskartta.fi is suggested as the Finnish source.
- **Fines and tolls rules for realistic "late liability" scenarios:** Swedish congestion tax for foreign vehicles is billed via EPASS24 with a SEK 500 late fee ([Transportstyrelsen](https://www.transportstyrelsen.se/en/road/road-tolls/congestion-taxes-in-stockholm-and-goteborg/); [EVZ](https://www.evz.de/en/topics/transport/car/fines-abroad/congestion-charge-sweden/)). Finnish liikennevirhemaksu owner liability is lifted by naming the driver ([Kaleva](https://www.kaleva.fi/poliisi-yrityksilla-ja-yhteisoilla-on-puutteellise/2767863)).

### Inferences
- Realistic demo dataset: synthetic but plausible orders built from Kamux, K-Auto, Veho, Hedin and Länsiauto locations (dealer addresses are public) plus the import corridor (ferry ports Helsinki, Turku, Naantali, Hanko). Driver home locations sampled around university towns (Bahn's drivers are mostly students). Real Digitransit or Digitraffic timetables for the reposition legs. Traficom data sets the EV share (affects range and charging stops).
- Get the Digitransit key at the start of the hackathon. Key-less fallback: Digitraffic rail plus a hand-built coach table.

### Gaps
- Exact Matkahuolto and Onnibus coverage in Digitransit's finland router is unconfirmed.
- No open Finnish real-time charger availability API confirmed.
- Ferry timetables need manual entry; no single open API was found.

---

## Q6. What might Bahn's challenge brief be, and what non-trivial solution angles fit each?

### Takeaway
The brief is most likely about one of four pressure points visible in Bahn's code and public material:
- **dispatch and chaining at scale**: driver supply, pay escalation, return legs;
- **ops exception load per employee**: one named person per order, claims, fines, comms;
- **evidence and trust**: photos, CMR, damage disputes, driver fraud;
- **fixed-price quoting and mode choice**: driven vs truck vs ro-ro, cross-border.

The strongest non-trivial angle for any of them is verification-first: agents and solvers produce plans, messages or decisions *with machine-checkable evidence*, and a simulator or verifier gates them, so humans review only the exceptions. This matches the builder's thesis that agent output now outruns human verification capacity.

### Cited Findings (evidence anchors for the hypotheses)
- Domestic trip chaining instead of paid returns. Cross-border trips use reimbursed flights, ferries and hotels. — [bahnexpress.fi/kuljettajat](https://bahnexpress.fi/kuljettajat)
- Driver complaints: self-paid tickets home, low effective hourly pay, jobs dropped in batches, slow support. — [Suomi24](https://keskustelu.suomi24.fi/t/19415536/bahn-express-oy-kokemuksia)
- Gig pay FIXED vs AUTO_INCREASE; tiered early access; gig points; warnings. — [bundle](https://app.bahnexpress.fi)
- "A named Bahn person owns each order", "contacts you about delays", handles damage via photo records. — [bahnexpress.com](https://www.bahnexpress.com)
- Damage rules: windshield only if the pickup photo proves it; 1-business-day claim window; customer burden of proof. — [bahnexpress.fi/ehdot](https://bahnexpress.fi/ehdot)
- Carrier payment terms tied to evidence completeness (net 14/30/60). — [bahnexpress.fi/kuljetusliikkeet](https://bahnexpress.fi/kuljetusliikkeet)
- LLM-graded onboarding (MODEL_OUTPUT_INCOMPLETE); German Gewerbe and red-plate pipeline; FRANCE_LAUNCH profile. — [bundle](https://app.bahnexpress.fi)
- Expense ledger with reconciliation states; ferry and cargo routing modes; BROKER_MAIL order import. — [bundle](https://app.bahnexpress.fi)
- Late liabilities: Swedish congestion tax via EPASS24; Finnish owner liability for camera fines. — [EVZ](https://www.evz.de/en/topics/transport/car/fines-abroad/congestion-charge-sweden/); [Kaleva](https://www.kaleva.fi/poliisi-yrityksilla-ja-yhteisoilla-on-puutteellise/2767863)
- Competitor AI framing: RunBuggy automates ETA chasing (about 1,000 h/month) and "85% of orders" ([RunBuggy](https://runbuggy.com/artificial-intelligence-runbuggy-runbot/)); Flovi's "AI-based" platform ([Invest in Spain](https://www.investinspain.org/en/noticias-main/2026/flovi)).
- Growth pressure: claimed 20% MoM with about 30 staff. — [bahnexpress.com/careers](https://www.bahnexpress.com/careers); [Startbase](https://www.startbase.com/news/bahn-express-sichert-sich-e5-millionen-zur-europaweiten-expansion/)

### Inferences: 14 brief hypotheses with non-trivial solution angles

1. **"Chain our drivers: cut dead returns."** (Most likely, given the domestic chaining model and driver complaints.)
   - *Angle:* time-expanded multimodal driver routing over real Digitransit/Digitraffic timetables (paid car legs + transit legs + waits), solved with CP-SAT/ALNS. Compare against a greedy-marketplace simulator of today's process. Live demo: "today's dispatch: 41 unpaid transit-hours, 9 dead returns → ours: 17 h, 2", with each driver's day rendered as a timeline.
   - *Autoresearch twist:* an agent iteratively edits the heuristic (destroy/repair operators, tie-breaks) against a frozen 20-day benchmark and keeps only strict improvements. Show the git log of 100 overnight experiments.
   - *Verification:* every itinerary leg cites a timetable trip ID, and a separate checker replays it.

2. **"Price fixed quotes without losing money."**
   - *Angle:* simulation-based quoting. For each quote, Monte Carlo-dispatch it into the predicted order book (driver availability, chain probability, ferry slot, empty-pickup risk) to get a cost distribution, then price at a target percentile.
   - *Self-improving:* the LLM proposes new cost features or hypotheses, a backtest on held-out orders keeps those that reduce margin error, and calibration plots show it.
   - *Bonus:* explain each price as a cost breakdown. This links to the CUSTOMER_DELIVERY, SAME_DAY and EMPTY_PICKUP fee types.

3. **"Win damage disputes / stop paying unprovable claims."**
   - *Angle:* before/after photo pairing per slot (SIDE, WINDSHIELD, RIMS, ODOMETER…). A vision model must output each claimed difference *with crops and coordinates*. A second adversarial model tries to refute it ("lighting/reflection", "same scratch visible at pickup"). Only surviving contested items reach a human.
   - *Prevention:* real-time pickup-photo QA in the driver app ("windshield photo too dark to prove no crack — retake"). This applies the ehdot windshield clause directly.
   - *Eval:* synthetic damage injection on real car photos measures precision and recall.

4. **"Fines, tolls and congestion charges that arrive weeks later."**
   - *Angle:* an agent ingests scanned letters and emails (FI/SE/DE/DK), extracts plate, time and place, and joins them against trip GPS and stage timestamps to find who had the car. It drafts a driver nomination (Finnish oikaisuvaatimus, German Anhörungsbogen) or a recharge via Truster, plus customer pass-through.
   - *Verification-first:* each output is a "chain-of-custody proof" (GPS point ±N min, stage photo timestamp). The agent abstains when the evidence is ambiguous.
   - *Demo:* a pile of 50 synthetic notices cleared in 2 minutes, with 3 escalations explained.

5. **"Fill gigs faster and cheaper" (driver supply / pay escalation policy).**
   - *Angle:* an agent-based marketplace simulator with heterogeneous drivers (reservation wage, home location, student schedule, tier) calibrated on accept/decline logs. Search escalation curves (AUTO_INCREASE), early-access windows and batch-release timing to minimise pay spend subject to a fill-time SLA.
   - *Autoresearch:* the agent mutates the policy code; the simulator scores it; the kept policies show Pareto plots of cost vs fill time.

6. **"One ops person per 10× more orders" (exception-only cockpit).**
   - *Angle:* agents draft every customer and driver message (delays, ETAs, missing CMR). Each message carries assertions (ETA computed from GPS plus timetable, cause linked to an event), and a verifier blocks unsupported claims. Humans see a risk-ranked queue, not a chat firehose.
   - *Metric:* the share of messages auto-sent with zero verifier violations, and minutes of human attention per order.
   - Competitor anchor: RunBuggy's 1,000 h/month of ETA chasing.

7. **"Launch a new country in weeks" (Germany or France onboarding compliance).**
   - *Angle:* a "rulebook compiler" agent turns regulations and process docs (Gewerbe, red plates, eVB, POA, French W-garage plates) into an executable state machine with test cases. An adversarial generator produces forged or edge-case documents to measure the onboarding verifier's robustness. Bahn already uses model grading (MODEL_OUTPUT_INCOMPLETE), so the hackathon value is measuring and hardening it.

8. **"Drive, truck, or ship it?" (mode choice for imports).**
   - *Angle:* per-car, deadline-aware mode selection: driven direct; driven + ferry (Travemünde–Helsinki, Kapellskär, Stockholm); unaccompanied ro-ro cargo with drivers at both ends; or a 7–8-car truck load from the carrier marketplace.
   - Solve as a joint assignment and bin-packing problem with value-of-time per dealer (depreciation per day). Output savings vs an all-driven or all-truck baseline.

9. **"EV moves without dead batteries."**
   - *Angle:* an energy-aware routing simulation (temperature-dependent consumption, charger stops, required SoC at handover), integrated into chaining (charging time becomes a resource). Verify against charger datasets (NOBIL for SE/NO, latauskartta for FI).

10. **"Order intake from email/Excel/broker mail with zero typos."**
    - *Angle:* extraction agent plus self-verification against structured sources (VIN check digit, Traficom make and model consistency, address geocoding via Digitransit, dealer opening hours). Confidence-gated auto-booking. A synthetic messy-email generator serves as the eval set. Show the auto-book rate at 0 errors on held-out data.

11. **"Trust scores for drivers" (quality and fraud).**
    - *Angle:* explainable anomaly detection over trips: detour vs planned route, odometer delta vs distance, fuel receipts vs expected consumption, photo metadata vs GPS. Feed it into the existing tier score with *evidence lists*, not opaque scores. Red-team with simulated fraud patterns (the FRAUD_OR_THEFT and IDENTITY_FRAUD enums exist).

12. **"Reconcile driver expenses automatically."**
    - *Angle:* match receipts (fuel, charging, ferry, train, hotel, parking) to trip plans and expected costs. Auto-approve when within tolerance, and otherwise produce a ranked discrepancy explanation. This matches the PENDING/RECONCILED/EXPIRED ledger.

13. **"Plates are a second fleet" (transfer-plate logistics).**
    - *Angle:* treat plate sets as commodities in the routing model (plate pickup and return images, CONTINUE_WITH_SAME_PLATES, FROM_ANOTHER_DRIVER). Chain plate hand-offs between drivers to avoid office round-trips. This is a PDP-with-transfers instance, and novel in a demo.

14. **"Prove our value to dealers" (sales tool).**
    - *Angle:* an agent ingests a dealer's stock list and computes, by simulation, days saved × depreciation × capital cost × sell-through uplift. It generates an auditable ROI report, a verified version of the site's €30,808/yr calculator.

**Cross-cutting "mind-blowing" demo pattern**
- Show a **live counterfactual**: the same day of orders run (a) as Bahn does it today (greedy marketplace plus human comms) and (b) by solver plus agents. Then show (c) the autoresearch log that produced the heuristic overnight, and (d) a verifier dashboard showing *zero unverified claims* reached a human. Each AI output is accompanied by its proof, which is the builder's "agents outproduce human verification" thesis made concrete.

### Gaps
- The actual brief is unknown until the opening ceremony (`list_challenges` returned `revealed: false` on 2026-10-24).
- Bahn's internal data (order logs, accept/decline, claims, fines) is not public. Any demo needs synthetic data or data Bahn provides at the event.
