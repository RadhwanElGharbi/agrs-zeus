# AGRS ZEUS

Native Linux application for Artemis Global Research Solutions Inc.

## Build

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake git
./scripts/bootstrap.sh
```

## Run

```bash
zeus --help
```

Config defaults are read from `config/default.json` (dev runs). XDG config path `~/.config/agrs-zeus/config.json` and `/etc/agrs-zeus/config.json` are also supported.

Logs default to `~/.local/state/agrs-zeus/logs` unless overridden.
