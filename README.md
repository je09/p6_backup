# P6 Backup Tool

A desktop application for backing up and restoring patterns and samples on the Roland P-6 synthesizer.

## Features

- **Pattern backup & restore** — export and import pattern files (`.PRM`) over USB
- **Sample backup & restore** — back up sample banks tied to the patterns you select
- **Pattern-centric workflow** — select patterns and the tool automatically determines which sample pads to include
- **Step-by-step guidance** — in-app instructions walk you through each device mode switch
- **Backup management** — browse, name, and restore from previous backup sessions
- **Batch processing** — handles the P-6's 10 MB per-session transfer limit automatically

## Requirements

- macOS (Apple Silicon or Intel), Windows, or Linux
- Node.js 20+
- Roland P-6 connected via USB

## Install & Run

```bash
npm install
npm run build
npm start
```

## Development

```bash
npm run dev        # start dev server with hot reload
npm run test       # run tests
npm run lint       # lint TypeScript
```

## Package

```bash
npm run package:mac   # build macOS DMG + ZIP
npm run package:win   # build Windows installer
```

## License

MIT
