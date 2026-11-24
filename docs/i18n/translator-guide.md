# Translator guide

## 1. File format and key conventions
- Use flat message keys in the shape `namespace.component.element`.
- Never translate the key names themselves; only translate the values.
- To find untranslated entries, look for values ending in `_TODO` or values that exactly match the English text in a non-English file.

## 2. ICU message format reference
- Variables use the shape `{name}`. Keep the variable name inside the braces unchanged.
- Plurals use ICU syntax such as `{count, plural, one {# item} other {# items}}`.
- Select messages use syntax such as `{gender, select, male {He} female {She} other {They}}`.
- Number and date formatting skeletons such as `{amount, number, ::currency/USD}` control formatting and should not be translated.
- Arabic has six plural categories: `zero`, `one`, `two`, `few`, `many`, and `other`.

## 3. What not to translate
- Content inside `{}` such as variable names, plural keywords, and format skeletons.
- HTML tags if they appear in the message string.
- Brand names, product names, and proper nouns such as Veritasor, Stellar, and API.
- Units and currency codes such as USD, km, and MB.

## 4. RTL notes
- RTL languages such as Arabic read right-to-left. The app mirrors layout through `document.dir`; translators do not need to insert RTL formatting characters.
- Use mirrored punctuation where appropriate.
- Arabic numeric style in this app uses Arabic-Indic digits for locale formatting when the locale is set to Arabic.

## 5. Adding a new language
1. Add the locale to `SUPPORTED_LOCALES` in `src/i18n/config.ts`.
2. Copy `src/i18n/messages/en.json` to `src/i18n/messages/<code>.json`.
3. Translate each value, leaving `_TODO` on any untranslated key.
4. Run `npm run i18n:check` to verify every key from English is present in the new locale file.
5. Submit a PR; CI will block merge if any locale file is missing a key.

## 6. Testing translations
- Switch to a locale in development by using the locale picker or by running `localStorage.setItem('preferred-locale', 'es')` in the browser console and reloading.
- Watch for overflowing text, clipped labels, or broken RTL layout.

## 7. Key namespaces

The following namespaces are used for page-level copy. All keys follow the `namespace.component.element` convention.

| Namespace | Page / component |
|---|---|
| `dashboard.*` | `src/pages/Dashboard.tsx` — heading, subtitle, metric labels, quick-action labels, usage section heading, refresh button |
| `attestations.*` | `src/pages/Attestations.tsx` — heading, subtitle, tab labels, empty state, chart controls, table headers, pagination, status badges, timeline rows |
| `revenueSources.*` | `src/pages/RevenueSources.tsx` — heading, subtitle, status badges, last-sync label, expired-token banner, disconnect dialog, relative time strings, row and button aria-labels |

Sub-namespaces within each page namespace:

- `dashboard.metrics.*` — individual metric card labels and sub-labels
- `dashboard.usage.*` — usage meter labels (Attestations, API calls)
- `dashboard.quickActions.*` — quick-action labels and the connect-source link aria-label
- `dashboard.toast.*` — attestation submission / failure toast messages
- `dashboard.demoNote` — demo-build sample-data note appended to the subtitle
- `attestations.chart.*` — trend chart headings, table captions, column headers, bar details, SVG title
- `attestations.empty.*` — empty state heading, description, CTA, tip
- `attestations.pagination.*` — previous/next buttons and page info
- `attestations.status.*` — status badge labels (Verified, Pending, Failed)
- `attestations.tab.*` — Overview and Schedule tab labels
- `attestations.schedule.*` — upcoming runs, empty state, run/rule summaries, delete announcement, Edit/Delete buttons
- `attestations.search.*` — search placeholder and singular entity noun
- `attestations.aria.*` — landmark aria-labels (empty state, activity trend, history table/figure, sections, runs, pagination, saved schedules)
- `attestations.timeline.*` — timeline row aria-label (status + date)
- `attestations.toast.*` — attestation submission / failure toast messages
- `revenueSources.status.*` — health badge labels (Healthy, Warning, Error)
- `revenueSources.dialog.*` — disconnect confirmation dialog copy (title, description, placeholder, next-run label)
- `revenueSources.expiredToken.*` — expired-token banner copy
- `revenueSources.relativeTime.*` — relative time strings (today, days ago, overdue, tomorrow, in-days plural)
- `revenueSources.aria.*` — empty-state and list aria-labels
- `revenueSources.healthStatusAria` — health-status badge aria-label
- `revenueSources.toast.*` — disconnect/reconnect toast messages
- `revenueSources.error.*` — reorder-failure error message
