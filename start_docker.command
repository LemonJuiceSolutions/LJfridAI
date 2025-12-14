#!/bin/bash
cd "$(dirname "$0")"
echo "Starting application with Docker..."
docker-compose up --build
