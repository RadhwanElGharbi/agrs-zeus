# Project Scripts - UAE-PIPELINE

This directory contains project-specific scripts for data fetching, processing, and validation.

## Script Categories

### Data Fetching (`fetch_*.sh`)
Scripts for acquiring datasets from external sources.

### Processing (`process_*.sh`)
Scripts for geoprocessing operations (reprojection, clipping, mosaicking).

### Validation (`validate_*.py`)
Scripts for validating dataset quality and compliance.

## Usage

All scripts should be run from the project root directory:

```bash
cd /opt/agrs/Projects/UAE-PIPELINE
./scripts/fetch_example.sh
```

## Notes

- Document all scripts with usage instructions
- Log all operations to `logs/` directory
- Follow the AGRS coding standards
