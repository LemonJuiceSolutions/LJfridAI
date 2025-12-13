#!/bin/bash
cd "$(dirname "$0")"
(sleep 3 && open http://localhost:9002) &
npm run dev
