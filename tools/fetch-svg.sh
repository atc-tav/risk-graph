#!/usr/bin/env bash
# Fetches the per-territory + sea SVG outline source files from
# github.com/raddrick/risk-map-svg (MIT-adapted from Wikimedia's CC
# File:Risk_board.svg) into tools/svgsrc/, for tools/import-svg.mjs to parse.
# These third-party files are gitignored; we commit only the derived
# data/shapes.json. Run from the repo root:  bash tools/fetch-svg.sh
set -euo pipefail
base="https://raw.githubusercontent.com/raddrick/risk-map-svg/master/src"
mkdir -p tools/svgsrc
files="countries/af/congo countries/af/east countries/af/egypt countries/af/madagascar countries/af/north countries/af/south countries/as/afganistan countries/as/china countries/as/india countries/as/irkutsk countries/as/japan countries/as/kamchatka countries/as/middle countries/as/mongolia countries/as/siam countries/as/siberia countries/as/ural countries/as/yakutsk countries/au/east countries/au/guinea countries/au/indonesia countries/au/papua countries/au/west countries/eu/britian countries/eu/iceland countries/eu/north countries/eu/scandinavia countries/eu/south countries/eu/ukraine countries/eu/west countries/na/alaska countries/na/alberta countries/na/central countries/na/east countries/na/greenland countries/na/northwest countries/na/ontario countries/na/quebec countries/na/west countries/sa/argentina countries/sa/brazil countries/sa/peru countries/sa/venezuela seas/black seas/dead seas/great seas/mediterranean"
n=0
for f in $files; do
  safe=$(echo "$f" | tr '/' '_')
  curl -sS --max-time 30 "$base/$f.js" -o "tools/svgsrc/$safe.js" && n=$((n+1))
done
echo "fetched $n files into tools/svgsrc/"
