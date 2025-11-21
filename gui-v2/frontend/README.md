# AGRS ZEUS GUI v2 - Frontend

Enterprise-grade desktop application built with Electron, React, and Next.js.

## Tech Stack

- **Electron**: Native desktop wrapper
- **React 18**: UI framework
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Mapbox GL JS**: Interactive mapping
- **shadcn/ui**: Component library

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Mapbox access token (free tier available at https://www.mapbox.com)

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Add your Mapbox token to .env
```

### Development

```bash
# Start development server (Next.js + Electron)
npm run dev

# This will:
# 1. Start Next.js dev server on http://localhost:3000
# 2. Launch Electron window
# 3. Auto-start FastAPI backend
```

### Building

```bash
# Build Next.js app
npm run build

# Package as native executable
npm run electron-pack

# Output will be in dist/
```

## Project Structure

```
frontend/
├── electron/           # Electron main and preload scripts
│   ├── main.js        # Main process
│   └── preload.js     # Preload script (IPC bridge)
├── src/
│   ├── app/           # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/    # React components
│   │   ├── ui/        # shadcn/ui components
│   │   ├── layout/    # Layout components (Sidebar, Header)
│   │   └── Map/       # Map components
│   ├── lib/           # Utilities
│   │   ├── utils.ts
│   │   └── api-client.ts
│   └── types/         # TypeScript types
├── public/            # Static assets
└── package.json
```

## Features

### Current (v2.0.0)

- ✅ Enterprise dark theme UI
- ✅ Collapsible sidebar navigation
- ✅ Interactive Mapbox GL JS map
- ✅ Backend API integration
- ✅ Native desktop executable

### Planned

- [ ] Authentication
- [ ] Project management
- [ ] Dataset visualization
- [ ] PIRL training interface
- [ ] Real-time updates
- [ ] 3D terrain visualization

## Configuration

### Mapbox Token

1. Sign up at https://www.mapbox.com
2. Create an access token
3. Add to `.env`:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
   ```

### API Endpoint

Default: `http://localhost:8000/api`

To change, update `.env`:
```
NEXT_PUBLIC_API_URL=http://your-api-url/api
```

## Development Tips

### Hot Reload

Next.js supports hot module replacement (HMR). Changes to React components will update automatically without restarting Electron.

### DevTools

Electron DevTools open automatically in development mode. Press `Ctrl+Shift+I` to toggle.

### Backend Connection

The Electron app automatically starts the FastAPI backend on launch. Check the terminal for backend logs.

## Troubleshooting

### Map not loading

- Verify your Mapbox token in `.env`
- Check browser console for errors
- Ensure internet connection (Mapbox requires network access)

### Backend not starting

- Verify Python 3.11+ is installed
- Check that FastAPI dependencies are installed in `../backend/`
- Look for backend errors in terminal

### Build failures

- Clear Next.js cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check Node.js version: `node --version` (should be 18+)

## License

Proprietary - Artemis Global Research Solutions Inc.

