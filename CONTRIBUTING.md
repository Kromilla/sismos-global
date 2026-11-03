# Contributing to Sismos Global

Thanks for your interest! Issues and PRs are welcome in English or Spanish.

## Setup

```bash
npm install
npm run dev
```

## Before opening a PR

```bash
npm run lint
npx tsc -b
npm test
npm run build
```

CI runs the same steps on every pull request.

## Guidelines

- Scientific code lives in `src/science/` and has no external math dependencies. Any new model
  must cite its source (paper or agency documentation) in a comment and come with tests in a
  `*.test.ts` file that check reference values.
- Data sources live in `src/data/`. New FDSN networks go through `fdsn.ts`.
- Never present output as an earthquake _prediction_; it is probabilistic forecasting.
- Keep PRs small and focused. Look for issues labeled
  [good first issue](https://github.com/Kromilla/sismos-global/labels/good%20first%20issue).
