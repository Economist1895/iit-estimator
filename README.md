# Singapore Income Tax Estimator (YA 2026)

A lightweight, client-side web tool for estimating personal income tax for Singapore tax residents, for the Year of Assessment 2026.

No data is sent to any server. Everything runs in the browser.

## Features

- **Multiple income sources** — employment (annual or monthly), rental, trade/business, and other taxable income
- **CPF Relief calculator** — auto-estimates employee CPF contributions based on salary and age group, with OW/AW ceiling logic
- **Full personal relief breakdown** — EIR, spouse, QCR/HCR, WMCR, parent, grandparent caregiver, sibling disability, life insurance, CPF top-up, SRS, and NSman reliefs
- **Parenthood Tax Rebate (PTR)** — applied directly against tax payable, with carryforward tracking
- **Progressive tax breakdown** — shows exactly how much tax falls in each bracket
- **GIRO instalment estimate** — calculates monthly GIRO amount based on the $20 minimum instalment rule

## Usage

1. Clone or download the repository
2. Place `index.html`, `app.js`, and `logo.png` in the same folder
3. Open `index.html` in any modern browser — no build step or server required

## Disclaimer

This tool is for **estimation purposes only**. It is not affiliated with or endorsed by IRAS. Tax rules are based on publicly available IRAS guidelines for YA 2026. Always verify your eligibility for reliefs and confirm your actual tax payable via [MyTax Portal](https://mytax.iras.gov.sg).

## License

MIT
